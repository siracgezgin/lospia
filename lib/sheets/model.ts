/**
 * Tablo (Sheets) veri modeli.
 *
 * Aslı Hanım (2026-08-24): "Sheets kısmını tamamen Excel gibi yapalım, Google
 * Sheet'te olduğu gibi. Profesyonelce olmalı."
 *
 * Eski model bir "başlıklar + satırlar" tablosuydu (LightSnapshot): hücrede
 * yalnız metin vardı, formül/biçim kavramı yoktu. Gerçek bir hesap tablosunda
 * başlık diye ayrı bir şey YOKTUR — 1. satır da bir satırdır. Bu yüzden model
 * seyrek (sparse) bir hücre haritasına döndü: yalnız DOLU hücre saklanır, boş
 * ızgara yer kaplamaz.
 *
 * Hücre iki şey taşır:
 *   v — kullanıcının yazdığı ham değer ("12", "Denim Yelek")
 *   f — formül ("=A1*B1"). Doluysa görüntülenen değer f'ten HESAPLANIR;
 *       v yalnız son hesap sonucunun önbelleğidir ve yeniden hesaplanır.
 *
 * Geriye uyum: eski LightSnapshot ve (hiç yazılmamış) univer snapshot'ı
 * okunmaya devam eder — fromLegacy() ikisini de bu modele çevirir. Böylece
 * kayıtlı hiçbir tablo okunamaz hâle gelmez.
 */

import { shiftFormula, shiftRefs } from "./formula";

export type NumberFormat = "auto" | "text" | "number" | "money" | "percent" | "date";

export type CellStyle = {
  /** kalın */ b?: boolean;
  /** italik */ i?: boolean;
  /** altı çizili */ u?: boolean;
  /** hizalama: sol | orta | sağ (yoksa: sayı sağa, metin sola) */ a?: "l" | "c" | "r";
  /** sayı biçimi */ n?: NumberFormat;
  /** ondalık basamak */ d?: number;
  /** dolgu rengi (hex, ör "#fde68a") */ bg?: string;
  /** yazı rengi (hex) */ fg?: string;
  /** kenarlık: t/l/b/r harflerinden oluşan dizi, ör "tb" = üst+alt */ bd?: string;
  /** metni kaydır (satır yüksekliği artar) */ w?: boolean;
};

/** Hücreye konan GÖRSEL — bayt değil REFERANS.
 *
 *  Sıraç (2026-09-06): "Aynı resmi birkaç defa yüklemek sistemi gereksiz
 *  ağırlaştırır. Excel'de resim ekle kısmı olsun, + basıp sistemdeki klasörden
 *  seçelim."
 *
 *  Bu yüzden hücre yalnız Drive kaydının kimliğini tutar. Görselin kendisi
 *  bir kez yüklenir (operation_documents + `documents` kovası) ve kaç yerde
 *  kullanılırsa kullanılsın tek kopya kalır: föyde, tabloda, lookbook'ta hep
 *  aynı dosya. Fotoğraf değişince her yerde değişir.
 *
 *  Adres BURADA TUTULMAZ: `documents` kovası özeldir, adres imzalıdır ve
 *  saatlik geçerlidir. Kaydedilen anlık görüntüye imzalı adres yazmak, bir
 *  gün sonra açıldığında kırık resim demek olurdu. */
export type CellImage = {
  /** operation_documents.id — Drive'daki dosyanın kimliği. */
  id: string;
  /** Kullanıcının gördüğü ad; ipucu ve erişilebilirlik metni için. */
  name?: string;
  /** Kaç SÜTUNA yayılır (varsayılan 1). Excel'de görsel hücrenin içinde
   *  değil ÜSTÜNDE yüzer ve birden çok hücreyi kaplar; tek hücreye
   *  sıkıştırınca "üç kareye bölünmüş" gibi duruyordu (Sıraç, 2026-09-06).
   *  Hücreleri BİRLEŞTİRMİYORUZ — altlarındaki metin kaybolmasın. */
  cs?: number;
  /** Kaç SATIRA yayılır (varsayılan 1). */
  rs?: number;
};

export type Cell = {
  /** Ham değer (formül yoksa gösterilen şey). */
  v?: string;
  /** Formül, "=" ile başlar. */
  f?: string;
  /** Biçim. */
  s?: CellStyle;
  /** Drive'dan seçilmiş görsel (varsa metnin yerine o çizilir). */
  img?: CellImage;
};

/** Tek bir sayfa (Excel'deki "Sheet1"). */
export type Sheet = {
  id: string;
  name: string;
  rows: number;
  cols: number;
  /** "satır:sütun" → hücre. Yalnız dolu hücreler. */
  cells: Record<string, Cell>;
  /** sütun indeksi → piksel genişlik */
  colW?: Record<number, number>;
  /** satır indeksi → piksel yükseklik */
  rowH?: Record<number, number>;
  /** birleştirilmiş alanlar: "r1:c1:r2:c2" */
  merges?: string[];
  /** üstte dondurulan satır sayısı */
  frozen?: number;
};

/**
 * Çalışma kitabı — BİRDEN FAZLA SAYFA.
 * Aslı Hanım (2026-08-24): "sayfa sekmeleri yok" — Excel/Sheets'in en tanıdık
 * parçası. Model bu yüzden tek ızgaradan sayfa listesine geçti.
 */
export type WorkbookSnapshot = {
  engine: "wb";
  sheets: Sheet[];
  /** etkin sayfanın indeksi */
  active: number;
};

/** Geriye uyum için eski tek-ızgara biçimi. */
export type GridSnapshot = {
  engine: "grid";
  rows: number;
  cols: number;
  cells: Record<string, Cell>;
  colW?: Record<number, number>;
  frozen?: number;
};

export const DEFAULT_COL_W = 128;
export const ROW_H = 30;
export const HEAD_H = 30;
export const GUTTER_W = 52;

export const MAX_ROWS = 5000;
export const MAX_COLS = 100;

export const key = (r: number, c: number) => `${r}:${c}`;

/** 0 → A, 25 → Z, 26 → AA … (Excel sütun adı) */
export function colName(index: number): string {
  let name = "";
  let i = index;
  do {
    name = String.fromCharCode(65 + (i % 26)) + name;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return name;
}

/** "AA" → 26. Geçersizse -1. */
export function colIndex(name: string): number {
  let n = 0;
  const up = name.toUpperCase();
  for (const ch of up) {
    const code = ch.charCodeAt(0);
    if (code < 65 || code > 90) return -1;
    n = n * 26 + (code - 64);
  }
  return n - 1;
}

/** "B3" → {r:2, c:1}. Geçersizse null. ($ işaretleri yok sayılır.) */
export function parseA1(ref: string): { r: number; c: number } | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(ref.trim());
  if (!m) return null;
  const c = colIndex(m[1]);
  const r = Number(m[2]) - 1;
  if (c < 0 || r < 0) return null;
  return { r, c };
}

export const toA1 = (r: number, c: number) => `${colName(c)}${r + 1}`;

/**
 * Sayfa kimliği. ESKİDEN sayfa yüklemesi başına DETERMİNİSTİKTİ: sayaç her
 * yüklemede sıfırlandığı için kayıtlı bir kitaba "+" ile eklenen ilk sayfa,
 * Sayfa1'in kimliğinin AYNISINI alıyordu. Sonuç: sekme listesinde çift React
 * anahtarı ve formül motorunun sayfa-kimliğiyle anahtarlanan önbelleği
 * (bounds/cache) yüzünden çapraz-sayfa formüllerinde değerlerin karışması.
 */
export function newSheetId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `s${crypto.randomUUID().slice(0, 8)}`;
  }
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function emptySheet(name = "Sayfa1", rows = 100, cols = 20): Sheet {
  return { id: newSheetId(), name, rows, cols, cells: {} };
}

export function emptyWorkbook(): WorkbookSnapshot {
  return { engine: "wb", sheets: [emptySheet()], active: 0 };
}

export function getCell(g: Sheet, r: number, c: number): Cell | undefined {
  return g.cells[key(r, c)];
}

/** Etkin sayfayı güvenli döndürür (indeks bozuksa ilk sayfa). */
export function activeSheet(wb: WorkbookSnapshot): Sheet {
  return wb.sheets[wb.active] ?? wb.sheets[0];
}

/** Etkin sayfayı değiştirip yeni kitap döndürür. */
export function withSheet(wb: WorkbookSnapshot, index: number, next: Sheet): WorkbookSnapshot {
  return { ...wb, sheets: wb.sheets.map((s, i) => (i === index ? next : s)) };
}

/** Sayfa adından sayfayı bulur (formüldeki "Sayfa2!A1" için). */
export function sheetByName(wb: WorkbookSnapshot, name: string): Sheet | undefined {
  const n = name.trim().toLowerCase();
  return wb.sheets.find((s) => s.name.trim().toLowerCase() === n);
}

/** Aynı addan ikinci bir sayfa olmasın — "Sayfa2", "Sayfa2 (2)" … */
export function uniqueSheetName(wb: WorkbookSnapshot, wanted: string, skipIndex = -1): string {
  const taken = new Set(
    wb.sheets.filter((_, i) => i !== skipIndex).map((s) => s.name.trim().toLowerCase()),
  );
  const base = wanted.trim() || "Sayfa";
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; i < 500; i++) {
    const cand = `${base} (${i})`;
    if (!taken.has(cand.toLowerCase())) return cand;
  }
  return `${base} ${Date.parse("2026-01-01")}`;
}

/** Hücreyi yazar; hücre tamamen boşaldıysa haritadan SİLER (seyrek kalsın). */
export function setCell(g: Sheet, r: number, c: number, cell: Cell | undefined): Sheet {
  const cells = { ...g.cells };
  const k = key(r, c);
  if (isEmptyCell(cell)) delete cells[k];
  else cells[k] = cell as Cell;
  return { ...g, cells };
}

/**
 * TOPLU yazma. setCell her çağrıda hücre haritasının TAMAMINI kopyalıyor;
 * 5.000 hücrelik bir yapıştırma ya da "tümünü seç + sil" bu yüzden O(n²)
 * oluyor ve tarayıcı donuyordu. Burada harita bir kez kopyalanır, düzenleme
 * `put` ile yapılır.
 */
export function withCells(g: Sheet, edit: (_put: CellWriter) => void): Sheet {
  const cells = { ...g.cells };
  edit((r, c, cell) => {
    const k = key(r, c);
    if (isEmptyCell(cell)) delete cells[k];
    else cells[k] = cell as Cell;
  });
  return { ...g, cells };
}

export type CellWriter = (_r: number, _c: number, _cell: Cell | undefined) => void;

/** Hücre tamamen boş mu? (seyrek haritada yer kaplamamalı) */
export function isEmptyCell(cell: Cell | undefined): boolean {
  return (
    !cell ||
    ((cell.v === undefined || cell.v === "") &&
      (cell.f === undefined || cell.f === "") &&
      // Görsel tek başına da hücreyi DOLU yapar: metni olmayan bir resim
      // hücresi aksi hâlde seyrek haritadan silinip kaybolurdu.
      !cell.img &&
      (!cell.s || Object.keys(cell.s).length === 0))
  );
}

export function colWidth(g: Sheet, c: number): number {
  return g.colW?.[c] ?? DEFAULT_COL_W;
}

export function rowHeight(g: Sheet, r: number): number {
  return g.rowH?.[r] ?? ROW_H;
}

// ── Birleştirilmiş hücreler ─────────────────────────────────────────────────

export type MergeRect = { r1: number; c1: number; r2: number; c2: number };

export const mergeKey = (m: MergeRect) => `${m.r1}:${m.c1}:${m.r2}:${m.c2}`;

export function parseMerge(s: string): MergeRect | null {
  const p = s.split(":").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isFinite(n))) return null;
  return { r1: p[0], c1: p[1], r2: p[2], c2: p[3] };
}

export function mergesOf(g: Sheet): MergeRect[] {
  return (g.merges ?? []).map(parseMerge).filter((m): m is MergeRect => m !== null);
}

/** Hücre bir birleşmenin içinde mi? Sol-üst köşe ise `anchor` true. */
export function mergeAt(g: Sheet, r: number, c: number): { rect: MergeRect; anchor: boolean } | null {
  for (const m of mergesOf(g)) {
    if (r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2) {
      return { rect: m, anchor: r === m.r1 && c === m.c1 };
    }
  }
  return null;
}

// ── Geriye uyum ─────────────────────────────────────────────────────────────

type LegacyLight = { engine: "light"; columns: string[]; rows: string[][] };

/**
 * Eski snapshot'ları bu modele çevirir.
 *
 * LightSnapshot'ta başlıklar ayrı bir dizideydi; burada BİRİNCİ SATIR olurlar
 * (hesap tablosunda ayrı "başlık" kavramı yok) ve kalın yazılırlar — ekranda
 * eskisiyle aynı görünsün diye. Böylece kayıtlı tablo hiçbir şey kaybetmez.
 */
export function fromLegacy(raw: unknown): WorkbookSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;

  // Yeni biçim — çok sayfalı kitap.
  if (s.engine === "wb" && Array.isArray(s.sheets)) {
    const sheets: Sheet[] = [];
    (s.sheets as unknown[]).forEach((raw2, i) => {
      const sh = raw2 as Record<string, unknown>;
      if (!sh || typeof sh !== "object") return;
      sheets.push({
        id: typeof sh.id === "string" ? sh.id : newSheetId(),
        name: typeof sh.name === "string" && sh.name.trim() ? sh.name : `Sayfa${i + 1}`,
        rows: clampInt(sh.rows, 1, MAX_ROWS, 100),
        cols: clampInt(sh.cols, 1, MAX_COLS, 20),
        cells: (sh.cells && typeof sh.cells === "object" ? sh.cells : {}) as Record<string, Cell>,
        colW: (sh.colW ?? undefined) as Record<number, number> | undefined,
        rowH: (sh.rowH ?? undefined) as Record<number, number> | undefined,
        merges: Array.isArray(sh.merges) ? (sh.merges as string[]) : undefined,
        frozen: typeof sh.frozen === "number" ? sh.frozen : undefined,
      });
    });
    if (sheets.length === 0) return emptyWorkbook();
    const active = clampInt(s.active, 0, sheets.length - 1, 0);
    return { engine: "wb", sheets, active };
  }

  // Tek ızgara (bu modülün ilk sürümü).
  if (s.engine === "grid") {
    const sheet: Sheet = {
      id: newSheetId(),
      name: "Sayfa1",
      rows: clampInt(s.rows, 1, MAX_ROWS, 100),
      cols: clampInt(s.cols, 1, MAX_COLS, 20),
      cells: (s.cells && typeof s.cells === "object" ? s.cells : {}) as Record<string, Cell>,
      colW: (s.colW ?? undefined) as Record<number, number> | undefined,
      frozen: typeof s.frozen === "number" ? s.frozen : undefined,
    };
    return { engine: "wb", sheets: [sheet], active: 0 };
  }

  // En eski biçim: ayrı "başlıklar" dizisi + satırlar.
  if (s.engine === "light" && Array.isArray(s.rows) && Array.isArray(s.columns)) {
    const legacy = s as unknown as LegacyLight;
    const cols = Math.max(1, Math.min(MAX_COLS, legacy.columns.length || 1));
    const sheet: Sheet = {
      id: newSheetId(),
      name: "Sayfa1",
      rows: Math.max(100, Math.min(MAX_ROWS, legacy.rows.length + 20)),
      cols: Math.max(cols, 20),
      cells: {},
    };
    legacy.columns.forEach((h, c) => {
      const t = String(h ?? "");
      if (t) sheet.cells[key(0, c)] = { v: t, s: { b: true } };
    });
    legacy.rows.forEach((row, ri) => {
      (row ?? []).forEach((val, c) => {
        const t = String(val ?? "");
        if (t) sheet.cells[key(ri + 1, c)] = { v: t };
      });
    });
    return { engine: "wb", sheets: [sheet], active: 0 };
  }

  // Hiç yazılmamış univer editörünün bıraktığı biçim — değerleri kurtar.
  if (s.engine === "univer" && s.workbook && typeof s.workbook === "object") {
    const wb = s.workbook as Record<string, unknown>;
    const sheets = (wb.sheets ?? {}) as Record<string, Record<string, unknown>>;
    const order = (wb.sheetOrder ?? Object.keys(sheets)) as string[];
    const first = order.length ? sheets[order[0]] : undefined;
    const cellData = (first?.cellData ?? {}) as Record<string, Record<string, { v?: unknown }>>;
    const sheet = emptySheet();
    let maxR = 0;
    let maxC = 0;
    for (const rk of Object.keys(cellData)) {
      const r = Number(rk);
      if (!Number.isFinite(r)) continue;
      for (const ck of Object.keys(cellData[rk] ?? {})) {
        const c = Number(ck);
        if (!Number.isFinite(c)) continue;
        const v = cellData[rk][ck]?.v;
        if (v === undefined || v === null || v === "") continue;
        sheet.cells[key(r, c)] = { v: String(v) };
        maxR = Math.max(maxR, r);
        maxC = Math.max(maxC, c);
      }
    }
    sheet.rows = Math.max(100, Math.min(MAX_ROWS, maxR + 20));
    sheet.cols = Math.max(20, Math.min(MAX_COLS, maxC + 5));
    return { engine: "wb", sheets: [sheet], active: 0 };
  }

  return null;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

// ── Satır / sütun işlemleri ─────────────────────────────────────────────────
// Hücreler seyrek haritada durduğu için ekleme/silme, etkilenen hücreleri
// KAYDIRMAK demektir. Formül referansları da kaydırılır (bkz. shiftRefs):
// A1 satırı silinince ona bakan formül #BAŞV! olur, altındaki referanslar bir
// yukarı kayar — Excel'in davranışı. Bu YAPILMADIĞINDA tablo sessizce yanlış
// sayı gösteriyordu: üste satır eklendikten sonra =TOPLA(B2:B10) hâlâ eski
// aralığa bakıyor, ekranda hiçbir hata görünmüyordu.

/** Hücre taşınırken formülündeki başvuruları da kaydırır. */
function withShiftedRefs(cell: Cell, axis: "row" | "col", at: number, delta: number): Cell {
  return cell.f ? { ...cell, f: shiftRefs(cell.f, axis, at, delta) } : cell;
}

/* TEK GEÇİŞTE N SATIR/SÜTUN. Çoklu silme tek tek `deleteRow` çağırarak
   yapılsaydı her adım bütün hücre haritasını yeniden kurardı (100 satır ×
   20.000 hücre). Tekli sürümler aynı işlevin count = 1 hâlidir. */
function shiftAxis(g: Sheet, axis: "row" | "col", at: number, delta: number): Sheet {
  const cells: Record<string, Cell> = {};
  const gone = (i: number) => delta < 0 && i >= at && i < at - delta;
  const moved = (i: number) => (i >= at ? i + delta : i);
  for (const [k, cell] of Object.entries(g.cells)) {
    const [r, c] = k.split(":").map(Number);
    const i = axis === "row" ? r : c;
    if (gone(i)) continue;
    cells[axis === "row" ? key(moved(r), c) : key(r, moved(c))] = withShiftedRefs(cell, axis, at, delta);
  }
  const sizes: Record<number, number> = {};
  for (const [i, v] of Object.entries((axis === "row" ? g.rowH : g.colW) ?? {})) {
    const n = Number(i);
    if (gone(n)) continue;
    sizes[moved(n)] = v;
  }
  const merges = shiftMerges(g, axis, at, delta);
  return axis === "row"
    ? { ...g, rows: Math.max(1, Math.min(MAX_ROWS, g.rows + delta)), cells, rowH: sizes, merges }
    : { ...g, cols: Math.max(1, Math.min(MAX_COLS, g.cols + delta)), cells, colW: sizes, merges };
}

export function insertRows(g: Sheet, at: number, count: number): Sheet {
  const n = Math.max(0, Math.min(count, MAX_ROWS - g.rows));
  return n ? shiftAxis(g, "row", at, n) : g;
}
/** En az bir satır kalır. */
export function deleteRows(g: Sheet, at: number, count: number): Sheet {
  const n = Math.max(0, Math.min(count, g.rows - at, g.rows - 1));
  return n ? shiftAxis(g, "row", at, -n) : g;
}
export function insertCols(g: Sheet, at: number, count: number): Sheet {
  const n = Math.max(0, Math.min(count, MAX_COLS - g.cols));
  return n ? shiftAxis(g, "col", at, n) : g;
}
/** En az bir sütun kalır. */
export function deleteCols(g: Sheet, at: number, count: number): Sheet {
  const n = Math.max(0, Math.min(count, g.cols - at, g.cols - 1));
  return n ? shiftAxis(g, "col", at, -n) : g;
}

export const insertRow = (g: Sheet, at: number): Sheet => insertRows(g, at, 1);
export const deleteRow = (g: Sheet, at: number): Sheet => deleteRows(g, at, 1);
export const insertCol = (g: Sheet, at: number): Sheet => insertCols(g, at, 1);
export const deleteCol = (g: Sheet, at: number): Sheet => deleteCols(g, at, 1);

/** Satır/sütun eklenip silinince birleşmeleri kaydırır; kapsanan birleşme düşer. */
function shiftMerges(g: Sheet, axis: "row" | "col", at: number, delta: number): string[] {
  const out: string[] = [];
  const end = at - delta;          // silmede: silinen aralığın bir sonrası
  for (const m of mergesOf(g)) {
    const a1 = axis === "row" ? m.r1 : m.c1;
    const a2 = axis === "row" ? m.r2 : m.c2;
    let n1: number, n2: number;
    if (delta > 0) {
      n1 = a1 >= at ? a1 + delta : a1;
      n2 = a2 >= at ? a2 + delta : a2;
    } else {
      /* Silinen aralık birleşmenin BAŞINI yiyorsa birleşme `at`ten başlar
         (eskiden bir satır YUKARI taşıp üstteki hücreyi de yutuyordu). */
      n1 = a1 >= end ? a1 + delta : Math.min(a1, at);
      n2 = a2 >= end ? a2 + delta : Math.min(a2, at - 1);
    }
    if (n2 < n1) continue;         // birleşmenin tamamı silindi
    const rect = axis === "row"
      ? { r1: n1, c1: m.c1, r2: n2, c2: m.c2 }
      : { r1: m.r1, c1: n1, r2: m.r2, c2: n2 };
    if (rect.r1 === rect.r2 && rect.c1 === rect.c2) continue;   // tek hücre birleşme değildir
    out.push(mergeKey(rect));
  }
  return out;
}

/* ── Sıralama ─────────────────────────────────────────────────────────────
   [r1..r2] satırları `order`a göre yeniden dizilir: order[i] = hedef r1+i
   satırına gelecek KAYNAK satır. Satır BÜTÜN olarak taşınır — hücreler,
   biçim, görsel ve satır yüksekliği birlikte. Taşınan formülün göreli
   başvuruları satır farkı kadar kayar (Excel'in davranışı: =B5*C5 üçüncü
   satıra çıkınca =B3*C3 olur). Birleşme kontrolü çağırana aittir. */
export function reorderRows(g: Sheet, r1: number, r2: number, order: number[]): Sheet {
  const target = new Map<number, number>();    // kaynak satır → hedef satır
  order.forEach((src, i) => target.set(src, r1 + i));
  const cells: Record<string, Cell> = {};
  for (const [k, cell] of Object.entries(g.cells)) {
    const [r, c] = k.split(":").map(Number);
    if (r < r1 || r > r2) { cells[k] = cell; continue; }
    const to = target.get(r);
    if (to === undefined) continue;
    cells[key(to, c)] = cell.f && to !== r ? { ...cell, f: shiftFormula(cell.f, to - r, 0) } : cell;
  }
  const rowH: Record<number, number> = {};
  for (const [r, h] of Object.entries(g.rowH ?? {})) {
    const ri = Number(r);
    if (ri < r1 || ri > r2) rowH[ri] = h;
    else { const to = target.get(ri); if (to !== undefined) rowH[to] = h; }
  }
  return { ...g, cells, rowH };
}

/** İçinde değer, formül ya da görsel olan satırlar. */
export function usedRows(g: Sheet): Set<number> {
  const out = new Set<number>();
  for (const [k, cell] of Object.entries(g.cells)) {
    if ((cell.v ?? "") === "" && (cell.f ?? "") === "" && !cell.img) continue;
    out.add(Number(k.slice(0, k.indexOf(":"))));
  }
  return out;
}

/**
 * VERİ BLOĞU — Excel'in "geçerli bölge"si: `from` satırından başlayan, ilk
 * TAMAMEN BOŞ satıra kadar süren bitişik satırlar. Altta bir boş satırla
 * ayrılmış "Toplam" satırı bloğa girmez; sıralama onu veriyle karıştırmaz.
 */
export function dataBlock(g: Sheet, from: number): { r1: number; r2: number } | null {
  const used = usedRows(g);
  let r1 = from;
  while (r1 < g.rows && !used.has(r1)) r1++;
  if (r1 >= g.rows) return null;
  let r2 = r1;
  while (r2 + 1 < g.rows && used.has(r2 + 1)) r2++;
  return { r1, r2 };
}

/**
 * CSV/tablo dizisinden ızgara üretir (ilk satır kalın yazılır — başlık gibi
 * görünsün; hesap tablosunda ayrı "başlık" kavramı yok).
 */
export function workbookFromRows(rows: string[][]): WorkbookSnapshot {
  const cols = Math.max(1, Math.min(MAX_COLS, Math.max(...rows.map((r) => r.length), 1)));
  const g: Sheet = {
    id: newSheetId(),
    name: "Sayfa1",
    rows: Math.max(100, Math.min(MAX_ROWS, rows.length + 20)),
    cols: Math.max(cols, 20),
    cells: {},
  };
  rows.forEach((row, r) => {
    row.forEach((val, c) => {
      const t = String(val ?? "");
      if (!t) return;
      g.cells[key(r, c)] = r === 0 ? { v: t, s: { b: true } } : { v: t };
    });
  });
  return { engine: "wb", sheets: [g], active: 0 };
}
