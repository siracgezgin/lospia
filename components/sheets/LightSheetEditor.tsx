"use client";

/**
 * LightSheetEditor — dependency-free editable grid for the Tablo Merkezi.
 * The guaranteed-to-work editor: plain inputs, add/remove rows & columns,
 * multi-cell paste from Excel/Sheets (tab/newline separated). Used when a
 * sheet's snapshot is a light grid and as the automatic fallback when the
 * Univer editor cannot start. Snapshot format: lib/utils/sheet-snapshot.
 */

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  defaultColumnName, emptyLightSnapshot, makeLightSnapshot,
  type LightSnapshot, type SheetSnapshot,
} from "@/lib/utils/sheet-snapshot";
import { cn } from "@/lib/utils/cn";

export interface SheetEditorApi {
  getSnapshot: () => SheetSnapshot;
}

interface Props {
  initialSnapshot: LightSnapshot | null;
  readOnly?: boolean;
  onReady: (api: SheetEditorApi) => void;
  /** Fired on any cell/structure change so the parent can show "unsaved". */
  onDirty?: () => void;
}

const MAX_COLS = 60;
const MAX_ROWS = 1000;

export function LightSheetEditor({ initialSnapshot, readOnly = false, onReady, onDirty }: Props) {
  const [grid, setGrid] = useState<LightSnapshot>(() => initialSnapshot ?? emptyLightSnapshot());

  // Expose the current grid to the parent through a stable API object. The
  // refs are synced in effects (never during render) — getSnapshot is only
  // called from event handlers, which always run after the sync effect.
  const gridRef = useRef(grid);
  const onReadyRef = useRef(onReady);
  useEffect(() => { gridRef.current = grid; }, [grid]);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);
  useEffect(() => {
    onReadyRef.current({
      getSnapshot: () => makeLightSnapshot(gridRef.current.columns, gridRef.current.rows),
    });
  }, []);

  function mutate(update: (g: LightSnapshot) => LightSnapshot) {
    if (readOnly) return;
    setGrid((g) => update(g));
    onDirty?.();
  }

  const setCell = (r: number, c: number, value: string) =>
    mutate((g) => {
      const rows = g.rows.map((row, ri) =>
        ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row,
      );
      return { ...g, rows };
    });

  const setHeader = (c: number, value: string) =>
    mutate((g) => ({ ...g, columns: g.columns.map((h, ci) => (ci === c ? value : h)) }));

  const addRow = () =>
    mutate((g) =>
      g.rows.length >= MAX_ROWS ? g : { ...g, rows: [...g.rows, Array(g.columns.length).fill("")] },
    );

  const addColumn = () =>
    mutate((g) =>
      g.columns.length >= MAX_COLS
        ? g
        : {
            ...g,
            columns: [...g.columns, defaultColumnName(g.columns.length)],
            rows: g.rows.map((r) => [...r, ""]),
          },
    );

  const removeRow = (r: number) =>
    mutate((g) => (g.rows.length <= 1 ? g : { ...g, rows: g.rows.filter((_, ri) => ri !== r) }));

  const removeColumn = (c: number) =>
    mutate((g) =>
      g.columns.length <= 1
        ? g
        : {
            ...g,
            columns: g.columns.filter((_, ci) => ci !== c),
            rows: g.rows.map((row) => row.filter((_, ci) => ci !== c)),
          },
    );

  /** Excel/Sheets paste: expand tab/newline separated data from the anchor cell. */
  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>, r: number, c: number) {
    const text = e.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return; // single-cell paste
    e.preventDefault();
    const block = text
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .filter((line, i, arr) => !(i === arr.length - 1 && line === ""))
      .map((line) => line.split("\t"));
    mutate((g) => {
      const needCols = Math.min(MAX_COLS, Math.max(g.columns.length, c + Math.max(...block.map((b) => b.length))));
      const needRows = Math.min(MAX_ROWS, Math.max(g.rows.length, r + block.length));
      const columns = [...g.columns];
      while (columns.length < needCols) columns.push(defaultColumnName(columns.length));
      const rows = g.rows.map((row) => {
        const next = [...row];
        while (next.length < needCols) next.push("");
        return next;
      });
      while (rows.length < needRows) rows.push(Array(needCols).fill(""));
      block.forEach((line, dr) => {
        line.forEach((value, dc) => {
          const rr = r + dr;
          const cc = c + dc;
          if (rr < needRows && cc < needCols) rows[rr][cc] = value;
        });
      });
      return { ...g, columns, rows };
    });
  }

  const cellCls =
    "w-full min-w-[120px] border-0 bg-transparent px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-ring disabled:cursor-default";

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="sticky top-0 z-10 w-10 border-b border-r border-line bg-surface-muted/80 px-1 py-1.5 text-[11px] font-semibold text-subtle">
                #
              </th>
              {grid.columns.map((h, c) => (
                <th key={c} className="sticky top-0 z-10 border-b border-r border-line bg-surface-muted/80 p-0 last:border-r-0">
                  <div className="group flex items-center">
                    <input
                      value={h}
                      onChange={(e) => setHeader(c, e.target.value)}
                      disabled={readOnly}
                      className={cn(cellCls, "py-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted")}
                      aria-label={`Sütun başlığı ${c + 1}`}
                    />
                    {!readOnly && grid.columns.length > 1 && (
                      <button
                        onClick={() => removeColumn(c)}
                        className="mr-1 hidden rounded p-0.5 text-subtle transition-colors duration-150 hover:bg-[#fbe6e2] hover:text-danger active:scale-95 group-hover:block"
                        title="Sütunu sil"
                        tabIndex={-1}
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </th>
              ))}
              {!readOnly && (
                <th className="sticky top-0 z-10 w-9 border-b border-line bg-surface-muted/80 p-0">
                  <button
                    onClick={addColumn}
                    className="grid h-full w-9 place-items-center py-1.5 text-subtle transition-colors duration-150 hover:bg-brand-soft hover:text-brand active:scale-95"
                    title="Sütun ekle"
                  >
                    <Plus size={13} />
                  </button>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row, r) => (
              <tr key={r} className="group/row">
                <td className="border-b border-r border-line/70 bg-surface-muted/40 px-1 py-1 text-center text-[11.5px] tabular-nums text-subtle">
                  <span className="group-hover/row:hidden">{r + 1}</span>
                  {!readOnly && grid.rows.length > 1 && (
                    <button
                      onClick={() => removeRow(r)}
                      className="hidden rounded p-0.5 text-subtle transition-colors duration-150 hover:bg-[#fbe6e2] hover:text-danger active:scale-95 group-hover/row:inline-block"
                      title="Satırı sil"
                      tabIndex={-1}
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </td>
                {row.map((cell, c) => (
                  <td key={c} className="border-b border-r border-line/70 p-0 last:border-r-0">
                    <input
                      value={cell}
                      onChange={(e) => setCell(r, c, e.target.value)}
                      onPaste={(e) => handlePaste(e, r, c)}
                      disabled={readOnly}
                      className={cellCls}
                      aria-label={`Hücre ${r + 1}-${c + 1}`}
                    />
                  </td>
                ))}
                {!readOnly && <td className="border-b border-line/40" />}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="flex items-center gap-2 border-t border-line bg-surface-muted/40 px-3 py-2">
          <button
            onClick={addRow}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12.5px] font-medium text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink active:scale-[0.98]"
          >
            <Plus size={13} /> Satır ekle
          </button>
          <span className="text-[12px] text-subtle">
            <span className="tabular-nums">{grid.rows.length} satır · {grid.columns.length} sütun</span> — Excel’den kopyalanan alanı doğrudan hücreye yapıştırabilirsiniz.
          </span>
        </div>
      )}
    </div>
  );
}
