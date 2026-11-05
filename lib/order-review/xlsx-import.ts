import "server-only";
import type { OrderReviewCurrency, OrderReviewDecision } from "@/types";
import { parseCurrency, parseDecision } from "./model";

/**
 * SİPARİŞ DEĞERLENDİRME EXCEL'İ → KAYIT.
 *
 * Nisa Hanım (29.10.2026) ekibin elindeki şablonu gönderdi
 * (Asli_Filinta_Siparis_Degerlendirme.xlsx). Aynı şablonla hazırlanmış her
 * dosya buradan sisteme girer: sütunlar ADLARINDAN tanınır (sıra değişse de
 * olur), fotoğraflar oturdukları hücreye göre satıra ve "Orijinal" /
 * "Numune" sütununa dağıtılır.
 *
 * Fotoğrafın HÜCRESİ ortasından bulunur, sol üst köşesinden değil: şablonda
 * imalatçı numunesi fotoğrafları B sütununda başlayıp C'ye taşıyor. Köşeye
 * bakılsaydı numune fotoğrafı "orijinal" sayılırdı.
 *
 * Hiçbir şey sessizce düşmez: tanınmayan karar / döviz metni ve yeri
 * bulunamayan fotoğraf `notes` ile kullanıcıya söylenir.
 */

export type ParsedItem = {
  code: string;
  product_group: string;
  critique: string;
  /** Excel'deki "Aslı Notlar 27.10 Toplantı" hücresi — tarihiyle. Bu
   *  sistemin kendi dışa aktarımı birden çok toplantıyı "27.10.2026 — …"
   *  satırlarıyla tek hücreye yazar; onlar yine ayrı notlara bölünür. */
  notes: { date: string; text: string }[];
  fabric: string;
  colors: string;
  planned_qty: number | null;
  unit_price: number | null;
  currency: OrderReviewCurrency;
  decision: OrderReviewDecision;
  /** Görsel anahtarları (aşağıdaki `images` haritasına). */
  original: string[];
  sample: string[];
};

export type ParsedWorkbook = {
  meta: { season: string; date: string | null; reference: string };
  items: ParsedItem[];
  images: Map<string, { buffer: Buffer; ext: string }>;
  notes: string[];
};

type Field =
  | "no" | "original" | "sample" | "code" | "group" | "critique" | "note"
  | "fabric" | "colors" | "qty" | "price" | "currency" | "decision";

const norm = (s: string) =>
  s.toLocaleLowerCase("tr")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
    .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/\s+/g, " ").trim();

/** Başlık metni → alan. Şablondaki yazım hataları da tanınır ("Oırjinal"). */
function fieldOf(header: string): Field | null {
  const h = norm(header);
  if (!h) return null;
  if (h === "no" || h === "sira" || h === "sira no" || h === "#") return "no";
  if (h.includes("numune")) return "sample";
  if (h.includes("fotograf") || h.includes("gorsel") || h.includes("resim")) return "original";
  if (h.includes("kod")) return "code";
  if (h.includes("grup") || h.includes("grub")) return "group";
  if (h.includes("kritik") || h.includes("deneme")) return "critique";
  if (h.includes("not")) return "note";
  if (h.includes("kumas") || h.includes("icerik")) return "fabric";
  if (h.includes("renk")) return "colors";
  if (h.includes("adet") || h.includes("miktar")) return "qty";
  if (h.includes("fiyat")) return "price";
  if (h.includes("doviz") || h.includes("para birimi")) return "currency";
  if (h.includes("karar") || h.includes("durum")) return "decision";
  return null;
}

/** Hücrenin görünen metni — formülde sonuç, zengin metinde düz metin. */
function textOf(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const o = v as Record<string, unknown>;
  if ("result" in o) return textOf(o.result);
  if ("richText" in o && Array.isArray(o.richText)) {
    return (o.richText as { text?: string }[]).map((r) => r.text ?? "").join("").trim();
  }
  if ("text" in o) return textOf(o.text);
  return "";
}

/** "1.250" / "12,50" / 12.5 → sayı. Türkçe binlik ayırıcı tanınır. */
function numberOf(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && "result" in (v as object)) return numberOf((v as { result: unknown }).result);
  let s = textOf(v).replace(/[^\d.,-]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Başlıktaki "27.10" ya da "27.10.2026" → ISO tarih. Yıl yoksa `fallbackYear`. */
function dateInHeader(header: string, fallbackYear: number): string | null {
  const m = /(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/.exec(header);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = m[3] ? Number(m[3]) : fallbackYear;
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "27.10.2026 — metin\n\n20.10.2026 — metin" → ayrı tarihli notlar.
 *  Bu biçimde değilse hücrenin tamamı `fallbackDate` tarihli tek nottur. */
function splitNotes(text: string, fallbackDate: string): { date: string; text: string }[] {
  const re = /(?:^|\n\s*\n)(\d{2})\.(\d{2})\.(\d{4}) — /g;
  const marks = [...text.matchAll(re)];
  if (!marks.length || marks[0].index !== 0) return [{ date: fallbackDate, text }];
  return marks.map((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    return { date: `${m[3]}-${m[2]}-${m[1]}`, text: text.slice(start, end).trim() };
  }).filter((n) => n.text);
}

/** Hücre değeri → ISO tarih (Date ya da "29.10.2026"). */
function isoOf(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const t = textOf(v);
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null;
}

type WS = {
  name: string;
  rowCount: number;
  columnCount: number;
  getRow: (_r: number) => { getCell: (_c: number) => { value: unknown }; height?: number };
  getColumn: (_c: number) => { width?: number };
  getImages: () => {
    imageId: string | number;
    range: {
      tl?: { nativeCol: number; nativeColOff: number; nativeRow: number; nativeRowOff: number };
      br?: { nativeCol: number; nativeColOff: number; nativeRow: number; nativeRowOff: number };
    };
  }[];
};
type WB = {
  worksheets: WS[];
  getImage: (_id: number) => { buffer?: Buffer; extension?: string } | undefined;
};

const EMU_PER_PX = 9525;
/** Excel sütun genişliği (karakter) → EMU. Genişlik verilmemişse 8,43. */
const colEmu = (ws: WS, c1: number) => {
  const w = ws.getColumn(c1)?.width ?? 8.43;
  return Math.trunc(w * 7 + 5) * EMU_PER_PX;
};
/** Satır yüksekliği (punto) → EMU. Verilmemişse 15pt. */
const rowEmu = (ws: WS, r1: number) => (ws.getRow(r1)?.height ?? 15) * 12700;

/** Sıfır tabanlı (sütun, ofset) çiftinden mutlak konum. */
function absolute(index: number, offset: number, size: (_i1: number) => number): number {
  let x = 0;
  for (let i = 0; i < index; i++) x += size(i + 1);
  return x + offset;
}
/** Mutlak konum → sıfır tabanlı dizin. */
function indexAt(pos: number, size: (_i1: number) => number, max: number): number {
  let x = 0;
  for (let i = 0; i < max; i++) {
    x += size(i + 1);
    if (pos < x) return i;
  }
  return max - 1;
}

export async function parseOrderReviewWorkbook(buf: Buffer): Promise<ParsedWorkbook> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const book = wb as unknown as WB;
  const notes: string[] = [];

  /* Başlık satırı: en çok tanınan sütunu taşıyan satır (ilk 40 satır, ilk
     sayfadan başlayarak). En az dört alan tanınmalı — rastgele bir tablo
     sipariş değerlendirmesi sanılmasın. */
  let ws: WS | null = null;
  let headerRow = -1;
  let cols = new Map<number, Field>();
  let noteHeader = "";
  for (const sheet of book.worksheets) {
    for (let r = 1; r <= Math.min(sheet.rowCount, 40); r++) {
      const row = sheet.getRow(r);
      const found = new Map<number, Field>();
      let nh = "";
      for (let c = 1; c <= Math.min(sheet.columnCount, 40); c++) {
        const t = textOf(row.getCell(c).value);
        const f = fieldOf(t);
        if (f && ![...found.values()].includes(f)) {
          found.set(c, f);
          if (f === "note") nh = t;
        }
      }
      if (found.size >= 4 && found.size > cols.size) {
        ws = sheet; headerRow = r; cols = found; noteHeader = nh;
      }
    }
    if (ws) break;
  }
  if (!ws) {
    throw new Error(
      "Bu dosyada Sipariş Değerlendirme başlıkları bulunamadı (Ürün Kodu, Ürün Grubu, Kritikler, Karar…).",
    );
  }
  const sheet = ws;
  const colOf = (f: Field) => [...cols.entries()].find(([, v]) => v === f)?.[0];

  /* ÜST BİLGİ — "Sezon / Koleksiyon", "Tarih", "Sipariş / Referans". Değer
     etiketin sağındaki ilk dolu hücredir (başka bir etikete gelmeden). */
  const meta = { season: "", date: null as string | null, reference: "" };
  for (let r = 1; r < headerRow; r++) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= Math.min(sheet.columnCount, 40); c++) {
      const label = norm(textOf(row.getCell(c).value));
      const kind =
        label.startsWith("sezon") || label.startsWith("koleksiyon") ? "season"
        : label === "tarih" || label.startsWith("tarih ") ? "date"
        : label.startsWith("siparis") || label.startsWith("referans") ? "reference"
        : null;
      if (!kind) continue;
      for (let k = c + 1; k <= Math.min(sheet.columnCount, 40); k++) {
        const raw = row.getCell(k).value;
        const t = textOf(raw);
        if (!t) continue;
        const nl = norm(t);
        if (nl.startsWith("sezon") || nl === "tarih" || nl.startsWith("siparis")) break;
        if (kind === "date") meta.date = isoOf(raw);
        else meta[kind] = t.slice(0, 300);
        break;
      }
    }
  }

  const fallbackYear = Number((meta.date ?? new Date().toISOString()).slice(0, 4));
  const noteDate = dateInHeader(noteHeader, fallbackYear) ?? meta.date ?? new Date().toISOString().slice(0, 10);

  /* FOTOĞRAFLAR — önce yerleri. Satır/sütun bir fotoğrafın ORTASINDAN. */
  const images = new Map<string, { buffer: Buffer; ext: string }>();
  const photosAt = new Map<string, string[]>(); // "satır|alan" → anahtarlar
  const photoCols = new Map<number, "original" | "sample">();
  for (const [c, f] of cols) if (f === "original" || f === "sample") photoCols.set(c, f);
  const firstPhotoField: "original" | "sample" =
    [...photoCols.values()].includes("original") ? "original" : "sample";
  const maxCol = Math.max(sheet.columnCount, 40);
  const maxRow = Math.max(sheet.rowCount, headerRow + 1);
  let unplaced = 0;

  const place = (row1: number, col1: number, key: string) => {
    if (row1 <= headerRow) { unplaced++; return; }
    const field = photoCols.get(col1) ?? firstPhotoField;
    const k = `${row1}|${field}`;
    photosAt.set(k, [...(photosAt.get(k) ?? []), key]);
  };

  for (const im of sheet.getImages?.() ?? []) {
    const media = book.getImage(Number(im.imageId));
    if (!media?.buffer?.length) { unplaced++; continue; }
    const key = `m${im.imageId}`;
    images.set(key, { buffer: media.buffer, ext: (media.extension ?? "png").toLowerCase() });
    const { tl, br } = im.range;
    if (!tl) { unplaced++; continue; }
    const colSize = (i1: number) => colEmu(sheet, i1);
    const rowSize = (i1: number) => rowEmu(sheet, i1);
    const x1 = absolute(tl.nativeCol, tl.nativeColOff, colSize);
    const y1 = absolute(tl.nativeRow, tl.nativeRowOff, rowSize);
    const x2 = br ? absolute(br.nativeCol, br.nativeColOff, colSize) : x1;
    const y2 = br ? absolute(br.nativeRow, br.nativeRowOff, rowSize) : y1;
    const c0 = indexAt((x1 + x2) / 2, colSize, maxCol);
    const r0 = indexAt((y1 + y2) / 2, rowSize, maxRow);
    place(r0 + 1, c0 + 1, key);
  }

  /* HÜCRENİN İÇİNDEKİ fotoğraflar (Excel 365 "Hücreye Yerleştir", WPS). */
  const { readInCellImages } = await import("@/lib/sheets/xlsx-cell-images");
  const inCell = await readInCellImages(buf);
  for (const p of inCell.placements) {
    if (p.sheetName !== sheet.name) continue;
    const bytes = inCell.media.get(p.mediaPath);
    if (!bytes) continue;
    const key = `p${p.mediaPath}`;
    const ext = p.mediaPath.split(".").pop()?.toLowerCase() ?? "png";
    images.set(key, { buffer: bytes, ext });
    place(p.r + 1, p.c + 1, key);
  }

  /* SATIRLAR. Şablonda V-008…V-020 gibi yalnız sıra ve kod taşıyan boş
     satırlar var; onlar aktarılmaz (kodu olan ama hiçbir bilgisi ve
     fotoğrafı olmayan satır). Fotoğrafı olan satır içi boş olsa da girer. */
  const items: ParsedItem[] = [];
  const unknownDecisions = new Set<string>();
  const unknownCurrencies = new Set<string>();
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const get = (f: Field) => {
      const c = colOf(f);
      return c ? row.getCell(c).value : null;
    };
    const original = photosAt.get(`${r}|original`) ?? [];
    const sample = photosAt.get(`${r}|sample`) ?? [];
    const code = textOf(get("code")).slice(0, 120);
    const product_group = textOf(get("group")).slice(0, 500);
    const critique = textOf(get("critique")).slice(0, 8000);
    const noteText = textOf(get("note")).slice(0, 8000);
    const fabric = textOf(get("fabric")).slice(0, 1000);
    const colors = textOf(get("colors")).slice(0, 1000);
    const qtyRaw = get("qty");
    const priceRaw = get("price");
    const currencyText = textOf(get("currency"));
    const decisionText = textOf(get("decision"));

    const hasContent =
      product_group || critique || noteText || fabric || colors ||
      textOf(qtyRaw) || textOf(priceRaw) || decisionText ||
      original.length || sample.length;
    if (!hasContent) continue;

    const decision = parseDecision(decisionText);
    if (decisionText && !decision) unknownDecisions.add(decisionText);
    const currency = parseCurrency(currencyText);
    if (currencyText && !currency) unknownCurrencies.add(currencyText);
    const qty = numberOf(qtyRaw);

    items.push({
      code,
      product_group,
      critique,
      notes: noteText ? splitNotes(noteText, noteDate) : [],
      fabric,
      colors,
      planned_qty: qty === null ? null : Math.round(qty),
      unit_price: numberOf(priceRaw),
      currency: currency ?? "TL",
      decision: decision ?? "degerlendirmede",
      original,
      sample,
    });
  }

  if (unplaced > 0) notes.push(`${unplaced} fotoğrafın hangi satıra ait olduğu bulunamadı; aktarılmadı.`);
  if (unknownDecisions.size) {
    notes.push(`Tanınmayan karar metni "Değerlendirmede" olarak alındı: ${[...unknownDecisions].join(", ")}.`);
  }
  if (unknownCurrencies.size) {
    notes.push(`Tanınmayan döviz "TL" olarak alındı: ${[...unknownCurrencies].join(", ")}.`);
  }

  /* Hiçbir satıra bağlanmayan görsel yüklenmesin. */
  const used = new Set(items.flatMap((i) => [...i.original, ...i.sample]));
  for (const k of [...images.keys()]) if (!used.has(k)) images.delete(k);

  return { meta, items, images, notes };
}
