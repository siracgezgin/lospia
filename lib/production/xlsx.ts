// Üretim Föyü → Excel (.xlsx). Aslı Hanım'ın alışkın olduğu föy düzenini sadık
// biçimde üretir: koyu başlık şeridi, 2 kolonlu ürün bilgisi, ölçüler/teslim
// tabloları, beden dağılımı ızgarası ve talimat bölümleri. ExcelJS ile tam
// biçimlendirme (kalın başlıklar, gölgeli şeritler, kenarlıklar, kaydırılmış
// uzun metin). Salt-yazım; kullanıcı verisi güvenli.
import ExcelJS from "exceljs";
import type { ProductionSheet } from "@/types";

const COLS = 9; // A–I
const INK = "FF1F2937"; // koyu başlık şeridi
const BAND = "FFF3F4F6"; // bölüm şeridi
const TH = "FFE5E7EB"; // tablo başlığı
const LINE = "FFD9DCE1"; // ince kenarlık

const thin = { style: "thin" as const, color: { argb: LINE } };
const border = { top: thin, left: thin, bottom: thin, right: thin };
const colLetter = (i: number) => String.fromCharCode(64 + i); // 1→A

function estimateLines(text: string, charsPerLine: number): number {
  const paras = text.split("\n");
  let lines = 0;
  for (const p of paras) lines += Math.max(1, Math.ceil((p.length || 1) / charsPerLine));
  return lines;
}

function newWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Lospia — Aslı Filinta Operasyon";
  wb.created = new Date();
  return wb;
}

/** Geçerli, benzersiz sekme adı (Excel: ≤31 karakter, : \ / ? * [ ] yasak). */
function uniqueSheetName(title: string, used: Set<string>): string {
  const base = (title || "Föy").replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Föy";
  let name = base;
  let i = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${i})`;
    name = base.slice(0, 31 - suffix.length) + suffix;
    i++;
  }
  used.add(name.toLowerCase());
  return name;
}

/** Bir föyü verilen çalışma kitabına yeni bir sekme olarak ekler. */
async function addProductionSheet(
  wb: ExcelJS.Workbook,
  sheet: ProductionSheet,
  memberNames: Record<string, string>,
  usedNames: Set<string>,
): Promise<void> {
  const ws = wb.addWorksheet(uniqueSheetName(sheet.title, usedNames), {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
  });

  // Kolon genişlikleri (A–I).
  ws.columns = [
    { width: 6 }, { width: 20 }, { width: 12 }, { width: 12 },
    { width: 14 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
  ];

  let r = 1;
  const nameOf = (id: string | null) => (id && memberNames[id]) || "—";

  // ── Başlık şeridi ──────────────────────────────────────────────────────────
  ws.mergeCells(`A${r}:G${r}`);
  ws.mergeCells(`H${r}:I${r}`);
  const titleCell = ws.getCell(`A${r}`);
  titleCell.value = "ÜRETİM FÖYÜ";
  titleCell.font = { bold: true, size: 15, color: { argb: "FFFFFFFF" }, name: "Calibri" };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  const brandCell = ws.getCell(`H${r}`);
  brandCell.value = "aslıfilinta";
  brandCell.font = { bold: true, size: 11, color: { argb: "FFE5E7EB" } };
  brandCell.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
  for (let c = 1; c <= COLS; c++) {
    ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
  }
  ws.getRow(r).height = 26;
  r++;

  // Föy başlığı (ürün adı) — ikinci satır, vurgulu.
  ws.mergeCells(`A${r}:I${r}`);
  const productCell = ws.getCell(`A${r}`);
  productCell.value = sheet.title;
  productCell.font = { bold: true, size: 13, color: { argb: INK } };
  productCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(r).height = 22;
  r += 1;
  r++; // boşluk

  // ── Ürün bilgileri — 2 kolonlu label:value ──────────────────────────────────
  const infoRow = (leftLabel: string, leftVal: string, rightLabel: string, rightVal: string) => {
    const row = ws.getRow(r);
    const ll = ws.getCell(`A${r}`); ws.mergeCells(`A${r}:B${r}`);
    ll.value = leftLabel; ll.font = { bold: true, size: 10, color: { argb: "FF6B7280" } };
    ll.alignment = { vertical: "middle" };
    const lv = ws.getCell(`C${r}`); ws.mergeCells(`C${r}:D${r}`);
    lv.value = leftVal || ""; lv.font = { size: 11, color: { argb: INK } };
    lv.alignment = { vertical: "middle" };
    const rl = ws.getCell(`E${r}`);
    rl.value = rightLabel; rl.font = { bold: true, size: 10, color: { argb: "FF6B7280" } };
    rl.alignment = { vertical: "middle" };
    const rv = ws.getCell(`F${r}`); ws.mergeCells(`F${r}:I${r}`);
    rv.value = rightVal || ""; rv.font = { size: 11, color: { argb: INK } };
    rv.alignment = { vertical: "middle" };
    row.height = 18;
    r++;
  };
  infoRow("ÜRÜN KODU", sheet.product_code ?? "", "ÜRETİM TARİHİ", sheet.production_date ?? "");
  infoRow("ÜRÜN CİNSİ", sheet.product_kind ?? "", "TESLİM TARİHİ", sheet.delivery_date ?? "");
  infoRow("ÜRETİCİ", sheet.producer ?? "", "SEZON", sheet.season ?? "");
  infoRow("AÇIKLAMA", sheet.description ?? "", "1 ÜRÜNE METRAJ", sheet.meterage ?? "");
  r++; // boşluk

  // ── Bölüm başlığı şeridi ─────────────────────────────────────────────────────
  const sectionBand = (title: string) => {
    ws.mergeCells(`A${r}:I${r}`);
    const c = ws.getCell(`A${r}`);
    c.value = title.toLocaleUpperCase("tr-TR"); // Türkçe: i→İ, ı korunur
    c.font = { bold: true, size: 10.5, color: { argb: INK } };
    c.alignment = { vertical: "middle", indent: 1 };
    for (let i = 1; i <= COLS; i++) {
      const cell = ws.getCell(r, i);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } };
      cell.border = { bottom: thin };
    }
    ws.getRow(r).height = 20;
    r++;
  };

  // ── ÖLÇÜLER ──────────────────────────────────────────────────────────────────
  sectionBand("Ölçüler (cm)");
  const measHead = (a: string, b: string, cc: string) => {
    ws.getCell(`A${r}`).value = a;
    ws.mergeCells(`B${r}:G${r}`); ws.getCell(`B${r}`).value = b;
    ws.mergeCells(`H${r}:I${r}`); ws.getCell(`H${r}`).value = cc;
    for (let i = 1; i <= COLS; i++) {
      const cell = ws.getCell(r, i);
      cell.font = { bold: true, size: 10, color: { argb: "FF374151" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TH } };
      cell.border = border;
      cell.alignment = { vertical: "middle", horizontal: i === 1 ? "center" : "left", indent: i === 1 ? 0 : 1 };
    }
    ws.getRow(r).height = 17;
    r++;
  };
  measHead("No", "ÖLÇÜ", "DEĞER");
  const measRows = sheet.measurements?.length ? sheet.measurements : [{ no: "", label: "", value: "" }];
  for (const m of measRows) {
    ws.getCell(`A${r}`).value = m.no;
    ws.mergeCells(`B${r}:G${r}`); ws.getCell(`B${r}`).value = m.label;
    ws.mergeCells(`H${r}:I${r}`); ws.getCell(`H${r}`).value = m.value;
    for (let i = 1; i <= COLS; i++) {
      const cell = ws.getCell(r, i);
      cell.border = border; cell.font = { size: 10.5 };
      cell.alignment = { vertical: "middle", horizontal: i === 1 ? "center" : "left", indent: i === 1 ? 0 : 1 };
    }
    ws.getRow(r).height = 16;
    r++;
  }
  r++;

  // ── TESLİM EDİLEN ÜRÜNLER ────────────────────────────────────────────────────
  sectionBand("Teslim Edilen Ürünler");
  measHead("No", "ÜRÜN", "ADET");
  const delRows = sheet.delivered_items?.length ? sheet.delivered_items : [{ no: "", label: "", qty: "" }];
  for (const d of delRows) {
    ws.getCell(`A${r}`).value = d.no;
    ws.mergeCells(`B${r}:G${r}`); ws.getCell(`B${r}`).value = d.label;
    ws.mergeCells(`H${r}:I${r}`); ws.getCell(`H${r}`).value = d.qty;
    for (let i = 1; i <= COLS; i++) {
      const cell = ws.getCell(r, i);
      cell.border = border; cell.font = { size: 10.5 };
      cell.alignment = { vertical: "middle", horizontal: i === 1 ? "center" : "left", indent: i === 1 ? 0 : 1 };
    }
    ws.getRow(r).height = 16;
    r++;
  }
  r++;

  // ── BEDEN DAĞILIMI ───────────────────────────────────────────────────────────
  const sd = sheet.size_distribution;
  if (sd && Array.isArray(sd.sizes) && sd.sizes.length) {
    sectionBand("Beden Dağılımı");
    const sizes = sd.sizes.slice(0, COLS - 2); // label(1) + sizes + total(1)
    const nCols = 1 + sizes.length + 1; // label + sizes + total
    const startTotal = 1 + sizes.length + 1; // total col index
    // Başlık satırı
    ws.getCell(r, 1).value = "";
    sizes.forEach((s, i) => { ws.getCell(r, 2 + i).value = s; });
    ws.getCell(r, startTotal).value = "TOPLAM";
    for (let i = 1; i <= nCols; i++) {
      const cell = ws.getCell(r, i);
      cell.font = { bold: true, size: 10, color: { argb: "FF374151" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TH } };
      cell.border = border;
      cell.alignment = { vertical: "middle", horizontal: "center" };
    }
    ws.getRow(r).height = 17;
    r++;
    // Değer satırları
    for (const row of sd.rows ?? []) {
      ws.getCell(r, 1).value = row.label;
      sizes.forEach((_, i) => { ws.getCell(r, 2 + i).value = row.values?.[i] ?? ""; });
      ws.getCell(r, startTotal).value = row.total ?? "";
      for (let i = 1; i <= nCols; i++) {
        const cell = ws.getCell(r, i);
        cell.border = border; cell.font = { size: 10.5, bold: i === 1 };
        cell.alignment = { vertical: "middle", horizontal: i === 1 ? "left" : "center", indent: i === 1 ? 1 : 0 };
      }
      ws.getRow(r).height = 16;
      r++;
    }
    r++;
  }

  // ── Uzun metin bölümleri ─────────────────────────────────────────────────────
  const textSection = (title: string, value: string | null) => {
    if (!value || !value.trim()) return;
    sectionBand(title);
    ws.mergeCells(`A${r}:I${r}`);
    const cell = ws.getCell(`A${r}`);
    cell.value = value.trim();
    cell.font = { size: 10.5, color: { argb: "FF1F2937" } };
    cell.alignment = { vertical: "top", horizontal: "left", wrapText: true, indent: 1 };
    for (let i = 1; i <= COLS; i++) ws.getCell(r, i).border = { left: thin, right: thin, bottom: thin };
    // ~110 karakter/satır (A:I ≈ 110 birim). 15pt/satır.
    const lines = estimateLines(value.trim(), 110);
    ws.getRow(r).height = Math.min(400, Math.max(20, lines * 14 + 6));
    r++;
    r++;
  };
  textSection("Yıkama Talimatı", sheet.wash_instruction);
  textSection("Kumaş / Astar", sheet.fabric_lining);
  textSection("Kumaş Bilgisi", sheet.fabric_info);
  textSection("Aksesuar Bilgisi", sheet.accessories_info);
  textSection("Süslemeler ve Aksesuar Açıklaması", sheet.embellishments);
  textSection("Dikiş Talimatı", sheet.sewing_instruction);
  textSection("Özel İşçilik Notları", sheet.workmanship_notes);
  textSection("Kalite Kontrol Revizyon Tarihi", sheet.qc_revision);
  textSection("Revizyon Notları", sheet.revision_notes);
  textSection("Üretim Fire Payı", sheet.production_waste);

  // ── Görseller — föye eklenen fotoğraflar (teknik çizim, kumaş, detay) ────────
  const photos = Array.isArray(sheet.photo_refs) ? sheet.photo_refs.filter((p) => p?.url) : [];
  if (photos.length) {
    // Görselleri paralel indir (başarısız olan atlanır — export yine üretilir).
    const SECTION_TR: Record<string, string> = {
      technical_drawing: "Teknik çizim", fabric: "Kumaş / astar",
      accessories: "Aksesuar", embellishments: "Süsleme", sewing: "Dikiş / numune",
      general: "Görsel",
    };
    const fetched = await Promise.all(
      photos.map(async (p) => {
        try {
          const res = await fetch(p.url);
          if (!res.ok) return null;
          const buf = Buffer.from(await res.arrayBuffer());
          const lower = (p.path || p.url).toLowerCase();
          const ext: "jpeg" | "png" | "gif" =
            lower.endsWith(".png") ? "png" : lower.endsWith(".gif") ? "gif" : "jpeg";
          return { buf, ext, section: p.section };
        } catch {
          return null;
        }
      }),
    );
    const ok = fetched.filter((f): f is NonNullable<typeof f> => f !== null);
    if (ok.length) {
      sectionBand("Görseller");
      const startRow = r; // 1-tabanlı
      const perRow = 2;
      const imgW = 300, imgH = 210;
      const gapRows = 16; // ~16*14px ≈ 224px > imgH
      ok.forEach((img, i) => {
        const rb = Math.floor(i / perRow);
        const cb = i % perRow;
        const imageId = wb.addImage({ buffer: img.buf as unknown as ExcelJS.Buffer, extension: img.ext });
        // Bölüm etiketi (görselin üstünde)
        const labelRow = startRow + rb * gapRows;
        const labelCell = ws.getCell(labelRow, cb === 0 ? 1 : 5);
        labelCell.value = SECTION_TR[img.section] ?? "Görsel";
        labelCell.font = { size: 9, italic: true, color: { argb: "FF9CA3AF" } };
        ws.addImage(imageId, {
          tl: { col: cb === 0 ? 0.1 : 4.55, row: labelRow + 0.05 } as ExcelJS.Anchor,
          ext: { width: imgW, height: imgH },
          editAs: "oneCell",
        });
      });
      const blockRows = Math.ceil(ok.length / perRow) * gapRows;
      for (let k = startRow; k < startRow + blockRows; k++) ws.getRow(k).height = 14;
      r = startRow + blockRows + 1;
    }
  }

  // ── Alt bilgi — kim girdi izi ────────────────────────────────────────────────
  ws.mergeCells(`A${r}:I${r}`);
  const foot = ws.getCell(`A${r}`);
  const updated = (() => { try { return new Date(sheet.updated_at).toLocaleDateString("tr-TR"); } catch { return ""; } })();
  foot.value = `Oluşturan: ${nameOf(sheet.created_by)}   ·   Son giren: ${nameOf(sheet.updated_by)}   ·   Son güncelleme: ${updated}`;
  foot.font = { size: 9, italic: true, color: { argb: "FF9CA3AF" } };
  foot.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(r).height = 18;
}

/** Tek föyü biçimli bir çalışma kitabı olarak üretir. */
export async function buildProductionSheetWorkbook(
  sheet: ProductionSheet,
  memberNames: Record<string, string>,
): Promise<Buffer> {
  const wb = newWorkbook();
  await addProductionSheet(wb, sheet, memberNames, new Set());
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Tüm föyleri TEK dosyada, her föy ayrı sekme olacak şekilde üretir. */
export async function buildAllProductionSheetsWorkbook(
  sheets: ProductionSheet[],
  memberNames: Record<string, string>,
): Promise<Buffer> {
  const wb = newWorkbook();
  const used = new Set<string>();
  // Sekmeler başlığa göre sıralı; görsel indirmeleri sekme sekme sıralı işlenir.
  for (const sheet of sheets) {
    await addProductionSheet(wb, sheet, memberNames, used);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
