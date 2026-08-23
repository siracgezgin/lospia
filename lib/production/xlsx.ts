// Üretim Föyü → Excel (.xlsx). Aslı Hanım'ın alışkın olduğu föy düzenini sadık
// biçimde üretir: koyu başlık şeridi, 2 kolonlu ürün bilgisi, ölçüler/teslim
// tabloları, beden dağılımı ızgarası ve talimat bölümleri. ExcelJS ile tam
// biçimlendirme (kalın başlıklar, gölgeli şeritler, kenarlıklar, kaydırılmış
// uzun metin). Salt-yazım; kullanıcı verisi güvenli.
import ExcelJS from "exceljs";
import type { ProductionSheet } from "@/types";
import { categoryLabel, subcategoryLabel } from "@/lib/collection/taxonomy";
import {
  totalQuantity, quantityBySize, orderSizes, canonicalSize, formatMoney,
  STANDARD_SIZES,
  unitCostOf,
} from "@/lib/collection/cost";

const COLS = 9; // A–I
const INK = "FF1F2937"; // koyu başlık şeridi
const TH = "FFE5E7EB"; // tablo başlığı
const LINE = "FFD9DCE1"; // ince kenarlık

const thin = { style: "thin" as const, color: { argb: LINE } };
const border = { top: thin, left: thin, bottom: thin, right: thin };

function estimateLines(text: string, charsPerLine: number): number {
  const paras = text.split("\n");
  let lines = 0;
  for (const p of paras) lines += Math.max(1, Math.ceil((p.length || 1) / charsPerLine));
  return lines;
}

/**
 * Görselin piksel ölçüsü — PNG ve JPEG başlığından okunur.
 * ExcelJS sabit `ext` istiyor; oranı bilmeden yerleştirince fotoğraf geriliyor
 * (Aslı Hanım, 2026-08-24: "teknik çizim kısmı böyle olmamalıydı").
 * Okunamayan biçimde null döner ve çağıran kutuyu doldurmaya çalışmaz.
 */
function imageSize(buf: Buffer): { w: number; h: number } | null {
  // PNG: 8 bayt imza + IHDR → 16..24 arası genişlik/yükseklik
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  // JPEG: SOF0..SOF15 işaretçisini tara (SOF4/SOF8/SOF12 hariç)
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

/** Görseli kutuya SIĞDIRIR (contain): taşmaz, gerilmez, ortalanır. */
function fitBox(
  buf: Buffer, boxW: number, boxH: number,
): { w: number; h: number; dx: number; dy: number } {
  const sz = imageSize(buf);
  if (!sz || !sz.w || !sz.h) return { w: boxW, h: boxH, dx: 0, dy: 0 };
  const k = Math.min(boxW / sz.w, boxH / sz.h);
  const w = Math.round(sz.w * k);
  const h = Math.round(sz.h * k);
  return { w, h, dx: Math.round((boxW - w) / 2), dy: Math.round((boxH - h) / 2) };
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
    pageSetup: {
      paperSize: 9, orientation: "portrait",
      fitToPage: true, fitToWidth: 1, fitToHeight: 1,
      margins: { left: 0.3, right: 0.3, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 },
    },
  });

  // Kolon genişlikleri ORİJİNAL föyle birebir (uretim_foyu/…Beyaz Dantel Etek).
  ws.columns = [
    { width: 8 }, { width: 13 }, { width: 12 }, { width: 12 },
    { width: 12 }, { width: 12 }, { width: 9 }, { width: 9 }, { width: 9 },
  ];

  const txt = (v: unknown) => String(v ?? "").trim();
  const nameOf = (id: string | null) => (id && memberNames[id]) || "—";

  /** A..I boyunca kenarlık — form hissi orijinaldeki gibi çizgiyle kurulur. */
  const boxRow = (r: number, from = 1, to = COLS) => {
    for (let c = from; c <= to; c++) ws.getCell(r, c).border = border;
  };

  /** "ETİKET: değer" — orijinalde etiket ve değer AYNI hücrededir. */
  const labelValue = (addr: string, merge: string, label: string, value: string) => {
    ws.mergeCells(merge);
    const c = ws.getCell(addr);
    c.value = value ? `${label} ${value}` : label;
    c.font = { size: 10.5, color: { argb: INK } };
    c.alignment = { vertical: "middle", indent: 1 };
    return c;
  };

  // ── 1. Başlık ──────────────────────────────────────────────────────────────
  ws.mergeCells("A1:I1");
  const title = ws.getCell("A1");
  title.value = "ÜRETİM FÖYÜ";
  title.font = { bold: true, size: 14, color: { argb: INK } };
  title.alignment = { vertical: "middle", horizontal: "center" };
  boxRow(1);
  ws.getRow(1).height = 31;

  // ── 2..5. Sipariş bilgisi — solda dört satır, sağda dört satır ─────────────
  const info: [string, string, string, string][] = [
    ["ÜRÜN KODU:", txt(sheet.product_code), "ÜRETİM TARİHİ:", txt(sheet.production_date)],
    ["ÜRÜN CİNSİ:", txt(sheet.product_kind), "TESLİM TARİHİ:", txt(sheet.delivery_date)],
    ["ÜRETİCİ:", txt(sheet.producer), "SEZON :", txt(sheet.season)],
    ["ÜRÜNÜN AÇIKLAMASI:", txt(sheet.description), "1 ÜRÜNE GİDEN METRAJ :", txt(sheet.meterage)],
  ];
  info.forEach(([ll, lv, rl, rv], i) => {
    const r = 2 + i;
    labelValue(`A${r}`, `A${r}:D${r}`, ll, lv);
    labelValue(`E${r}`, `E${r}:I${r}`, rl, rv);
    boxRow(r);
    ws.getRow(r).height = 18;
  });
  // "Dikim teslim tarihi" orijinal föyde yok ama Aslı Hanım 2026-08-19'da
  // ayrıca istedi: "Bir ürünlerin teslim tarihi, bir de dikim teslim tarihi
  // lazım." Sipariş bloğunun altına, aynı biçimde eklenir.
  labelValue("A6", "A6:D6", "DİKİM TESLİM TARİHİ:", txt(sheet.sewing_delivery_date));
  labelValue("E6", "E6:I6", "RENK :", txt(sheet.colorway));
  boxRow(6);
  ws.getRow(6).height = 18;

  // ── 7. ÖLÇÜLER başlığı + sağda TEKNİK ÇİZİM alanı ─────────────────────────
  const MEAS_HEAD = 7;
  const ROWS_PER_TABLE = 9; // orijinalde 9 numaralı satır — boşlar elle doldurulur
  const th = (addr: string, merge: string | null, text: string, center = false) => {
    if (merge) ws.mergeCells(merge);
    const c = ws.getCell(addr);
    c.value = text;
    c.font = { bold: true, size: 10.5, color: { argb: INK } };
    c.alignment = { vertical: "middle", horizontal: center ? "center" : "left", indent: center ? 0 : 1 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TH } };
  };
  th(`A${MEAS_HEAD}`, null, "No", true);
  th(`B${MEAS_HEAD}`, `B${MEAS_HEAD}:C${MEAS_HEAD}`, "ÖLÇÜLER");
  th(`D${MEAS_HEAD}`, null, "(Cm)", true);
  th(`E${MEAS_HEAD}`, `E${MEAS_HEAD}:I${MEAS_HEAD}`, "TEKNİK ÇİZİM", true);
  boxRow(MEAS_HEAD);
  ws.getRow(MEAS_HEAD).height = 18;

  const measurements = (sheet.measurements ?? []).filter((m) => txt(m.label) || txt(m.value));
  for (let i = 0; i < ROWS_PER_TABLE; i++) {
    const r = MEAS_HEAD + 1 + i;
    const m = measurements[i];
    ws.getCell(`A${r}`).value = i + 1;
    ws.getCell(`A${r}`).alignment = { vertical: "middle", horizontal: "center" };
    ws.mergeCells(`B${r}:C${r}`);
    ws.getCell(`B${r}`).value = m ? txt(m.label) : "";
    ws.getCell(`D${r}`).value = m ? txt(m.value) : "";
    for (const c of ["A", "B", "C", "D"]) {
      const cell = ws.getCell(`${c}${r}`);
      cell.border = border;
      if (c !== "A") cell.font = { size: 10.5 };
      cell.alignment = { vertical: "middle", horizontal: c === "A" || c === "D" ? "center" : "left", indent: c === "B" ? 1 : 0 };
    }
    // Çizim alanının çerçevesi (görsel gelmese de yer belli olsun).
    for (let c = 5; c <= COLS; c++) ws.getCell(r, c).border = border;
    ws.getRow(r).height = 17;
  }
  const drawTop = MEAS_HEAD;

  // ── TESLİM EDİLEN ÜRÜNLER ─────────────────────────────────────────────────
  const DELIV_HEAD = MEAS_HEAD + ROWS_PER_TABLE + 1;
  /* TAM GENİŞLİK. Orijinal föyde bu tablo da A:D idi ve sağı boş kalıyordu;
     Aslı Hanım (2026-08-24): "Alt tarafı neden boşluk?" Teknik çizim yalnız
     ölçülerin sağında duruyor, altında boş bir sütun bırakmanın karşılığı yok —
     tablo sayfanın tamamını kullanır, ürün adına da yer açılır. */
  th(`A${DELIV_HEAD}`, null, "No", true);
  th(`B${DELIV_HEAD}`, `B${DELIV_HEAD}:G${DELIV_HEAD}`, "TESLİM EDİLEN ÜRÜNLER");
  th(`H${DELIV_HEAD}`, `H${DELIV_HEAD}:I${DELIV_HEAD}`, "ADET", true);
  boxRow(DELIV_HEAD);
  ws.getRow(DELIV_HEAD).height = 18;

  const delivered = (sheet.delivered_items ?? []).filter((d) => txt(d.label) || txt(d.qty));
  for (let i = 0; i < ROWS_PER_TABLE; i++) {
    const r = DELIV_HEAD + 1 + i;
    const d = delivered[i];
    ws.getCell(`A${r}`).value = i + 1;
    ws.getCell(`A${r}`).alignment = { vertical: "middle", horizontal: "center" };
    ws.mergeCells(`B${r}:G${r}`);
    ws.getCell(`B${r}`).value = d ? txt(d.label) : "";
    ws.mergeCells(`H${r}:I${r}`);
    ws.getCell(`H${r}`).value = d ? txt(d.qty) : "";
    for (let c = 1; c <= COLS; c++) {
      const cell = ws.getCell(r, c);
      cell.border = border;
      cell.font = { size: 10.5 };
      cell.alignment = { vertical: "middle", horizontal: c === 1 || c >= 8 ? "center" : "left", indent: c === 2 ? 1 : 0 };
    }
    ws.getRow(r).height = 17;
  }

  // ── BEDEN DAĞILIMI — tek satır başlık, altında etiket ve adet ─────────────
  let r = DELIV_HEAD + ROWS_PER_TABLE + 1;
  const sd = sheet.size_distribution;
  const rawSizes = sd?.sizes ?? [];
  const dataRows = sd?.rows ?? [];
  const groups = sd?.groups ?? {};

  /* BOŞ BEDEN KOLONU ÇİZİLMEZ. Föyde XS · XS-S · S · S-M · M · M-L gibi yedi
     kolon çıkıyordu; çoğu tamamen boştu (Aslı Hanım, 2026-08-24: "optimum bir
     Excel formatı değil bu"). Bir bedende ne adet ne grup etiketi varsa o
     kolonun kâğıtta yeri yok. */
  const usedRaw = rawSizes
    .map((sz, i) => ({ sz, i }))
    .filter(({ sz, i }) =>
      dataRows.some((row) => txt(row.values?.[i])) || txt(groups[sz]));
  const sizes = orderSizes(usedRaw.map((x) => x.sz)).slice(0, COLS - 3);
  const srcIndex = sizes.map((sz) => rawSizes.findIndex((x) => canonicalSize(x) === sz));
  const FIRST_SIZE = 3;
  const totalCol = FIRST_SIZE + sizes.length;

  const sizeRow = (label: string, values: string[], total: string, head = false) => {
    ws.mergeCells(r, 1, r, 2);
    ws.getCell(r, 1).value = label;
    values.forEach((v, i) => { ws.getCell(r, FIRST_SIZE + i).value = v; });
    ws.getCell(r, totalCol).value = total;
    // Kenarlık TOPLAM kolonunda biter; sağdaki boş hücreler çizilmez.
    for (let c = 1; c <= totalCol; c++) {
      const cell = ws.getCell(r, c);
      cell.border = border;
      cell.font = { bold: head || c <= 2, size: 10.5, color: { argb: INK } };
      if (head) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TH } };
      cell.alignment = { vertical: "middle", horizontal: c <= 2 ? "left" : "center", indent: c <= 2 ? 1 : 0 };
    }
    ws.getRow(r).height = 18;
    r++;
  };

  if (sizes.length) {
    sizeRow("BEDEN DAĞILIMI", sizes, "TOPLAM", true);
    /* "BEDEN ETİKETİ" İKİ KEZ yazılıyordu: biri size_distribution.groups'tan,
       biri de rows içinde aynı adla duran satırdan. Grup satırı yalnız rows'ta
       karşılığı YOKSA yazılır. */
    const hasLabelRow = dataRows.some((row) =>
      /beden\s*etiket/i.test(txt(row.label)));
    if (!hasLabelRow && Object.keys(groups).length) {
      sizeRow("BEDEN ETİKETİ", sizes.map((sz, i) => groups[sz] ?? groups[rawSizes[srcIndex[i]]] ?? ""), "");
    }
    for (const row of dataRows) {
      sizeRow(
        (row.label || "ÜRETİM ADETİ").toLocaleUpperCase("tr-TR"),
        srcIndex.map((si) => (si >= 0 ? txt(row.values?.[si]) : "")),
        txt(row.total),
      );
    }
  }

  // ── Metin blokları — orijinaldeki sıra ve etiketlerle ─────────────────────
  //  Etiketler UZUN ve açıklayıcı: "KUMAŞ BİLGİSİ : CİNSİ, DESEN YÖNÜ,
  //  PANTONE RENGİ…" — üreticiye ne yazılacağını söyleyen kısım orada.
  const textRow = (label: string, value: string | null, minLines = 1) => {
    ws.mergeCells(r, 1, r, 2);
    const l = ws.getCell(r, 1);
    l.value = label;
    l.font = { bold: true, size: 9.5, color: { argb: INK } };
    l.alignment = { vertical: "top", wrapText: true, indent: 1 };
    ws.mergeCells(r, 3, r, COLS);
    const v = ws.getCell(r, 3);
    v.value = txt(value);
    v.font = { size: 10 };
    v.alignment = { vertical: "top", wrapText: true, indent: 1 };
    boxRow(r);
    /* Satır yüksekliği İKİ metnin uzunuyla belirlenir. Etiket sütunu (A:B)
       ~21 karakter genişliğinde; "AKSESUARLAR BİLGİSİ : ÇITÇIT, DÜĞME…" gibi
       uzun etiketler 26 karakterle hesaplanınca satıra sığmayıp bir alttakinin
       üstüne biniyordu. */
    const lines = Math.max(minLines, estimateLines(txt(value) || " ", 78), estimateLines(label, 20));
    ws.getRow(r).height = Math.min(220, Math.max(20, lines * 12 + 6));
    r++;
  };

  textRow("YIKAMA TALİMATI", sheet.wash_instruction);
  textRow("KUMAŞ / ASTAR", sheet.fabric_lining, 3);
  textRow("KUMAŞ BİLGİSİ : CİNSİ, DESEN YÖNÜ, PANTONE RENGİ, GRAMAJ, ESNEME PAYI, ÇEKME ORANI", sheet.fabric_info, 3);
  textRow("AKSESUARLAR BİLGİSİ : ÇITÇIT, DÜĞME, KOPÇA, TAŞ, BONCUK, SÜSLEMELER ve ETİKET", sheet.accessories_info, 3);
  textRow("SÜSLEMELER VE AKSESUAR AÇIKLAMASI", sheet.embellishments, 2);
  textRow("DİKİŞ TALİMATI :", sheet.sewing_instruction, 3);
  textRow("ÖZEL İŞÇİLİK NOTLARI :", sheet.workmanship_notes, 2);
  textRow("KALITE KONTROL REVIZYON TARIHI :", sheet.qc_revision);
  textRow("REVIZYON NOTLARI :", sheet.revision_notes);
  textRow("ÜRETİM FİRE PAYI:", sheet.production_waste);
  textRow("Fotoğraf Referansları :", null, 2);

  // ── Görseller ─────────────────────────────────────────────────────────────
  //  TEKNİK ÇİZİM ön/arka → ölçü tablosunun SAĞINDAKİ alana (orijinaldeki yeri).
  //  Diğer görseller "Fotoğraf Referansları" satırının altına.
  const photos = Array.isArray(sheet.photo_refs) ? sheet.photo_refs.filter((p) => p?.url) : [];
  if (photos.length) {
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

    const place = (
      img: { buf: Buffer; ext: "jpeg" | "png" | "gif" },
      col: number, row: number, w: number, h: number,
    ) => {
      const id = wb.addImage({ buffer: img.buf as unknown as ExcelJS.Buffer, extension: img.ext });
      ws.addImage(id, { tl: { col, row } as ExcelJS.Anchor, ext: { width: w, height: h }, editAs: "oneCell" });
    };

    const front = ok.find((f) => f.section === "technical_drawing_front")
      ?? ok.find((f) => f.section === "technical_drawing");
    const back = ok.find((f) => f.section === "technical_drawing_back");

    /* Çizim kutusu ÖLÇÜLER + TESLİM EDİLEN ÜRÜNLER tablolarının ikisi boyunca
       uzanır. Aslı Hanım (2026-08-24): "Alt tarafı neden boşluk?" — orijinal
       föyde de orası boştu ama boşuna duruyordu; kutuyu aşağı uzatınca çizim
       iki katı büyüklükte ve okunur oluyor.
       Görseller kutuya SIĞDIRILIR (contain): en-boy oranı korunur, ortalanır. */
    const drawFirst = MEAS_HEAD + 1;
    const drawLast = MEAS_HEAD + ROWS_PER_TABLE;
    const boxH = (drawLast - drawFirst + 1) * 17 - 8;   // satır yüksekliği 17pt
    const half = 175;                                    // E:I ≈ 2 × 175px
    const put = (img: { buf: Buffer; ext: "jpeg" | "png" | "gif" }, colBase: number) => {
      const f = fitBox(img.buf, half, boxH);
      const id = wb.addImage({ buffer: img.buf as unknown as ExcelJS.Buffer, extension: img.ext });
      ws.addImage(id, {
        tl: { col: colBase, row: drawFirst - 1 } as ExcelJS.Anchor,
        ext: { width: f.w, height: f.h },
        editAs: "oneCell",
      });
    };
    if (front) put(front, 4.05);
    if (back) put(back, 6.6);

    const rest = ok.filter((f) => f !== front && f !== back);
    if (rest.length) {
      const startRow = r;
      const perRow = 3, imgW = 170, imgH = 130, gapRows = 9;
      rest.forEach((img, i) => {
        const rb = Math.floor(i / perRow), cb = i % perRow;
        place(img, cb * 3 + 0.1, startRow + rb * gapRows + 0.05, imgW, imgH);
      });
      const blockRows = Math.ceil(rest.length / perRow) * gapRows;
      for (let k = startRow; k < startRow + blockRows; k++) ws.getRow(k).height = 14;
      r = startRow + blockRows + 1;
    }
  }

  // ── Künye ─────────────────────────────────────────────────────────────────
  ws.mergeCells(r, 1, r, COLS);
  const foot = ws.getCell(r, 1);
  foot.value = `Oluşturan: ${nameOf(sheet.created_by)}   ·   Son giren: ${nameOf(sheet.updated_by)}   ·   Son güncelleme: ${new Date(sheet.updated_at).toLocaleDateString("tr-TR")}`;
  foot.font = { size: 9, italic: true, color: { argb: "FF9CA3AF" } };
  foot.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(r).height = 18;

  ws.pageSetup.printArea = `A1:I${r}`;
}

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

// ── Maliyet tablosu → Excel (Aslı'nın "Üretim Adetleri" sayfası karşılığı) ──────
type CostRow = Pick<
  ProductionSheet,
  "id" | "title" | "product_kind" | "category" | "subcategory" | "pricing" | "size_distribution"
>;

/** Tüm ürünlerin maliyetini Excel'deki düzende (beden kolonları + toplam) üretir. */
export function buildCostWorkbook(rows: CostRow[]): Promise<Buffer> {
  const wb = newWorkbook();
  const ws = wb.addWorksheet("Maliyet", {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  // Beden kolonları — tüm standart bedenler (ekrandaki maliyet tablosuyla aynı)
  // + veride olan standart-dışı bedenler.
  const sizeSet = new Set<string>(STANDARD_SIZES);
  for (const row of rows) Object.keys(quantityBySize(row.size_distribution)).forEach((s) => sizeSet.add(s));
  const sizes = orderSizes([...sizeSet]);

  // Kolonlar: Ürün | {beden} | TOPLAM ADET | BİRİM FİYAT | TOPLAM
  const nCols = 1 + sizes.length + 3;
  const totalAdetCol = 1 + sizes.length + 1;
  const birimCol = totalAdetCol + 1;
  const toplamCol = birimCol + 1;
  ws.columns = [
    { width: 30 },
    ...sizes.map(() => ({ width: 8 })),
    { width: 13 }, { width: 13 }, { width: 15 },
  ];
  let r = 1;

  // Başlık şeridi
  ws.mergeCells(r, 1, r, nCols);
  const title = ws.getCell(r, 1);
  title.value = "MALİYET — BİRİM MALİYET × ÜRETİM ADEDİ";
  title.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  title.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  for (let c = 1; c <= nCols; c++) {
    ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
  }
  ws.getRow(r).height = 26;
  r++;
  r++;

  // Tablo başlığı
  const headers = ["ÜRÜN", ...sizes, "TOPLAM ADET", "BİRİM MALİYET", "TOPLAM"];
  headers.forEach((h, i) => {
    const cell = ws.getCell(r, i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10, color: { argb: "FF374151" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TH } };
    cell.border = border;
    cell.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "center", indent: i === 0 ? 1 : 0 };
  });
  ws.getRow(r).height = 18;
  r++;

  const money = (n: number) => (n > 0 ? formatMoney(n) : "");
  let grand = 0;

  for (const row of rows) {
    const qbs = quantityBySize(row.size_distribution);
    const qty = totalQuantity(row.size_distribution);
    // Birim MALİYET = kalemlerin toplamı (Aslı Hanım, 2026-08-19).
    const unit = unitCostOf(row.pricing);
    const lineTotal = qty * unit;
    grand += lineTotal;

    ws.getCell(r, 1).value = row.title;
    sizes.forEach((s, i) => { ws.getCell(r, 2 + i).value = qbs[s] || ""; });
    ws.getCell(r, totalAdetCol).value = qty || "";
    ws.getCell(r, birimCol).value = money(unit);
    ws.getCell(r, toplamCol).value = money(lineTotal);

    for (let i = 1; i <= nCols; i++) {
      const cell = ws.getCell(r, i);
      cell.border = border;
      cell.font = { size: 10.5, bold: i === toplamCol };
      cell.alignment = { vertical: "middle", horizontal: i === 1 ? "left" : i >= birimCol ? "right" : "center", indent: i === 1 || i >= birimCol ? 1 : 0 };
    }
    ws.getRow(r).height = 16;
    r++;
  }

  // Genel toplam
  ws.mergeCells(r, 1, r, toplamCol - 1);
  const gt = ws.getCell(r, 1);
  gt.value = "GENEL TOPLAM (KDV hariç)";
  gt.font = { bold: true, size: 12, color: { argb: INK } };
  gt.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
  const gtv = ws.getCell(r, toplamCol);
  gtv.value = formatMoney(grand);
  gtv.font = { bold: true, size: 13, color: { argb: INK } };
  gtv.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
  for (let i = 1; i <= nCols; i++) {
    ws.getCell(r, i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TH } };
    ws.getCell(r, i).border = { top: { style: "medium", color: { argb: LINE } } };
  }
  ws.getRow(r).height = 24;

  return wb.xlsx.writeBuffer().then((b) => Buffer.from(b));
}
