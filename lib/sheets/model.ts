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
  /** hizalama: sol | orta | sağ (yoksa: sayı sağa, metin sola) */ a?: "l" | "c" | "r";
  /** sayı biçimi */ n?: NumberFormat;
  /** ondalık basamak */ d?: number;
};

export type Cell = {
  /** Ham değer (formül yoksa gösterilen şey). */
  v?: string;
  /** Formül, "=" ile başlar. */
  f?: string;
  /** Biçim. */
  s?: CellStyle;
};

export type GridSnapshot = {
  engine: "grid";
  rows: number;
  cols: number;
  /** "satır:sütun" → hücre. Yalnız dolu hücreler. */
  cells: Record<string, Cell>;
  /** sütun indeksi → piksel genişlik */
  colW?: Record<number, number>;
  /** üstte dondurulan satır sayısı */
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

export function emptyGrid(rows = 60, cols = 12): GridSnapshot {
  return { engine: "grid", rows, cols, cells: {} };
}

export function getCell(g: GridSnapshot, r: number, c: number): Cell | undefined {
  return g.cells[key(r, c)];
}

/** Hücreyi yazar; hücre tamamen boşaldıysa haritadan SİLER (seyrek kalsın). */
export function setCell(g: GridSnapshot, r: number, c: number, cell: Cell | undefined): GridSnapshot {
  const cells = { ...g.cells };
  const k = key(r, c);
  const empty =
    !cell ||
    ((cell.v === undefined || cell.v === "") &&
      (cell.f === undefined || cell.f === "") &&
      (!cell.s || Object.keys(cell.s).length === 0));
  if (empty) delete cells[k];
  else cells[k] = cell;
  return { ...g, cells };
}

export function colWidth(g: GridSnapshot, c: number): number {
  return g.colW?.[c] ?? DEFAULT_COL_W;
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
export function fromLegacy(raw: unknown): GridSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;

  if (s.engine === "grid") {
    const cells = (s.cells && typeof s.cells === "object" ? s.cells : {}) as Record<string, Cell>;
    return {
      engine: "grid",
      rows: clampInt(s.rows, 1, MAX_ROWS, 60),
      cols: clampInt(s.cols, 1, MAX_COLS, 12),
      cells,
      colW: (s.colW ?? undefined) as Record<number, number> | undefined,
      frozen: typeof s.frozen === "number" ? s.frozen : undefined,
    };
  }

  if (s.engine === "light" && Array.isArray(s.rows) && Array.isArray(s.columns)) {
    const legacy = s as unknown as LegacyLight;
    const cols = Math.max(1, Math.min(MAX_COLS, legacy.columns.length || 1));
    const g: GridSnapshot = {
      engine: "grid",
      rows: Math.max(30, Math.min(MAX_ROWS, legacy.rows.length + 1)),
      cols: Math.max(cols, 8),
      cells: {},
    };
    legacy.columns.forEach((h, c) => {
      const t = String(h ?? "");
      if (t) g.cells[key(0, c)] = { v: t, s: { b: true } };
    });
    legacy.rows.forEach((row, ri) => {
      (row ?? []).forEach((val, c) => {
        const t = String(val ?? "");
        if (t) g.cells[key(ri + 1, c)] = { v: t };
      });
    });
    return g;
  }

  // Hiç yazılmamış univer editörünün bıraktığı biçim — değerleri kurtar.
  if (s.engine === "univer" && s.workbook && typeof s.workbook === "object") {
    const wb = s.workbook as Record<string, unknown>;
    const sheets = (wb.sheets ?? {}) as Record<string, Record<string, unknown>>;
    const order = (wb.sheetOrder ?? Object.keys(sheets)) as string[];
    const first = order.length ? sheets[order[0]] : undefined;
    const cellData = (first?.cellData ?? {}) as Record<string, Record<string, { v?: unknown }>>;
    const g = emptyGrid();
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
        g.cells[key(r, c)] = { v: String(v) };
        maxR = Math.max(maxR, r);
        maxC = Math.max(maxC, c);
      }
    }
    g.rows = Math.max(30, Math.min(MAX_ROWS, maxR + 10));
    g.cols = Math.max(8, Math.min(MAX_COLS, maxC + 3));
    return g;
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
// KAYDIRMAK demektir. Formüller şimdilik metin olarak taşınır: referans
// kaydırma (A1 → A2) bilinçli olarak yapılmıyor; sessizce yanlış hesaplayan
// bir tablodansa kullanıcının gördüğü sabit referans daha dürüst.

export function insertRow(g: GridSnapshot, at: number): GridSnapshot {
  const cells: Record<string, Cell> = {};
  for (const [k, cell] of Object.entries(g.cells)) {
    const [r, c] = k.split(":").map(Number);
    cells[key(r >= at ? r + 1 : r, c)] = cell;
  }
  return { ...g, rows: Math.min(MAX_ROWS, g.rows + 1), cells };
}

export function deleteRow(g: GridSnapshot, at: number): GridSnapshot {
  const cells: Record<string, Cell> = {};
  for (const [k, cell] of Object.entries(g.cells)) {
    const [r, c] = k.split(":").map(Number);
    if (r === at) continue;
    cells[key(r > at ? r - 1 : r, c)] = cell;
  }
  return { ...g, rows: Math.max(1, g.rows - 1), cells };
}

export function insertCol(g: GridSnapshot, at: number): GridSnapshot {
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
  return { ...g, cols: Math.min(MAX_COLS, g.cols + 1), cells, colW };
}

export function deleteCol(g: GridSnapshot, at: number): GridSnapshot {
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
  return { ...g, cols: Math.max(1, g.cols - 1), cells, colW };
}

/**
 * CSV/tablo dizisinden ızgara üretir (ilk satır kalın yazılır — başlık gibi
 * görünsün; hesap tablosunda ayrı "başlık" kavramı yok).
 */
export function gridFromRows(rows: string[][]): GridSnapshot {
  const cols = Math.max(1, Math.min(MAX_COLS, Math.max(...rows.map((r) => r.length), 1)));
  const g: GridSnapshot = {
    engine: "grid",
    rows: Math.max(30, Math.min(MAX_ROWS, rows.length + 10)),
    cols: Math.max(cols, 8),
    cells: {},
  };
  rows.forEach((row, r) => {
    row.forEach((val, c) => {
      const t = String(val ?? "");
      if (!t) return;
      g.cells[key(r, c)] = r === 0 ? { v: t, s: { b: true } } : { v: t };
    });
  });
  return g;
}
