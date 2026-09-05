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

export type Cell = {
  /** Ham değer (formül yoksa gösterilen şey). */
  v?: string;
  /** Formül, "=" ile başlar. */
  f?: string;
  /** Biçim. */
  s?: CellStyle;
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

let sheetSeq = 0;
export function newSheetId(): string {
  sheetSeq += 1;
  return `s${sheetSeq}_${Object.keys({}).length}${sheetSeq * 7919}`;
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
// KAYDIRMAK demektir. Formül referansları da kaydırılır (bkz. shiftFormula):
// A1 satırı silinince ona bakan formül #BAŞV! olur, altındaki referanslar bir
// yukarı kayar — Excel'in davranışı.

export function insertRow(g: Sheet, at: number): Sheet {
  const cells: Record<string, Cell> = {};
  for (const [k, cell] of Object.entries(g.cells)) {
    const [r, c] = k.split(":").map(Number);
    cells[key(r >= at ? r + 1 : r, c)] = cell;
  }
  const rowH: Record<number, number> = {};
  for (const [r, h] of Object.entries(g.rowH ?? {})) {
    const ri = Number(r);
    rowH[ri >= at ? ri + 1 : ri] = h;
  }
  return { ...g, rows: Math.min(MAX_ROWS, g.rows + 1), cells, rowH, merges: shiftMerges(g, "row", at, +1) };
}

export function deleteRow(g: Sheet, at: number): Sheet {
  const cells: Record<string, Cell> = {};
  for (const [k, cell] of Object.entries(g.cells)) {
    const [r, c] = k.split(":").map(Number);
    if (r === at) continue;
    cells[key(r > at ? r - 1 : r, c)] = cell;
  }
  const rowH: Record<number, number> = {};
  for (const [r, h] of Object.entries(g.rowH ?? {})) {
    const ri = Number(r);
    if (ri === at) continue;
    rowH[ri > at ? ri - 1 : ri] = h;
  }
  return { ...g, rows: Math.max(1, g.rows - 1), cells, rowH, merges: shiftMerges(g, "row", at, -1) };
}

export function insertCol(g: Sheet, at: number): Sheet {
  const cells: Record<string, Cell> = {};
  for (const [k, cell] of Object.entries(g.cells)) {
    const [r, c] = k.split(":").map(Number);
    cells[key(r, c >= at ? c + 1 : c)] = cell;
  }
  const colW: Record<number, number> = {};
  for (const [c, w] of Object.entries(g.colW ?? {})) {
    const ci = Number(c);
    colW[ci >= at ? ci + 1 : ci] = w;
  }
  return { ...g, cols: Math.min(MAX_COLS, g.cols + 1), cells, colW, merges: shiftMerges(g, "col", at, +1) };
}

export function deleteCol(g: Sheet, at: number): Sheet {
  const cells: Record<string, Cell> = {};
  for (const [k, cell] of Object.entries(g.cells)) {
    const [r, c] = k.split(":").map(Number);
    if (c === at) continue;
    cells[key(r, c > at ? c - 1 : c)] = cell;
  }
  const colW: Record<number, number> = {};
  for (const [c, w] of Object.entries(g.colW ?? {})) {
    const ci = Number(c);
    if (ci === at) continue;
    colW[ci > at ? ci - 1 : ci] = w;
  }
  return { ...g, cols: Math.max(1, g.cols - 1), cells, colW, merges: shiftMerges(g, "col", at, -1) };
}

/** Satır/sütun eklenip silinince birleşmeleri kaydırır; kapsanan birleşme düşer. */
function shiftMerges(g: Sheet, axis: "row" | "col", at: number, delta: number): string[] {
  const out: string[] = [];
  for (const m of mergesOf(g)) {
    const a1 = axis === "row" ? m.r1 : m.c1;
    const a2 = axis === "row" ? m.r2 : m.c2;
    if (delta < 0 && at >= a1 && at <= a2 && a1 === a2) continue; // tek satırlık birleşme silindi
    const n1 = a1 >= at ? a1 + delta : a1;
    const n2 = a2 >= at ? a2 + delta : a2;
    if (n2 < n1) continue;
    out.push(mergeKey(axis === "row"
      ? { r1: n1, c1: m.c1, r2: n2, c2: m.c2 }
      : { r1: m.r1, c1: n1, r2: m.r2, c2: n2 }));
  }
  return out;
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
