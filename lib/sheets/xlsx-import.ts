/**
 * YÜKLENEN .XLSX → SİSTEMİN KENDİ TABLOSU.
 *
 * Sıraç (2026-09-16): "Ee düzenleme nerde?"
 *
 * Yüklenen Excel önce yalnız salt okunur gösteriliyordu. Düzenlemenin iki yolu
 * vardı ve ikisi aynı şey değil:
 *
 *   (a) DOSYAYI YERİNDE DÜZENLE — ızgarada değiştir, .xlsx'i yeniden yaz.
 *       REDDEDİLDİ: her kayıtta dosyayı baştan üretmek demek. ExcelJS'in
 *       okuyamadığı her şey (grafik, pivot, koşullu biçim, gömülü görsel,
 *       veri doğrulama) sessizce SİLİNİR. Kullanıcı "bir hücreyi düzelttim"
 *       sanırken dosyanın yarısını kaybedebilir.
 *
 *   (b) SİSTEME AKTAR — içeriği uygulamanın kendi tablo modeline çevir, orada
 *       düzenle. Seçilen bu. Uygulamanın tablo düzenleyicisi zaten var, çok
 *       kullanıcılı, sürüm tutuyor ve ekip onu zaten kullanıyor (Üretim
 *       Föyleri, AFR-AF hep "Tablo").
 *
 * YÜKLENEN DOSYA SİLİNMEZ. Aktarım bir KOPYA üretir; orijinal .xlsx Drive'da
 * olduğu gibi durur. Böylece "hangi kopya doğru?" sorusunun cevabı bellidir:
 * orijinal = geldiği hâli, tablo = üstünde çalıştığımız hâli. Dönüşümde bir
 * şey kaybolursa orijinal hâlâ yerinde.
 */

import type { Cell, CellStyle, NumberFormat, Sheet, WorkbookSnapshot } from "./model";
import { key, newSheetId, DEFAULT_COL_W, MAX_ROWS, MAX_COLS } from "./model";

/** ExcelJS'ten okunan ham hücre — kütüphane tipine bağlanmadan. */
type RawCell = {
  value: unknown;
  formula?: string;
  numFmt?: string;
  font?: { bold?: boolean; italic?: boolean; underline?: unknown; color?: { argb?: string } };
  alignment?: { horizontal?: string; wrapText?: boolean };
  fill?: { type?: string; fgColor?: { argb?: string } };
  border?: Record<string, unknown>;
};

/** "FFAABBCC" → "#aabbcc". Tema rengi ya da alfa'sı sıfır olan renk atlanır. */
function argbToHex(argb?: string): string | undefined {
  if (!argb || argb.length !== 8) return undefined;
  const a = argb.slice(0, 2).toLowerCase();
  if (a === "00") return undefined;
  return `#${argb.slice(2).toLowerCase()}`;
}

/** Excel sayı biçimi → modelin bildiği tür. Tam eşleme değil, OKUNUR bir
 *  yaklaşım: para/yüzde/tarih ayırt edilir, gerisi otomatiğe bırakılır. */
function numberFormatOf(numFmt?: string): { n?: NumberFormat; d?: number } {
  if (!numFmt || numFmt === "General") return {};
  const f = numFmt.toLowerCase();
  if (f.includes("%")) return { n: "percent" };
  if (/[₺$€£]|\btry\b|\busd\b|\beur\b/.test(f)) return { n: "money", d: 2 };
  if (/[ymdhs]/.test(f) && !/[#0]/.test(f.replace(/\[[^\]]*\]/g, ""))) return { n: "date" };
  if (f === "@") return { n: "text" };
  const dec = f.match(/\.(0+)/);
  if (dec) return { n: "number", d: dec[1].length };
  if (/[#0]/.test(f)) return { n: "number" };
  return {};
}

function styleOf(c: RawCell): CellStyle | undefined {
  const s: CellStyle = {};
  if (c.font?.bold) s.b = true;
  if (c.font?.italic) s.i = true;
  if (c.font?.underline) s.u = true;
  const fg = argbToHex(c.font?.color?.argb);
  /* Siyah yazı rengi YAZILMAZ: modelin varsayılanı zaten mürekkep ve her
     hücreye renk basmak hem anlık görüntüyü şişirir hem temayı ezer. */
  if (fg && fg !== "#000000") s.fg = fg;
  const bg = c.fill?.type === "pattern" ? argbToHex(c.fill?.fgColor?.argb) : undefined;
  if (bg && bg !== "#ffffff") s.bg = bg;
  const h = c.alignment?.horizontal;
  if (h === "left" || h === "center" || h === "right") s.a = h[0] as "l" | "c" | "r";
  if (c.alignment?.wrapText) s.w = true;
  const fmt = numberFormatOf(c.numFmt);
  if (fmt.n) s.n = fmt.n;
  if (fmt.d !== undefined) s.d = fmt.d;
  if (c.border) {
    const bd = (["top", "left", "bottom", "right"] as const)
      .filter((k) => (c.border as Record<string, unknown>)[k])
      .map((k) => k[0])
      .join("");
    if (bd) s.bd = bd;
  }
  return Object.keys(s).length > 0 ? s : undefined;
}

/** Hücrenin GÖRÜNEN değeri — formülde sonuç, tarihte yerel biçim. */
function valueOf(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) {
    return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(v);
  }
  const o = v as Record<string, unknown>;
  if ("result" in o) return valueOf(o.result);
  if ("text" in o) return valueOf(o.text);
  if ("richText" in o && Array.isArray(o.richText)) {
    return (o.richText as { text?: string }[]).map((r) => r.text ?? "").join("");
  }
  if ("error" in o) return String(o.error);
  return "";
}

/** Dosyada gömülü bir görselin YERLEŞİMİ — baytı burada değil, kimliği var. */
export interface ImagePlacement {
  /** ExcelJS media dizinindeki sıra; aynı görsel birden çok yerde olabilir. */
  imageId: number;
  /** Kaçıncı sayfa (snapshot.sheets dizini). */
  sheet: number;
  /** Sıfır tabanlı hücre. */
  r: number;
  c: number;
  /** Kaç sütuna / satıra yayılıyor. */
  cs: number;
  rs: number;
}

export interface ImportReport {
  snapshot: WorkbookSnapshot;
  /** Kullanıcıya SÖYLENECEK kayıplar — sessiz kırpma yok. */
  notes: string[];
  /** Görseller bu modülde YÜKLENMEZ: burası saf dönüşüm, ağ işi çağıranın.
   *  Çağıran her biri için Drive kaydı açıp `img` alanını doldurur. */
  images: ImagePlacement[];
}

/**
 * ExcelJS çalışma kitabını modelin anlık görüntüsüne çevirir.
 *
 * `wb` tipi `unknown`: bu modül ExcelJS'i içe aktarmaz ki istemci paketine
 * kütüphane sızmasın. Çağıran (sunucu aksiyonu) yüklenmiş kitabı verir.
 */
export function workbookToSnapshot(wb: unknown): ImportReport {
  const book = wb as { worksheets: unknown[] };
  const notes: string[] = [];
  const sheets: Sheet[] = [];
  const images: ImagePlacement[] = [];

  for (const wsRaw of book.worksheets) {
    const ws = wsRaw as {
      name: string; rowCount: number; columnCount: number;
      getRow: (_r: number) => { getCell: (_c: number) => RawCell; height?: number };
      getColumn: (_c: number) => { width?: number };
      model?: { merges?: string[] };
      views?: { ySplit?: number }[];
      getImages?: () => {
        imageId: string | number;
        range: { tl?: { col: number; row: number }; br?: { col: number; row: number } };
      }[];
    };

    const rowsWanted = Math.max(ws.rowCount, 1);
    const colsWanted = Math.max(ws.columnCount, 1);
    const rows = Math.min(rowsWanted, MAX_ROWS);
    const cols = Math.min(colsWanted, MAX_COLS);
    if (rowsWanted > rows || colsWanted > cols) {
      notes.push(
        `"${ws.name}" sayfası ${rowsWanted}×${colsWanted} boyutundaydı; ` +
        `${rows}×${cols} olarak alındı (sistem sınırı).`,
      );
    }

    /* BİRLEŞTİRMELER ÖNCE ÇÖZÜLÜR. ExcelJS bir birleşmenin HER hücresine ana
       hücrenin değerini veriyor; olduğu gibi yazsaydık "A5:C5"teki TOPLAM üç
       hücreye kopyalanırdı ve kullanıcı birleştirmeyi kaldırdığında yan yana
       üç "TOPLAM" görürdü. Modelde değeri yalnız SOL ÜST köşe taşır. */
    const merges: string[] = [];
    const covered = new Set<string>();
    for (const m of ws.model?.merges ?? []) {
      const p = parseRange(m);
      if (!p || p.r1 >= rows || p.c1 >= cols) continue;
      const r2 = Math.min(p.r2, rows - 1);
      const c2 = Math.min(p.c2, cols - 1);
      merges.push(`${p.r1}:${p.c1}:${r2}:${c2}`);
      for (let r = p.r1; r <= r2; r++) {
        for (let c = p.c1; c <= c2; c++) {
          if (r !== p.r1 || c !== p.c1) covered.add(key(r, c));
        }
      }
    }

    const cells: Record<string, Cell> = {};
    for (let r = 1; r <= rows; r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= cols; c++) {
        /* Birleşmenin gövdesi: değer sol üstte yazılı, burası BOŞ kalır. */
        if (covered.has(key(r - 1, c - 1))) continue;
        const raw = row.getCell(c);
        const v = valueOf(raw.value);
        /* FORMÜL KORUNUR. Model formülü kendi motoruyla yeniden hesaplıyor;
           desteklenmeyen bir fonksiyon varsa hücre hata gösterir ama ham
           metin kaybolmaz — `v` son bilinen sonucu taşır. */
        const f = raw.formula ? `=${raw.formula}` : undefined;
        const s = styleOf(raw);
        if (!v && !f && !s) continue;   // seyrek model: boş hücre yazılmaz
        const cell: Cell = {};
        if (v) cell.v = v;
        if (f) cell.f = f;
        if (s) cell.s = s;
        cells[key(r - 1, c - 1)] = cell;
      }
    }

    /* SATIR YÜKSEKLİKLERİ. İlk sürümde okunmuyordu ve sonuç ekranda görüldü
       (Sıraç, 2026-09-16: "böyle bozuk geliyor"): Excel'de yüksekliğe ayarlanmış
       çok satırlı ürün açıklamaları, sistemde 30 pikselik sabit satıra sıkışıp
       kırpılıyordu. Excel PUNTO kullanır, ızgara piksel — 1pt = 4/3px. */
    const rowH: Record<number, number> = {};
    for (let r = 1; r <= rows; r++) {
      const h = ws.getRow(r)?.height;
      if (typeof h === "number" && h > 0) {
        rowH[r - 1] = Math.round(Math.min(Math.max(h * (4 / 3), 20), 400));
      }
    }

    const colW: Record<number, number> = {};
    for (let c = 1; c <= cols; c++) {
      const w = ws.getColumn(c)?.width;
      /* Excel genişliği KARAKTER birimindedir, piksel değil. ~7px/karakter
         yaygın yaklaşımdır; kolon genişlikleri birebir olmasa da dosyadaki
         oranlar korunur — dar kolon dar, geniş kolon geniş kalır. */
      if (typeof w === "number" && w > 0) colW[c - 1] = Math.round(Math.min(Math.max(w * 7, 40), 600));
    }

    /* GÖMÜLÜ GÖRSELLER. Excel'de görsel hücrenin İÇİNDE değil ÜSTÜNDE yüzer ve
       bir aralığı kaplar; modelin CellImage'i de aynı şeyi yapıyor (cs/rs).
       Bayt BURADA taşınmaz — bu modül saf dönüşüm, yükleme çağıranın işi. */
    const sheetIndex = sheets.length;
    for (const im of ws.getImages?.() ?? []) {
      const tl = im.range?.tl;
      if (!tl) continue;
      const r = Math.round(tl.row);
      const c = Math.round(tl.col);
      if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
      const br = im.range?.br;
      images.push({
        imageId: Number(im.imageId),
        sheet: sheetIndex,
        r, c,
        cs: br ? Math.max(1, Math.round(br.col) - c) : 1,
        rs: br ? Math.max(1, Math.round(br.row) - r) : 1,
      });
    }

    sheets.push({
      id: newSheetId(),
      name: ws.name || `Sayfa${sheets.length + 1}`,
      rows: Math.max(rows, 20),
      cols: Math.max(cols, 8),
      cells,
      colW: Object.keys(colW).length ? colW : undefined,
      rowH: Object.keys(rowH).length ? rowH : undefined,
      merges: merges.length ? merges : undefined,
      frozen: ws.views?.[0]?.ySplit || undefined,
    });
  }

  if (sheets.length === 0) {
    sheets.push({
      id: newSheetId(), name: "Sayfa1", rows: 100, cols: 20, cells: {},
      colW: { 0: DEFAULT_COL_W },
    });
    notes.push("Dosyada okunabilir bir sayfa bulunamadı; boş bir tablo açıldı.");
  }

  /* NE TAŞINMADIĞINI SÖYLE. Sessiz kayıp, kaybın kendisinden kötüdür.
     GÖRSELLER ARTIK TAŞINIYOR, bu yüzden listeden çıktılar. */
  notes.push(
    "Grafik, pivot tablo ve koşullu biçimlendirme aktarılmaz — yüklenen orijinal " +
    "dosya Drive'da duruyor.",
  );

  return { snapshot: { engine: "wb", sheets, active: 0 }, notes, images };
}

/** "A1:C3" → sıfır tabanlı sınırlar. Tanınmayan biçim null döner. */
function parseRange(range: string): { r1: number; c1: number; r2: number; c2: number } | null {
  const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i.exec(range.trim());
  if (!m) return null;
  const col = (s: string) => {
    let n = 0;
    for (const ch of s.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  };
  return { r1: Number(m[2]) - 1, c1: col(m[1]), r2: Number(m[4]) - 1, c2: col(m[3]) };
}
