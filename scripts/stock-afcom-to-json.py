#!/usr/bin/env python3
"""
AFCOM Excel'i → stok JSON'u (İstanbul / Market 212 sayımı).

Ekibin ürün Excel'inde ("AFCOM") her kategori sayfasında iki stok bloğu var:
beden beden "M212 Stok" (Market 212 İstanbul) ve "AFR Stok". Bu betik yalnız
OKUR ve sade bir JSON yazar; panele yazan betik `stock-import-afcom.ts`.

    python3 scripts/stock-afcom-to-json.py "~/Downloads/AFCOM (22).xlsx"
    →  ~/Downloads/af-afcom-stok.json

Excel 98 MB (gömülü fotoğraflar); read_only kipte yalnız hücreler okunur.
Sayfaların düzeni birbirini tutmuyor — betik başlığı ARAR, sütun numarası
varsaymaz:
  • başlık satırı ilk 8 satırdan, içinde "M212 Stok" geçen satırdır;
  • beden sütunları "M212 Stok"un (ve "AFR Stok"un) hemen solundaki bloktur;
    başlığı birleştirilmiş hücrede kalmış 6'lı blok XS·S·M·L·XL·ONE SIZE'dır;
  • ürün adı "Title" ya da "Adı", kod "Kod (…)" sütunundadır.
JSON repoya GİRMEZ (İndirilenler'de kalır).
"""
import datetime
import json
import os
import re
import sys

import openpyxl

SIZES = ["XS", "S", "M", "L", "XL", "ONE SIZE"]
LABELS = {"XXS", "XS", "S", "M", "L", "XL", "XXL", "ONE SIZE"}


def text(v):
    return re.sub(r"\s+", " ", str(v if v is not None else "")).strip()


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


def block(header, total_col, stop_col):
    """total_col'un solundaki beden bloğu → [(sütun, beden)] ya da None (çözülemedi)."""
    cols = []
    j = total_col - 1
    while j > stop_col:
        raw = text(header[j])
        lab = size_label(header[j])
        if lab is None and raw and not raw.lower().startswith("size /"):
            break
        cols.append((j, lab))
        j -= 1
    cols.reverse()
    if not cols:
        return []
    if all(lab for _, lab in cols):
        return cols
    if len(cols) == len(SIZES) and not any(lab for _, lab in cols[1:]):
        return [(c, s) for (c, _), s in zip(cols, SIZES)]
    return None


def main():
    src = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else "~/Downloads/AFCOM (22).xlsx")
    out = os.path.expanduser(sys.argv[2] if len(sys.argv) > 2 else "~/Downloads/af-afcom-stok.json")
    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    rows, sheets = [], []
    for ws in wb.worksheets:
        data = list(ws.iter_rows(values_only=True))
        hi = next((i for i, r in enumerate(data[:8]) if any(re.search(r"m212 stok", text(c).lower()) for c in r)), None)
        if hi is None:
            sheets.append({"sayfa": ws.title, "atlandi": "stok sütunu yok"})
            continue
        header = list(data[hi])
        low = [text(c).lower() for c in header]
        m_col = max(i for i, h in enumerate(low) if "m212 stok" in h)
        a_col = next((i for i, h in enumerate(low) if "afr stok" in h and not h.startswith("size /")), None)
        code_col = next((i for i, h in enumerate(low) if h.startswith("kod")), None)
        title_col = next((i for i, h in enumerate(low) if h in ("title", "adı")), None)
        price_col = next((i for i, h in enumerate(low) if h.startswith("psf (tl)")), None)
        note_col = max([i for i, h in enumerate(low[:m_col]) if h.startswith(("designer", "assistance", "details", "size &"))] or [-1])
        m_block = block(header, m_col, note_col)
        a_block = block(header, a_col, m_col) if a_col is not None else []
        # Ayakkabı sayfası: AFR bloğu 36–40 diye başlıklı, M212 bloğu başlıksız —
        # konumdan XS…ONE SIZE varsaymak yanlış olur; çözülemedi say.
        if m_block and a_block and any(s.isdigit() for _, s in a_block) and not any(s.isdigit() for _, s in m_block):
            if not any(size_label(header[c]) for c, _ in m_block):
                m_block = None
        n = 0
        for ri, r in enumerate(data[hi + 1:], start=hi + 2):
            r = list(r) + [None] * (len(header) - len(r))
            code = text(r[code_col]) if code_col is not None else ""
            if not code or len(code) > 40 or not re.search(r"\d", code):
                continue
            def qty(blk):
                return {s: number(r[c]) for c, s in (blk or []) if number(r[c]) > 0}
            rows.append({
                "sayfa": ws.title, "satir": ri, "kod": code,
                "ad": text(r[title_col]) if title_col is not None else "",
                "fiyat": (float(r[price_col]) if price_col is not None and isinstance(r[price_col], (int, float)) else None),
                "m212": qty(m_block), "m212_toplam": number(r[m_col]), "m212_beden_yok": m_block is None,
                "afr": qty(a_block), "afr_toplam": number(r[a_col]) if a_col is not None else 0, "afr_beden_yok": a_block is None,
            })
            n += 1
        sheets.append({"sayfa": ws.title, "satir": n,
                       "m212_bedenler": None if m_block is None else [s for _, s in m_block],
                       "afr_bedenler": None if a_block is None else [s for _, s in a_block]})
    stamp = datetime.datetime.fromtimestamp(os.path.getmtime(src)).strftime("%Y-%m-%d")
    json.dump({"kaynak": os.path.basename(src), "alinma": stamp, "sayfalar": sheets, "satirlar": rows},
              open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for s in sheets:
        print(" ", s)
    print(f"\n{len(rows)} satır → {out}")
    print("M212 toplam:", sum(sum(r["m212"].values()) for r in rows), "· AFR toplam:", sum(sum(r["afr"].values()) for r in rows))


if __name__ == "__main__":
    main()
