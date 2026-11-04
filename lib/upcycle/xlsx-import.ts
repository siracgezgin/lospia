import "server-only";
import type { UpcycleSection, UpcycleSize } from "@/types";
import {
  absolute, colEmu, indexAt, norm, numberOf, rowEmu, textOf, type WB, type WS,
} from "@/lib/order-review/xlsx-import";

/**
 * UPCYCLE EXCEL'İ → SATIRLAR.
 *
 * Gül Hanım'ın "upcycle yapılacaklar listesi.xlsx" dosyası (04.11.2026):
 * tek sayfada iki bölüm — üstte ÜRÜNLER, altında "MALZEME LİSTESİ" başlığı
 * ve kendi başlık satırı. Sütunlar ADLARINDAN tanınır (sıra değişse de olur).
 *
 * Malzeme başlık satırı eksik: "Güncel Durum" ve "Açıklama" başlıkları yok
 * ama satırlar o sütunlara (A, H) yazılmış. Bu yüzden malzeme bölümü ürün
 * başlıklarını DEVRALIR, kendi başlığı olan sütunlarda kendi alanını alır
 * (E: Ürün Kodu → Ürün Türü, O: Toplam → Ürün Adeti).
 *
 * Excel'de boş hücre yerine yazılmış "0" (kod, açıklama, fiyat) boş sayılır;
 * beden adetlerindeki 0 zaten sıfırdır. Hiçbir şey sessizce düşmez: yeri
 * bulunamayan fotoğraf `notes` ile söylenir.
 */

export type ParsedUpcycleItem = {
  section: UpcycleSection;
  status_note: string;
  owners: string;
  name: string;
  color: string;
  code: string;
  material_type: string;
  description: string;
  sizes: Partial<Record<UpcycleSize, number>>;
  market212: number | null;
  retail_price: number | null;
  quantity: number | null;
  /** Görsel anahtarları (aşağıdaki `images` haritasına). */
  before: string[];
  after: string[];
};

export type ParsedUpcycleWorkbook = {
  items: ParsedUpcycleItem[];
  images: Map<string, { buffer: Buffer; ext: string }>;
  notes: string[];
};

type Field =
  | "status" | "owners" | "name" | "color" | "code" | "type" | "before" | "after"
  | "description" | "total" | "market" | "price" | "quantity" | `size:${UpcycleSize}`;

const SIZE_HEADERS: Record<string, UpcycleSize> = {
  xs: "XS", s: "S", m: "M", l: "L", xl: "XL", "one size": "ONE", onesize: "ONE", std: "ONE", standart: "ONE",
};

function fieldOf(header: string): Field | null {
  const h = norm(header);
  /* Başlık kısa olur; uzun metin bir veri hücresidir ("…dönüştürülmesi"
     içindeki "tür" bir sütun adı değil). */
  if (!h || h.length > 60) return null;
  if (SIZE_HEADERS[h]) return `size:${SIZE_HEADERS[h]}`;
  if (h.includes("durum")) return "status";
  if (h.includes("takip") || h.includes("takib") || h.includes("sorumlu")) return "owners";
  if (h.includes("oncesi")) return "before";
  if (h.includes("sonrasi")) return "after";
  if (h.includes("fotograf") || h.includes("gorsel") || h.includes("resim")) return "before";
  if (h.includes("kod")) return "code";
  if (h.includes("tur")) return "type";
  if (h.includes("adi") || h === "urun") return "name";
  if (h.includes("renk")) return "color";
  if (h.includes("aciklama") || h.includes("not")) return "description";
  if (h.includes("toplam")) return "total";
  if (h.includes("market")) return "market";
  if (h.includes("fiyat")) return "price";
  if (h.includes("adet") || h.includes("miktar")) return "quantity";
  return null;
}

/** Excel'in boş yerine yazdığı "0" → boş. */
const clean = (v: unknown, max: number) => {
  const t = textOf(v);
  return t === "0" ? "" : t.slice(0, max);
};

export async function parseUpcycleWorkbook(buf: Buffer): Promise<ParsedUpcycleWorkbook> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const book = wb as unknown as WB;
  const notes: string[] = [];

  const headerMap = (sheet: WS, r: number) => {
    const found = new Map<number, Field>();
    const row = sheet.getRow(r);
    for (let c = 1; c <= Math.min(sheet.columnCount, 40); c++) {
      const f = fieldOf(textOf(row.getCell(c).value));
      if (f && ![...found.values()].includes(f)) found.set(c, f);
    }
    return found;
  };

  /* ÜRÜN başlığı: ad + renk + (kod ya da görsel) taşıyan ilk satır. MALZEME
     başlığı: ondan sonra "malzeme" yazan satırın altındaki başlık ya da
     "Ürün Türü" sütunu olan ilk satır. */
  let ws: WS | null = null;
  let productHeader = -1;
  let materialHeader = -1;
  let productCols = new Map<number, Field>();
  let materialOwn = new Map<number, Field>();
  for (const sheet of book.worksheets) {
    for (let r = 1; r <= Math.min(sheet.rowCount, 60); r++) {
      const cols = headerMap(sheet, r);
      const has = (f: Field) => [...cols.values()].includes(f);
      if (has("name") && (has("code") || has("before") || has("after")) && cols.size >= 4) {
        ws = sheet; productHeader = r; productCols = cols; break;
      }
    }
    if (ws) break;
  }
  if (!ws) {
    throw new Error("Bu dosyada Upcycle başlıkları bulunamadı (Ürün Adı, Renk, Ürün Kodu, Upcycle Öncesi Görsel…).");
  }
  const sheet = ws;
  let titleRow = -1;
  for (let r = productHeader + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const cells = [...Array(Math.min(sheet.columnCount, 40)).keys()].map((i) => norm(textOf(row.getCell(i + 1).value)));
    if (titleRow === -1 && cells.some((t) => t.startsWith("malzeme"))) { titleRow = r; continue; }
    const cols = headerMap(sheet, r);
    const vals = [...cols.values()];
    if (vals.includes("name") && cols.size >= 3 && (titleRow !== -1 || vals.includes("type"))) {
      materialHeader = r; materialOwn = cols; break;
    }
  }
  /* Malzeme sütunları: ürün başlıklarını devralır, kendi başlığı ezer.
     Bedenler ve fiyat malzemede yoktur; "Toplam" sütunu orada "Ürün Adeti". */
  const materialCols = new Map<number, Field>();
  for (const [c, f] of productCols) {
    if (f.startsWith("size:") || f === "market" || f === "price" || f === "after") continue;
    materialCols.set(c, f);
  }
  for (const [c, f] of materialOwn) materialCols.set(c, f === "total" ? "quantity" : f);

  /* "MALZEME LİSTESİ" başlığından malzeme başlık satırına kadar hiçbir
     satır veri değildir. */
  const materialStart = titleRow !== -1 && materialHeader !== -1 ? titleRow : materialHeader;
  const sectionOf = (r1: number): UpcycleSection | null => {
    if (r1 <= productHeader) return null;
    if (materialHeader !== -1 && r1 >= materialStart) return r1 > materialHeader ? "malzeme" : null;
    return "urun";
  };

  /* FOTOĞRAFLAR — satır/sütun fotoğrafın ORTASINDAN (Order Review'daki gibi). */
  const images = new Map<string, { buffer: Buffer; ext: string }>();
  const photosAt = new Map<string, string[]>(); // "satır|before|after" → anahtarlar
  const maxCol = Math.max(sheet.columnCount, 40);
  const maxRow = Math.max(sheet.rowCount, productHeader + 1);
  let unplaced = 0;

  const place = (row1: number, col1: number, key: string) => {
    const section = sectionOf(row1);
    if (!section) { unplaced++; return; }
    const cols = section === "urun" ? productCols : materialCols;
    const slot = section === "malzeme" ? "before" : cols.get(col1) === "after" ? "after" : "before";
    const k = `${row1}|${slot}`;
    photosAt.set(k, [...(photosAt.get(k) ?? []), key]);
  };

  const colSize = (i1: number) => colEmu(sheet, i1);
  const rowSize = (i1: number) => rowEmu(sheet, i1);
  const EMU_PER_PX = 9525;
  for (const im of sheet.getImages?.() ?? []) {
    const media = book.getImage(Number(im.imageId));
    if (!media?.buffer?.length) { unplaced++; continue; }
    const key = `m${im.imageId}`;
    images.set(key, { buffer: media.buffer, ext: (media.extension ?? "png").toLowerCase() });
    const { tl, br } = im.range;
    if (!tl) { unplaced++; continue; }
    const ext = (im.range as { ext?: { width?: number; height?: number } }).ext;
    const x1 = absolute(tl.nativeCol, tl.nativeColOff, colSize);
    const y1 = absolute(tl.nativeRow, tl.nativeRowOff, rowSize);
    /* oneCellAnchor'da `br` yok; boyut `ext`te (piksel). Ortayı ona göre bul,
       ama satırın dışına taşan büyük görsel sol üst hücresinde kalsın. */
    const x2 = br ? absolute(br.nativeCol, br.nativeColOff, colSize) : x1 + Math.min((ext?.width ?? 0) * EMU_PER_PX, colSize(tl.nativeCol + 1) - 1);
    const y2 = br ? absolute(br.nativeRow, br.nativeRowOff, rowSize) : y1 + Math.min((ext?.height ?? 0) * EMU_PER_PX, rowSize(tl.nativeRow + 1) - 1);
    place(indexAt((y1 + y2) / 2, rowSize, maxRow) + 1, indexAt((x1 + x2) / 2, colSize, maxCol) + 1, key);
  }

  const { readInCellImages } = await import("@/lib/sheets/xlsx-cell-images");
  const inCell = await readInCellImages(buf);
  for (const p of inCell.placements) {
    if (p.sheetName !== sheet.name) continue;
    const bytes = inCell.media.get(p.mediaPath);
    if (!bytes) continue;
    const key = `p${p.mediaPath}`;
    images.set(key, { buffer: bytes, ext: p.mediaPath.split(".").pop()?.toLowerCase() ?? "png" });
    place(p.r + 1, p.c + 1, key);
  }

  const items: ParsedUpcycleItem[] = [];
  for (let r = productHeader + 1; r <= sheet.rowCount; r++) {
    const section = sectionOf(r);
    if (!section) continue;
    const cols = section === "urun" ? productCols : materialCols;
    const row = sheet.getRow(r);
    /* Birleştirilmiş hücrenin yalnız İLK hücresi değer taşır: Excel'de
       "AFR Toplam" (O) ile "Market 212" (P) birleşik satırlarda toplam
       Market 212'ye sızıyordu. */
    const get = (f: Field) => {
      const c = [...cols.entries()].find(([, v]) => v === f)?.[0];
      if (!c) return null;
      const cell = row.getCell(c) as { value: unknown; address?: string; master?: { address?: string } };
      if (cell.master?.address && cell.address && cell.master.address !== cell.address) return null;
      return cell.value;
    };
    const sizes: Partial<Record<UpcycleSize, number>> = {};
    if (section === "urun") {
      for (const s of ["XS", "S", "M", "L", "XL", "ONE"] as UpcycleSize[]) {
        const n = numberOf(get(`size:${s}`));
        if (n) sizes[s] = Math.round(n);
      }
    }
    const before = photosAt.get(`${r}|before`) ?? [];
    const after = photosAt.get(`${r}|after`) ?? [];
    const price = numberOf(get("price"));
    const market = numberOf(get("market"));
    const qty = numberOf(get("quantity"));
    const item: ParsedUpcycleItem = {
      section,
      status_note: clean(get("status"), 2000),
      owners: clean(get("owners"), 300),
      name: clean(get("name"), 300),
      color: clean(get("color"), 200),
      code: section === "urun" ? clean(get("code"), 120) : "",
      material_type: section === "malzeme" ? clean(get("type"), 200) : "",
      description: clean(get("description"), 8000),
      sizes,
      market212: section === "urun" && market !== null ? Math.round(market) : null,
      retail_price: section === "urun" && price ? price : null,
      quantity: section === "malzeme" && qty !== null ? Math.round(qty) : null,
      before,
      after,
    };
    const hasContent =
      item.status_note || item.owners || item.name || item.color || item.code || item.material_type ||
      item.description || Object.keys(sizes).length || item.market212 || item.retail_price || item.quantity ||
      before.length || after.length;
    if (!hasContent) continue;
    items.push(item);
  }

  if (unplaced > 0) notes.push(`${unplaced} fotoğrafın hangi satıra ait olduğu bulunamadı; aktarılmadı.`);
  const used = new Set(items.flatMap((i) => [...i.before, ...i.after]));
  for (const k of [...images.keys()]) if (!used.has(k)) images.delete(k);
  return { items, images, notes };
}
