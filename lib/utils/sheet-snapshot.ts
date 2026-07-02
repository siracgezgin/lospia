/**
 * Tablo Merkezi snapshot format.
 *
 * operation_spreadsheets.snapshot is engine-tagged JSON:
 *   { engine: "light",  columns: string[], rows: string[][] }   → LightSheetEditor
 *   { engine: "univer", workbook: IWorkbookData }               → UniverSheetEditor
 *
 * The two shapes stay convertible: a light grid becomes a values-only Univer
 * workbook (gridToWorkbookCellData) and a Univer workbook degrades to a
 * values-only grid (workbookToGrid) so no snapshot is ever unreadable, even if
 * one editor is unavailable.
 */

export type LightSnapshot = {
  engine: "light";
  columns: string[];
  rows: string[][];
};

export type UniverSnapshot = {
  engine: "univer";
  workbook: Record<string, unknown>;
};

export type SheetSnapshot = LightSnapshot | UniverSnapshot;

export function makeLightSnapshot(columns: string[], rows: string[][]): LightSnapshot {
  return { engine: "light", columns, rows };
}

export function emptyLightSnapshot(cols = 6, rows = 12): LightSnapshot {
  return {
    engine: "light",
    columns: Array.from({ length: cols }, (_, i) => defaultColumnName(i)),
    rows: Array.from({ length: rows }, () => Array(cols).fill("")),
  };
}

export function defaultColumnName(index: number): string {
  // A, B, …, Z, AA, AB — spreadsheet-style column labels.
  let name = "";
  let i = index;
  do {
    name = String.fromCharCode(65 + (i % 26)) + name;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return name;
}

export function parseSnapshot(raw: unknown): SheetSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (s.engine === "light" && Array.isArray(s.rows) && Array.isArray(s.columns)) {
    return {
      engine: "light",
      columns: (s.columns as unknown[]).map((c) => String(c ?? "")),
      rows: (s.rows as unknown[]).map((r) =>
        Array.isArray(r) ? r.map((c) => String(c ?? "")) : [],
      ),
    };
  }
  if (s.engine === "univer" && s.workbook && typeof s.workbook === "object") {
    return { engine: "univer", workbook: s.workbook as Record<string, unknown> };
  }
  return null;
}

type CellData = Record<number, Record<number, { v: string | number }>>;

/**
 * Light grid → Univer cellData (values only, header row included as row 0).
 * Used when the Univer editor opens a sheet that was created as a light grid
 * (e.g. via CSV import).
 */
export function gridToWorkbookCellData(snapshot: LightSnapshot): CellData {
  const cellData: CellData = {};
  const putRow = (r: number, cells: string[]) => {
    const rowData: Record<number, { v: string | number }> = {};
    cells.forEach((value, c) => {
      const t = value.trim();
      if (!t) return;
      const num = Number(t.replace(",", "."));
      rowData[c] = Number.isFinite(num) && /^-?[\d.,]+$/.test(t) ? { v: num } : { v: value };
    });
    if (Object.keys(rowData).length) cellData[r] = rowData;
  };
  putRow(0, snapshot.columns);
  snapshot.rows.forEach((row, i) => putRow(i + 1, row));
  return cellData;
}

/**
 * Univer workbook snapshot → values-only grid (first sheet). Rescue path for
 * rendering a Univer-created sheet in the light editor.
 */
export function workbookToGrid(workbook: Record<string, unknown>): LightSnapshot {
  const sheets = (workbook.sheets ?? {}) as Record<string, Record<string, unknown>>;
  const order = (workbook.sheetOrder ?? Object.keys(sheets)) as string[];
  const first = order.length ? sheets[order[0]] : undefined;
  const cellData = (first?.cellData ?? {}) as Record<
    string,
    Record<string, { v?: unknown } | null | undefined>
  >;

  let maxRow = -1;
  let maxCol = -1;
  for (const r of Object.keys(cellData)) {
    const ri = Number(r);
    if (!Number.isFinite(ri)) continue;
    maxRow = Math.max(maxRow, ri);
    for (const c of Object.keys(cellData[r] ?? {})) {
      const ci = Number(c);
      if (Number.isFinite(ci)) maxCol = Math.max(maxCol, ci);
    }
  }
  if (maxRow < 0 || maxCol < 0) return emptyLightSnapshot();

  const all: string[][] = [];
  for (let r = 0; r <= maxRow; r++) {
    const row: string[] = [];
    for (let c = 0; c <= maxCol; c++) {
      const cell = cellData[r]?.[c];
      row.push(cell?.v == null ? "" : String(cell.v));
    }
    all.push(row);
  }
  // Treat the first row as the header (matches gridToWorkbookCellData).
  const columns = all[0].map((h, i) => (h.trim() ? h : defaultColumnName(i)));
  return { engine: "light", columns, rows: all.slice(1) };
}
