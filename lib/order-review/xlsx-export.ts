// Sipariş Değerlendirme → Excel (.xlsx). Nisa Hanım'ın gönderdiği şablonun
// düzeniyle: başlık, açıklama satırı, Sezon / Tarih / Sipariş bilgisi, tek
// başlık satırı ve ürün satırları — fotoğraflar kendi hücrelerinde.
// İçe aktarıcı (xlsx-import.ts) bu dosyayı geri okuyabilir.
import ExcelJS from "exceljs";
import { fitBox } from "@/lib/production/xlsx";
import type { OrderReview, OrderReviewItem } from "@/types";
import { CURRENCIES, decisionLabel, DECISIONS, formatDateTr, rowNo } from "./model";

const COLUMNS: { header: string; width: number }[] = [
  { header: "No", width: 7 },
  { header: "Ürün Fotoğrafı (Orijinal)", width: 22 },
  { header: "İmalatçı Numunesi", width: 22 },
  { header: "Ürün Kodu", width: 12 },
  { header: "Ürün Grubu", width: 26 },
  { header: "Ürün Kritikleri / Deneme Notları", width: 40 },
  { header: "Aslı Notları (Toplantı)", width: 40 },
  { header: "Kumaş / İçerik", width: 20 },
  { header: "Önerilen Renkler", width: 22 },
  { header: "Planlanan Adet", width: 15 },
  { header: "Birim Fiyat", width: 13 },
  { header: "Döviz", width: 10 },
  { header: "Karar / Durum", width: 18 },
];

const INK = "FF1F2937";
const HEAD_FILL = "FFF3F4F6";
const PHOTO_ROW_PT = 118; // şablondaki satır yüksekliği
const thin = { style: "thin" as const, color: { argb: "FFD1D5DB" } };
const box = { top: thin, left: thin, bottom: thin, right: thin };

/** Not geçmişi tek hücrede: "27.10.2026 — …" satırları, en yeni en üstte. */
function notesText(item: OrderReviewItem): string {
  return [...(item.meeting_notes ?? [])]
    .filter((n) => n.text.trim())
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((n) => `${formatDateTr(n.date)} — ${n.text.trim()}`)
    .join("\n\n");
}

export async function buildOrderReviewWorkbook(
  review: OrderReview,
  items: OrderReviewItem[],
  opts: { seasonName: string | null; fetchPhoto: (_path: string) => Promise<Buffer | null> },
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AF Operasyon";
  wb.created = new Date();
  const ws = wb.addWorksheet("Sipariş Değerlendirme", {
    views: [{ state: "frozen", ySplit: 7 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  COLUMNS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });

  ws.getCell("A2").value = "ASLI FİLİNTA  |  SİPARİŞ DEĞERLENDİRME";
  ws.getCell("A2").font = { bold: true, size: 16, color: { argb: INK } };
  ws.getCell("A3").value =
    "Ürün fotoğraflarını B sütunundaki alana ekleyin; her ürünün kritiklerini, planlanan adedini, renklerini ve fiyatını aynı satırda değerlendirin.";
  ws.getCell("A3").font = { italic: true, size: 10, color: { argb: "FF6B7280" } };

  const meta: [string, string, string][] = [
    ["A5", "Sezon / Koleksiyon", opts.seasonName ?? ""],
    ["C5", "Tarih", formatDateTr(review.review_date)],
    ["F5", "Sipariş / Referans", review.title],
  ];
  for (const [addr, label, value] of meta) {
    const cell = ws.getCell(addr);
    cell.value = label;
    cell.font = { bold: true, color: { argb: INK } };
    const next = ws.getCell(cell.row as unknown as number, Number(cell.col) + 1);
    next.value = value;
  }

  const header = ws.getRow(7);
  COLUMNS.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: INK } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = box;
  });
  header.height = 32;

  const PX_PER_CHAR = 7;
  const photoW = (col: number) => Math.trunc(COLUMNS[col].width * PX_PER_CHAR + 5);
  const photoH = Math.round(PHOTO_ROW_PT * (4 / 3));

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const r = 8 + i;
    const row = ws.getRow(r);
    const values: (string | number | null)[] = [
      rowNo(i), null, null, it.code, it.product_group, it.critique, notesText(it),
      it.fabric, it.colors, it.planned_qty, it.unit_price, it.currency, decisionLabel(it.decision),
    ];
    values.forEach((v, c) => {
      const cell = row.getCell(c + 1);
      cell.value = v === "" ? null : v;
      cell.alignment = { vertical: "top", wrapText: true, horizontal: c === 0 ? "center" : undefined };
      cell.border = box;
    });
    row.getCell(11).numFmt = "#,##0.00";
    row.getCell(10).numFmt = "#,##0";
    row.height = it.original_photos.length || it.sample_photos.length ? PHOTO_ROW_PT : 60;

    /* Fotoğraf hücrenin içine SIĞDIRILIR (contain). Bir hücrede birden çok
       fotoğraf varsa yan yana bölünür. */
    for (const [col, photos] of [[1, it.original_photos], [2, it.sample_photos]] as const) {
      const list = photos.slice(0, 4);
      if (!list.length) continue;
      const slotW = Math.floor((photoW(col) - 6) / list.length);
      for (let k = 0; k < list.length; k++) {
        const buf = await opts.fetchPhoto(list[k].path);
        if (!buf) continue;
        const ext = list[k].path.toLowerCase().endsWith(".png") ? "png" : list[k].path.toLowerCase().endsWith(".gif") ? "gif" : "jpeg";
        const fit = fitBox(buf, slotW, photoH - 6);
        const id = wb.addImage({ buffer: buf as unknown as ExcelJS.Buffer, extension: ext });
        /* Ofset doğrudan EMU ile verilir: ExcelJS kesirli `col`'u sütun
           genişliği × 10.000 sanıp çeviriyor, gerçek genişlik ~66.675 EMU /
           karakter — fotoğraf hücrenin solunda kayıyordu. */
        const EMU = 9525;
        ws.addImage(id, {
          tl: {
            nativeCol: col, nativeColOff: (3 + k * slotW + fit.dx) * EMU,
            nativeRow: r - 1, nativeRowOff: (3 + fit.dy) * EMU,
          } as unknown as ExcelJS.Anchor,
          ext: { width: fit.w, height: fit.h },
          editAs: "oneCell",
        });
      }
    }
  }

  /* Karar ve Döviz sütunları Excel'de de açılır liste — şablondaki gibi. */
  const last = Math.max(8 + items.length - 1, 27);
  for (let r = 8; r <= last; r++) {
    ws.getCell(r, 13).dataValidation = {
      type: "list", allowBlank: true, formulae: [`"${DECISIONS.map((d) => d.label).join(",")}"`],
    };
    ws.getCell(r, 12).dataValidation = {
      type: "list", allowBlank: true, formulae: [`"${CURRENCIES.join(",")}"`],
    };
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
