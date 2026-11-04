// Upcycle listesi → Excel (.xlsx). Gül Hanım'ın dosyasının düzeniyle: üstte
// ürün başlıkları ve satırları, altında "MALZEME LİSTESİ" ve kendi başlığı;
// fotoğraflar kendi hücrelerinde. İçe aktarıcı (xlsx-import.ts) geri okur.
import ExcelJS from "exceljs";
import { fitBox } from "@/lib/production/xlsx";
import type { UpcycleItem } from "@/types";
import { SIZES, sizeTotal } from "./model";

const PRODUCT_HEADERS: { header: string; width: number }[] = [
  { header: "Güncel Durum", width: 28 },
  { header: "Üretim Takibi", width: 20 },
  { header: "Ürün Adı", width: 16 },
  { header: "Renk", width: 12 },
  { header: "Ürün Kodu (Yıl/Kategori/Renk)", width: 18 },
  { header: "Upcycle Öncesi Görsel", width: 16 },
  { header: "Upcycle Sonrası Görsel", width: 16 },
  { header: "Açıklama", width: 44 },
  ...SIZES.map((s) => ({ header: s.label, width: s.key === "ONE" ? 9 : 6 })),
  { header: "AFR Toplam Adet", width: 11 },
  { header: "Market 212", width: 10 },
  { header: "Perakende Satış Fiyatı (TL)", width: 14 },
];
/* Malzeme başlığı aynı sütunlarda: E = Ürün Türü, F = Fotoğraf, O = Ürün Adeti. */
const MATERIAL_HEADERS: Record<number, string> = {
  1: "Güncel Durum", 2: "Üretim Takibi", 3: "Ürün Adı", 4: "Renk", 5: "Ürün Türü", 6: "Fotoğraf", 8: "Açıklama", 15: "Ürün Adeti",
};

const INK = "FF1F2937";
const HEAD_FILL = "FFF3F4F6";
const PHOTO_ROW_PT = 80;
const thin = { style: "thin" as const, color: { argb: "FFD1D5DB" } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const EMU = 9525;

export async function buildUpcycleWorkbook(
  items: UpcycleItem[],
  opts: { updatedAt: Date | null; fetchPhoto: (_path: string) => Promise<Buffer | null> },
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AF Operasyon";
  wb.created = new Date();
  const ws = wb.addWorksheet("Upcycle", {
    views: [{ state: "frozen", ySplit: 1 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  PRODUCT_HEADERS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
  ws.getColumn(18).width = 16;
  ws.getColumn(19).width = 12;

  const styleHeader = (cell: ExcelJS.Cell) => {
    cell.font = { bold: true, color: { argb: INK } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = box;
  };

  const head = ws.getRow(1);
  PRODUCT_HEADERS.forEach((c, i) => { head.getCell(i + 1).value = c.header; styleHeader(head.getCell(i + 1)); });
  head.getCell(18).value = "Güncelleme Tarihi";
  head.getCell(18).font = { bold: true, color: { argb: INK } };
  if (opts.updatedAt) {
    head.getCell(19).value = opts.updatedAt;
    head.getCell(19).numFmt = "dd.mm.yyyy";
  }
  head.height = 34;

  const photoW = (col0: number) => Math.trunc(PRODUCT_HEADERS[col0].width * 7 + 5);
  const photoH = Math.round(PHOTO_ROW_PT * (4 / 3));

  async function putPhotos(r: number, col0: number, photos: UpcycleItem["before_photos"]) {
    const list = photos.slice(0, 3);
    if (!list.length) return;
    const slotW = Math.floor((photoW(col0) - 6) / list.length);
    for (let k = 0; k < list.length; k++) {
      const buf = await opts.fetchPhoto(list[k].path);
      if (!buf) continue;
      const lower = list[k].path.toLowerCase();
      const ext = lower.endsWith(".png") ? "png" : lower.endsWith(".gif") ? "gif" : "jpeg";
      const fit = fitBox(buf, slotW, photoH - 6);
      const id = wb.addImage({ buffer: buf as unknown as ExcelJS.Buffer, extension: ext });
      ws.addImage(id, {
        tl: {
          nativeCol: col0, nativeColOff: (3 + k * slotW + fit.dx) * EMU,
          nativeRow: r - 1, nativeRowOff: (3 + fit.dy) * EMU,
        } as unknown as ExcelJS.Anchor,
        ext: { width: fit.w, height: fit.h },
        editAs: "oneCell",
      });
    }
  }

  const writeRow = (r: number, values: (string | number | null)[]) => {
    const row = ws.getRow(r);
    values.forEach((v, c) => {
      const cell = row.getCell(c + 1);
      cell.value = v === "" ? null : v;
      cell.alignment = { vertical: "top", wrapText: true };
      cell.border = box;
    });
    return row;
  };

  const products = items.filter((i) => i.section === "urun");
  const materials = items.filter((i) => i.section === "malzeme");

  let r = 2;
  for (const it of products) {
    const row = writeRow(r, [
      it.status_note, it.owners, it.name, it.color, it.code, null, null, it.description,
      ...SIZES.map((s) => it.sizes?.[s.key] ?? 0),
      sizeTotal(it.sizes), it.market212, it.retail_price,
    ]);
    row.getCell(17).numFmt = "#,##0";
    row.height = it.before_photos.length || it.after_photos.length ? PHOTO_ROW_PT : 48;
    await putPhotos(r, 5, it.before_photos);
    await putPhotos(r, 6, it.after_photos);
    r++;
  }

  r++;
  ws.mergeCells(r, 2, r, 17);
  ws.getCell(r, 2).value = "MALZEME LİSTESİ";
  ws.getCell(r, 2).font = { bold: true, size: 12, color: { argb: INK } };
  ws.getCell(r, 2).alignment = { horizontal: "center" };
  r++;
  const mHead = ws.getRow(r);
  for (const [c, label] of Object.entries(MATERIAL_HEADERS)) {
    mHead.getCell(Number(c)).value = label;
    styleHeader(mHead.getCell(Number(c)));
  }
  mHead.height = 28;
  r++;
  for (const it of materials) {
    const values: (string | number | null)[] = Array(17).fill(null);
    values[0] = it.status_note; values[1] = it.owners; values[2] = it.name; values[3] = it.color;
    values[4] = it.material_type; values[7] = it.description; values[14] = it.quantity;
    const row = writeRow(r, values);
    row.height = it.before_photos.length ? PHOTO_ROW_PT : 48;
    await putPhotos(r, 5, it.before_photos);
    r++;
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
