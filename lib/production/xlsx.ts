// Üretim Föyü → Excel (.xlsx). Aslı Hanım'ın alışkın olduğu föy düzenini sadık
// biçimde üretir: koyu başlık şeridi, 2 kolonlu ürün bilgisi, ölçüler/teslim
// tabloları, beden dağılımı ızgarası ve talimat bölümleri. ExcelJS ile tam
// biçimlendirme (kalın başlıklar, gölgeli şeritler, kenarlıklar, kaydırılmış
// uzun metin). Salt-yazım; kullanıcı verisi güvenli.
import ExcelJS from "exceljs";
import type { ProductionSheet } from "@/types";
import { categoryLabel, subcategoryLabel } from "@/lib/collection/taxonomy";
import {
  costOfSheet, totalQuantity, quantityBySize, orderSizes, canonicalSize, formatMoney,
  STANDARD_SIZES,
  unitCostOf,
} from "@/lib/collection/cost";

const COLS = 9; // A–I
const INK = "FF1F2937"; // koyu başlık şeridi
const BAND = "FFF3F4F6"; // bölüm şeridi
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
    // fitToHeight: 1 → Asli Hanim (2026-08-23): "cikti aldigin zaman tek sayfada
    // ciksin." Onceki 0 "yukseklik serbest" demekti, foy iki-uc sayfaya boluyordu.
    pageSetup: {
      paperSize: 9, orientation: "portrait",
      fitToPage: true, fitToWidth: 1, fitToHeight: 1,
      margins: { left: 0.3, right: 0.3, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 },
    },
  });

  // Kolon genişlikleri (A–I).
  // A = sira no, B–D sol blok, E ince oluk, F–I sag blok.
  ws.columns = [
    { width: 4 }, { width: 26 }, { width: 15 }, { width: 13 },
    { width: 5 }, { width: 14 }, { width: 14 }, { width: 13 }, { width: 13 },
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
  // Marka adı bilerek YOK — Aslı Hanım (2026-08-19): "Şu Aslı Filinta'yı
  // yazma böyle… Logoya gerek yok kendi iç üretimimizde." Sağ üstte artık
  // ürün kodu durur (çıktıda sayfayı tanımlayan tek işaret).
  const brandCell = ws.getCell(`H${r}`);
  brandCell.value = sheet.product_code ?? "";
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

  // ── Ürün bilgileri — TEK kolon (A:D). Sağ yarı (F:I) teknik çizime ayrıldı.
  //    Aslı Hanım (2026-08-19): "Benim yukarıda çizimini görmem lazım. Teknik
  //    çizimini yukarıda sağda… teknik çizim ön, teknik çizim arka olacak."
  //    Çizimler eskiden föyün EN ALTINDA ayrı bir bölümdeydi ve tek başına
  //    16+ satır ekleyip çıktıyı üçüncü sayfaya taşıyordu.
  const infoStartRow = r;
  const infoRow = (label: string, value: string) => {
    const l = ws.getCell(`A${r}`); ws.mergeCells(`A${r}:B${r}`);
    l.value = label; l.font = { bold: true, size: 9, color: { argb: "FF6B7280" } };
    l.alignment = { vertical: "middle", indent: 1 };
    const v = ws.getCell(`C${r}`); ws.mergeCells(`C${r}:D${r}`);
    v.value = value || ""; v.font = { size: 10.5, color: { argb: INK } };
    v.alignment = { vertical: "middle" };
    v.border = { bottom: thin };
    ws.getRow(r).height = 16;
    r++;
  };
  infoRow("ÜRÜN KODU", sheet.product_code ?? "");
  infoRow("ÜRÜN CİNSİ", sheet.product_kind ?? "");
  infoRow("RENK", sheet.colorway ?? "");
  infoRow("SEZON", sheet.season ?? "");
  infoRow("KATEGORİ", sheet.category ? categoryLabel(sheet.category) : "");
  infoRow("ALT KATEGORİ", subcategoryLabel(sheet.category, sheet.subcategory));
  infoRow("ÜRETİCİ", sheet.producer ?? "");
  infoRow("ÜRETİM TARİHİ", sheet.production_date ?? "");
  infoRow("TESLİM TARİHİ", sheet.delivery_date ?? "");
  // "Bir ürünlerin teslim tarihi, bir de dikim teslim tarihi lazım."
  infoRow("DİKİM TESLİM TARİHİ", sheet.sewing_delivery_date ?? "");
  infoRow("1 ÜRÜNE METRAJ", sheet.meterage ?? "");
  const infoEndRow = r - 1;

  if ((sheet.description ?? "").trim()) {
    ws.mergeCells(`A${r}:D${r}`);
    const d = ws.getCell(`A${r}`);
    d.value = sheet.description!.trim();
    d.font = { size: 9.5, color: { argb: "FF374151" } };
    d.alignment = { vertical: "top", wrapText: true, indent: 1 };
    ws.getRow(r).height = Math.min(90, Math.max(16, estimateLines(sheet.description!.trim(), 55) * 12));
    r++;
  }

  // Teknik çizim başlıkları — bilgi bloğunun hizasında, sağ yarıda.
  const drawLabel = (col: string, text: string) => {
    const c = ws.getCell(`${col}${infoStartRow}`);
    c.value = text;
    c.font = { bold: true, size: 8.5, color: { argb: "FF6B7280" } };
    c.alignment = { vertical: "middle" };
  };
  ws.mergeCells(`F${infoStartRow}:G${infoStartRow}`);
  ws.mergeCells(`H${infoStartRow}:I${infoStartRow}`);
  drawLabel("F", "TEKNİK ÇİZİM — ÖN");
  drawLabel("H", "TEKNİK ÇİZİM — ARKA");
  // Çizim kutularının çerçevesi (görsel gelmezse de yer belli olur).
  for (let rr = infoStartRow + 1; rr <= infoEndRow; rr++) {
    for (const ci of [6, 7, 8, 9]) ws.getCell(rr, ci).border = border;
  }
  const drawingAnchor = { startRow: infoStartRow, endRow: infoEndRow };

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
  // Numara elle girilene değil SIRAYA bağlı: "Mesela üç numara niye boş?"
  measRows.forEach((m, mi) => {
    ws.getCell(`A${r}`).value = String(mi + 1);
    ws.mergeCells(`B${r}:G${r}`); ws.getCell(`B${r}`).value = m.label;
    ws.mergeCells(`H${r}:I${r}`); ws.getCell(`H${r}`).value = m.value;
    for (let i = 1; i <= COLS; i++) {
      const cell = ws.getCell(r, i);
      cell.border = border; cell.font = { size: 10.5 };
      cell.alignment = { vertical: "middle", horizontal: i === 1 ? "center" : "left", indent: i === 1 ? 0 : 1 };
    }
    ws.getRow(r).height = 16;
    r++;
  });
  r++;

  // TESLİM EDİLEN ÜRÜNLER artık Beden Dağılımı'nın ALTINDA — "Teslim edilen
  // ürünler yukarıda olmaz, önce siparişi görmemiz lazım." Bölümü tek yerden
  // çizen yardımcı; çağrısı aşağıda.
  const deliveredSection = () => {
  sectionBand("Teslim Edilen Ürünler");
  measHead("No", "ÜRÜN", "ADET");
  const delRows = sheet.delivered_items?.length ? sheet.delivered_items : [{ no: "", label: "", qty: "" }];
  delRows.forEach((d, di) => {
    ws.getCell(`A${r}`).value = String(di + 1);
    ws.mergeCells(`B${r}:G${r}`); ws.getCell(`B${r}`).value = d.label;
    ws.mergeCells(`H${r}:I${r}`); ws.getCell(`H${r}`).value = d.qty;
    for (let i = 1; i <= COLS; i++) {
      const cell = ws.getCell(r, i);
      cell.border = border; cell.font = { size: 10.5 };
      cell.alignment = { vertical: "middle", horizontal: i === 1 ? "center" : "left", indent: i === 1 ? 0 : 1 };
    }
    ws.getRow(r).height = 16;
    r++;
  });
  r++;
  };

  // ── BEDEN DAĞILIMI ───────────────────────────────────────────────────────────
  //  Etiket kolonu A:B BİRLEŞİK (tek A'ya "Üretim adeti" sığmıyordu), beden
  //  kolonları bu yüzden 3'ten başlar. Üç satırın da (başlık / grup / değer)
  //  aynı geometriyi kullanması şart — biri kayarsa tablo yanlış okunur.
  const sd = sheet.size_distribution;
  if (sd && Array.isArray(sd.sizes) && sd.sizes.length) {
    sectionBand("Beden Dağılımı");
    const FIRST = 3;                       // ilk beden kolonu (C)
    /* Beden sırası baskı görünümüyle AYNI kaynaktan (orderSizes): aynı föyün
       Excel'i ile kâğıdı farklı sırada beden göstermemeli. Değerler ada göre
       yeniden eşlenir — ham dizideki konumuna göre DEĞİL, yoksa sıralama
       adetleri karıştırır. */
    const rawSizes = sd.sizes;
    const sizes = orderSizes(rawSizes).slice(0, COLS - FIRST); // + TOPLAM için yer
    const srcIndex = sizes.map((sz) => rawSizes.findIndex((x) => canonicalSize(x) === sz));
    const totalCol = FIRST + sizes.length;
    const lastCol = totalCol;

    const gridRow = (
      label: string, values: string[], totalVal: string,
      opts: { head?: boolean; band?: boolean } = {},
    ) => {
      ws.mergeCells(r, 1, r, 2);
      ws.getCell(r, 1).value = label;
      values.forEach((v, i) => { ws.getCell(r, FIRST + i).value = v; });
      ws.getCell(r, totalCol).value = totalVal;
      for (let i = 1; i <= lastCol; i++) {
        const cell = ws.getCell(r, i);
        cell.border = border;
        cell.font = opts.head
          ? { bold: true, size: 10, color: { argb: "FF374151" } }
          : { size: 10.5, bold: opts.band || i <= 2 };
        if (opts.head) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TH } };
        else if (opts.band) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } };
        cell.alignment = {
          vertical: "middle",
          horizontal: i <= 2 ? "left" : "center",
          indent: i <= 2 ? 1 : 0,
        };
      }
      ws.getRow(r).height = 17;
      r++;
    };

    gridRow("", sizes, "TOPLAM", { head: true });
    // GRUP satırı — Aslı Hanım (2026-08-19): "Bedenlerin altına o ürünün gibi
    // bir sıra daha açacaksın. XS-S 1, M-L 2, XL-XXL 3, hepsi one size."
    const groups = sd.groups ?? {};
    if (Object.keys(groups).length) {
      // Grup etiketi hem kanonik hem ham adla aranır (eski föyler ham ada yazmış).
      gridRow(
        "GRUP",
        sizes.map((sz, i) => groups[sz] ?? groups[rawSizes[srcIndex[i]]] ?? ""),
        "", { band: true },
      );
    }
    for (const row of sd.rows ?? []) {
      gridRow(
        row.label,
        srcIndex.map((si) => (si >= 0 ? row.values?.[si] ?? "" : "")),
        row.total ?? "",
      );
    }
    r++;
  }

  // Sipariş (beden dağılımı) çizildikten SONRA teslim edilenler.
  deliveredSection();

  // ── MALİYET / FİYAT ──────────────────────────────────────────────────────────
  const cost = costOfSheet(sheet);
  const hasPricing =
    cost.unitPrice > 0 || cost.purchaseCost > 0 || cost.webSalePrice > 0 ||
    (sheet.pricing?.notes ?? "").trim().length > 0;
  if (hasPricing) {
    sectionBand("Maliyet / Fiyat");
    const money = (n: number) => (n > 0 ? formatMoney(n, cost.currency) : "");
    // Geometri metin bloklarıyla AYNI: sol A:B etiket / C:D değer,
    // sağ F:G etiket / H:I değer. Eski düzende sağ etiket tek E hücresindeydi;
    // E artık ince oluk olduğu için "SATIN ALMA MALİYETİ" → "SATIN" diye
    // kırpılıyordu.
    const priceRow = (leftLabel: string, leftVal: string, rightLabel: string, rightVal: string) => {
      const cell = (addr: string, merge: string, text: string, label: boolean) => {
        ws.mergeCells(merge);
        const c = ws.getCell(addr);
        c.value = text;
        c.font = label
          ? { bold: true, size: 9, color: { argb: "FF6B7280" } }
          : { size: 11, color: { argb: INK } };
        c.alignment = { vertical: "middle", indent: label ? 1 : 0 };
      };
      cell(`A${r}`, `A${r}:B${r}`, leftLabel, true);
      cell(`C${r}`, `C${r}:D${r}`, leftVal, false);
      cell(`F${r}`, `F${r}:G${r}`, rightLabel, true);
      cell(`H${r}`, `H${r}:I${r}`, rightVal, false);
      ws.getRow(r).height = 18;
      r++;
    };
    priceRow("BİRİM FİYAT", money(cost.unitPrice), "SATIN ALMA MALİYETİ", money(cost.purchaseCost));
    priceRow("WEB SATIŞ FİYATI", money(cost.webSalePrice), "TOPLAM ADET", cost.qty ? String(cost.qty) : "");
    // Üretim maliyeti — vurgulu satır (adet × birim)
    ws.mergeCells(`A${r}:E${r}`);
    const lbl = ws.getCell(`A${r}`);
    lbl.value = "ÜRETİM MALİYETİ (adet × birim)";
    lbl.font = { bold: true, size: 10.5, color: { argb: INK } };
    lbl.alignment = { vertical: "middle", indent: 1 };
    ws.mergeCells(`F${r}:I${r}`);
    const val = ws.getCell(`F${r}`);
    val.value = money(cost.lineTotal) || "—";
    val.font = { bold: true, size: 12, color: { argb: INK } };
    val.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
    for (let i = 1; i <= COLS; i++) {
      ws.getCell(r, i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TH } };
      ws.getCell(r, i).border = { top: thin, bottom: thin };
    }
    ws.getRow(r).height = 20;
    r++;
    if ((sheet.pricing?.notes ?? "").trim()) {
      ws.mergeCells(`A${r}:I${r}`);
      const n = ws.getCell(`A${r}`);
      n.value = `Not: ${sheet.pricing!.notes!.trim()}`;
      n.font = { size: 9.5, italic: true, color: { argb: "FF6B7280" } };
      n.alignment = { vertical: "middle", indent: 1 };
      r++;
    }
    r++; // boşluk
  }

  // ── Uzun metin bölümleri — İKİ KOLON ────────────────────────────────────────
  //  Eskiden her bölüm A:I boyunca tam genişlikteydi; on bölüm alt alta yığılıp
  //  çıktıyı tek başına ikinci sayfaya taşıyordu. Artık sol (A:D) ve sağ (F:I)
  //  yarıya ikişer ikişer dizilir — aynı içerik, yarı yükseklik.
  const blocks = ([
    ["Kumaş Bilgisi", sheet.fabric_info],
    ["Kumaş / Astar", sheet.fabric_lining],
    ["Süslemeler ve Aksesuar", sheet.embellishments],
    ["Aksesuar Bilgisi", sheet.accessories_info],
    ["Dikiş Talimatı", sheet.sewing_instruction],
    ["Özel İşçilik Notları", sheet.workmanship_notes],
    ["Yıkama Talimatı", sheet.wash_instruction],
    ["Üretim Fire Payı", sheet.production_waste],
    ["Kalite Kontrol Revizyon", sheet.qc_revision],
    ["Revizyon Notları", sheet.revision_notes],
  ] as [string, string | null][]).filter(([, v]) => (v ?? "").trim());

  if (blocks.length) {
    // Yarım genişlik ≈ 58 karakter/satır (A:D ve F:I birbirine yakın).
    const CHARS = 58;
    for (let i = 0; i < blocks.length; i += 2) {
      const pair = [blocks[i], blocks[i + 1]].filter(Boolean) as [string, string | null][];
      // Başlık satırı
      const titleRow = r;
      pair.forEach(([title], k) => {
        const c1 = k === 0 ? "A" : "F", c2 = k === 0 ? "D" : "I";
        ws.mergeCells(`${c1}${titleRow}:${c2}${titleRow}`);
        const c = ws.getCell(`${c1}${titleRow}`);
        c.value = title.toLocaleUpperCase("tr-TR");
        c.font = { bold: true, size: 9, color: { argb: INK } };
        c.alignment = { vertical: "middle", indent: 1 };
        c.border = { bottom: { style: "thin", color: { argb: INK } } };
      });
      ws.getRow(titleRow).height = 15;
      r++;
      // Gövde satırı — iki bloğun uzunu satır yüksekliğini belirler.
      const bodyRow = r;
      let lines = 1;
      pair.forEach(([, body], k) => {
        const c1 = k === 0 ? "A" : "F", c2 = k === 0 ? "D" : "I";
        const text = (body ?? "").trim();
        ws.mergeCells(`${c1}${bodyRow}:${c2}${bodyRow}`);
        const c = ws.getCell(`${c1}${bodyRow}`);
        c.value = text;
        c.font = { size: 9.5, color: { argb: INK } };
        c.alignment = { vertical: "top", horizontal: "left", wrapText: true, indent: 1 };
        lines = Math.max(lines, estimateLines(text, CHARS));
      });
      ws.getRow(bodyRow).height = Math.min(260, Math.max(16, lines * 12 + 4));
      r++;
      r++; // bölümler arası boşluk
    }
  }

  // ── Görseller ───────────────────────────────────────────────────────────────
  //  TEKNİK ÇİZİM ön/arka → yukarıda sağ üstteki ayrılmış alana yerleşir.
  //  Diğer görseller (kumaş, aksesuar, detay) föyün sonunda, iki sütun.
  const photos = Array.isArray(sheet.photo_refs) ? sheet.photo_refs.filter((p) => p?.url) : [];
  if (photos.length) {
    const SECTION_TR: Record<string, string> = {
      technical_drawing: "Teknik çizim",
      technical_drawing_front: "Teknik çizim — Ön",
      technical_drawing_back: "Teknik çizim — Arka",
      fabric: "Kumaş / astar",
      accessories: "Aksesuar", embellishments: "Süsleme", sewing: "Dikiş / numune",
      general: "Görsel",
    };
    // Paralel indir; başarısız olan atlanır — export yine üretilir.
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
      colStart: number, rowStart: number, w: number, h: number,
    ) => {
      const id = wb.addImage({ buffer: img.buf as unknown as ExcelJS.Buffer, extension: img.ext });
      ws.addImage(id, {
        tl: { col: colStart, row: rowStart } as ExcelJS.Anchor,
        ext: { width: w, height: h },
        editAs: "oneCell",
      });
    };

    // Sağ üstteki ayrılmış alan: satır yüksekliği 16pt × satır sayısı.
    const boxRows = drawingAnchor.endRow - drawingAnchor.startRow;
    const boxH = Math.max(60, boxRows * 21);
    const front = ok.find((f) => f.section === "technical_drawing_front")
      ?? ok.find((f) => f.section === "technical_drawing");
    const back = ok.find((f) => f.section === "technical_drawing_back");
    if (front) place(front, 5.05, drawingAnchor.startRow, 118, boxH);
    if (back) place(back, 7.05, drawingAnchor.startRow, 118, boxH);

    // Kalanlar — teknik çizim DIŞINDAKİLER, sonda iki sütun.
    const rest = ok.filter((f) => f !== front && f !== back);
    if (rest.length) {
      sectionBand("Görseller");
      const startRow = r;
      const perRow = 2, imgW = 240, imgH = 170, gapRows = 12;
      rest.forEach((img, i) => {
        const rb = Math.floor(i / perRow), cb = i % perRow;
        const labelRow = startRow + rb * gapRows;
        const labelCell = ws.getCell(labelRow, cb === 0 ? 1 : 6);
        labelCell.value = SECTION_TR[img.section] ?? "Görsel";
        labelCell.font = { size: 8.5, italic: true, color: { argb: "FF9CA3AF" } };
        place(img, cb === 0 ? 0.1 : 5.05, labelRow + 0.05, imgW, imgH);
      });
      const blockRows = Math.ceil(rest.length / perRow) * gapRows;
      for (let k = startRow; k < startRow + blockRows; k++) ws.getRow(k).height = 14;
      r = startRow + blockRows + 1;
    }
  }

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
