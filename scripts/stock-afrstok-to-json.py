#!/usr/bin/env python3
"""
"AFR Stok" Excel'i → stok JSON'u + fotoğraflar.

18.11.2026 kararı: güncel stok, Drive'daki "AFR Stok" dosyasıdır (eski stok
programı değil). Dosyada İKİ stok var:
  • "Market212 Stok" sayfası — Market 212'nin stoğu, beden beden; yanında aynı
    ürünün AFR adedi (bilgi için kopya).
  • Kategori sayfaları (ArtOfAnatolia, Shirts&Top, … Home) — AFR stoğunun
    dökümü: barkod, malzeme no, kod, beden beden adet, fiyat.
Bu betik yalnız OKUR ve sade bir JSON yazar; panele yazan betik
`stock-import-afrstok.ts`.

    python3 scripts/stock-afrstok-to-json.py "~/Downloads/AFR Stok.xlsx"
    →  ~/Downloads/af-afrstok.json  +  ~/Downloads/af-afrstok-foto/

Excel 230 MB (403 gömülü fotoğraf); hücreler read_only kipte okunur, fotoğraflar
zip'ten satırına göre ayrıca çıkarılır (her satırın Image/Photo hücresinde tek
resim). Sütun numarası VARSAYILMAZ — başlık aranır:
  • Market212 sayfası: "MARKET 212" ve "AFR" toplam sütunları; beden blokları
    bunların hemen solundaki beden başlıklı sütunlardır.
  • Kategori sayfası: "Barkod" ve "Total" olan sayfa; beden bloğu "Total"in
    solundadır (şapkada S·M·One Size, ayakkabıda 35–40, çantada One size).
Üretim / upcycle / bestseller sayfaları stok DEĞİLDİR, atlanır.
JSON ve fotoğraflar repoya GİRMEZ (İndirilenler'de kalır). Maliyet sütunu
okunur ama panele yazılmaz.
"""
import datetime
import json
import os
import posixpath
import re
import shutil
import sys
import xml.etree.ElementTree as ET
import zipfile

import openpyxl

LABELS = {"XXS", "XS", "S", "M", "L", "XL", "XXL", "ONE SIZE"}
NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}


def text(v):
    return re.sub(r"\s+", " ", str(v if v is not None else "")).strip()


def ident(v):
    """Barkod / malzeme no: 35011782.0 → "35011782"."""
    if isinstance(v, float) and v == int(v):
        return str(int(v))
    return text(v)


def size_label(v):
    """Başlık hücresi → beden etiketi (değilse None). 36.0 → "36"."""
    t = text(v).upper()
    if t in LABELS:
        return t
    if re.fullmatch(r"\d{2}(\.0)?", t):
        return t[:2]
    return None


def number(v):
    try:
        return int(round(float(v)))
    except (TypeError, ValueError):
        return 0


def money(v):
    """28850.0 · "28.850.00" · "3.531,00 TRY" → sayı; okunamayan → None."""
    if isinstance(v, (int, float)):
        return float(v)
    t = text(v).upper().replace("TRY", "").replace("TL", "").replace("₺", "").strip()
    if not t or not re.search(r"\d", t) or re.search(r"[^0-9.,\s]", t):
        return None
    t = t.replace(" ", "")
    if "," in t:  # 3.531,00 — nokta binlik, virgül ondalık
        t = t.replace(".", "").replace(",", ".")
    elif t.count(".") > 1:  # 28.850.00 — son nokta ondalık
        head, tail = t.rsplit(".", 1)
        t = head.replace(".", "") + "." + tail
    try:
        return float(t)
    except ValueError:
        return None


def code_of(v):
    """Kod hücresi: satır sonu ve fazla boşluk atılır; "KODU YOK" boş sayılır."""
    t = text(v)
    if not t or t.upper() in ("KODU YOK", "YOK", "-", "—"):
        return ""
    return t[:60]


def block(header, total_col, stop_col):
    """total_col'un solundaki beden başlıklı sütunlar → [(sütun, beden)]."""
    cols = []
    j = total_col - 1
    while j > stop_col:
        lab = size_label(header[j])
        if lab is None:
            break
        cols.append((j, lab))
        j -= 1
    cols.reverse()
    return cols


def sheet_images(z):
    """Sayfa adı → {(satır, sütun): zip içindeki resim yolu} (1'den başlar)."""
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    names = set(z.namelist())
    out = {}
    for s in wb.find("m:sheets", NS):
        spath = posixpath.normpath(posixpath.join("xl", rels[s.get("{%s}id" % NS["r"])]))
        relp = posixpath.join(posixpath.dirname(spath), "_rels", posixpath.basename(spath) + ".rels")
        cells = {}
        if relp in names:
            for r in ET.fromstring(z.read(relp)):
                if not r.get("Type").endswith("/drawing"):
                    continue
                dpath = posixpath.normpath(posixpath.join(posixpath.dirname(spath), r.get("Target")))
                drel = posixpath.join(posixpath.dirname(dpath), "_rels", posixpath.basename(dpath) + ".rels")
                if drel not in names:
                    continue
                targets = {x.get("Id"): x.get("Target") for x in ET.fromstring(z.read(drel))}
                for a in ET.fromstring(z.read(dpath)):
                    fr, blip = a.find("xdr:from", NS), a.find(".//a:blip", NS)
                    if fr is None or blip is None:
                        continue
                    media = posixpath.normpath(posixpath.join(
                        posixpath.dirname(dpath), targets.get(blip.get("{%s}embed" % NS["r"]), "")))
                    if media in names:
                        cells[(int(fr.find("xdr:row", NS).text) + 1, int(fr.find("xdr:col", NS).text) + 1)] = media
        out[s.get("name")] = cells
    return out


def main():
    src = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else "~/Downloads/AFR Stok.xlsx")
    out = os.path.expanduser(sys.argv[2] if len(sys.argv) > 2 else "~/Downloads/af-afrstok.json")
    photo_dir = os.path.splitext(out)[0] + "-foto"
    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    z = zipfile.ZipFile(src)
    images = sheet_images(z)
    rows, sheets, used = [], [], set()

    for ws in wb.worksheets:
        data = list(ws.iter_rows(values_only=True))
        if not data:
            sheets.append({"sayfa": ws.title, "atlandi": "boş"})
            continue
        header = list(data[0])
        low = [text(c).lower() for c in header]
        col = lambda *names: next((i for i, h in enumerate(low) if h in names), None)
        pics = images.get(ws.title, {})

        m_col, a_col = col("market 212"), col("afr")
        barcode_col, total_col = col("barkod"), col("total")
        if m_col is not None and a_col is not None:
            kind = "m212"
        elif barcode_col is not None and total_col is not None:
            kind = "afr"
        else:
            sheets.append({"sayfa": ws.title, "atlandi": "stok sayfası değil"})
            continue

        code_col, style_col, color_col = col("code"), col("style"), col("color")
        photo_col = col("image", "photo")
        price_col = next((i for i, h in enumerate(low) if h.startswith("price")), None)
        note_col = next((i for i, h in enumerate(low) if h.startswith("açıklama")), None)
        stop = photo_col if photo_col is not None else -1
        if kind == "m212":
            m_block, a_block = block(header, m_col, stop), block(header, a_col, m_col)
        else:
            m_block, a_block = [], block(header, total_col, stop)

        n = 0
        for ri, r in enumerate(data[1:], start=2):
            r = list(r) + [None] * (len(header) - len(r))
            get = lambda c: r[c] if c is not None else None
            qty = lambda blk: {s: number(r[c]) for c, s in blk if number(r[c]) > 0}
            m, a = qty(m_block), qty(a_block)
            code = code_of(get(code_col))
            barcode = ident(get(barcode_col))
            # Fotoğraf hücresinde resim yerine YAZI varsa o, ürünün adıdır
            # ("Mürdüm Tulum"); bozuk formül (#VALUE!) ad değildir.
            label = text(get(photo_col))
            if label.startswith("#"):
                label = ""
            style, color = text(get(style_col)), text(get(color_col))
            short = text(r[col("malzeme kısa metni")]) if col("malzeme kısa metni") is not None else ""
            media = pics.get((ri, (photo_col or 0) + 1))
            # Kodu, adı olmayan ama ADEDİ ya da fotoğrafı olan satır da stoktur
            # (Market212 sayfasında yalnız rengi yazılmış satırlar var).
            if not (code or barcode or style or label or ((m or a or media) and (color or media))):
                continue  # boş ya da yalnız toplam satırı
            if media:
                used.add(media)
            rows.append({
                "sayfa": ws.title, "satir": ri, "tur": kind,
                "kod": code, "barkod": barcode if re.fullmatch(r"\d{6,14}", barcode) else "",
                "malzeme_no": ident(r[col("malzeme no")]) if col("malzeme no") is not None else "",
                "kisa_metin": short, "stil": style, "renk": color, "etiket": label,
                "fiyat": money(get(price_col)),
                # Açıklama hücresine yalnız sayı yazılmışsa (adet tekrarı) not değildir.
                "not": "" if isinstance(get(note_col), (int, float)) else text(get(note_col)),
                "m212": m if kind == "m212" else None,
                "m212_toplam": number(r[m_col]) if kind == "m212" else None,
                "afr": a,
                "afr_toplam": number(r[a_col if kind == "m212" else total_col]),
                "foto": posixpath.basename(media) if media else "",
            })
            n += 1
        sheets.append({
            "sayfa": ws.title, "tur": kind, "satir": n,
            "m212_bedenler": [s for _, s in m_block] if kind == "m212" else None,
            "afr_bedenler": [s for _, s in a_block],
            "fotograf": sum(1 for (row, c) in pics if c == (photo_col or 0) + 1),
        })

    # ── Fotoğraflar (yalnız stok satırlarına bağlı olanlar) ────────────────────
    if os.path.isdir(photo_dir):
        shutil.rmtree(photo_dir)
    os.makedirs(photo_dir)
    size = 0
    for media in sorted(used):
        with z.open(media) as f, open(os.path.join(photo_dir, posixpath.basename(media)), "wb") as g:
            shutil.copyfileobj(f, g)
        size += z.getinfo(media).file_size

    stamp = datetime.datetime.fromtimestamp(os.path.getmtime(src)).strftime("%Y-%m-%d")
    json.dump({"kaynak": os.path.basename(src), "alinma": stamp, "foto_klasoru": photo_dir,
               "sayfalar": sheets, "satirlar": rows},
              open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for s in sheets:
        print(" ", s)
    m_rows = [r for r in rows if r["tur"] == "m212"]
    a_rows = [r for r in rows if r["tur"] == "afr"]
    print(f"\n{len(rows)} satır → {out}")
    print(f"{len(used)} fotoğraf ({size / 1024 / 1024:.0f} MB) → {photo_dir}")
    print("Market 212:", len(m_rows), "satır ·", sum(sum(r["m212"].values()) for r in m_rows), "adet",
          "(aynı sayfadaki AFR kopyası:", sum(sum(r["afr"].values()) for r in m_rows), "adet)")
    print("AFR:", len(a_rows), "satır ·", sum(sum(r["afr"].values()) for r in a_rows), "adet")


if __name__ == "__main__":
    main()
