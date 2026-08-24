"use client";

/**
 * Hesap tablosu düzenleyici — Excel / Google Sheets davranışı.
 *
 * Aslı Hanım (2026-08-24): "Sheets kısmını tamamen Excel gibi yapalım, Google
 * Sheet'te olduğu gibi. Profesyonelce olmalı."
 *
 * Öncesinde burada düz bir HTML tablosu vardı: her hücre bir <input>, formül
 * yok, seçim yok, klavye ile gezinme yok, kopyalama yok. Bu bileşen onun
 * yerine geçer.
 *
 * NEDEN KÜTÜPHANE DEĞİL: panelin hızı yeni düzeltilmişti; sırf bu ekran için
 * ~1MB'lık bir hesap tablosu paketi taşımak mantıksızdı (kullanıcı kararı).
 * Karşılığında pivot/grafik gibi ağır özellikler kapsam dışı.
 *
 * MİMARİ
 *  • Tek doğruluk kaynağı `grid` (seyrek hücre haritası, lib/sheets/model).
 *  • Her değişiklikte TÜM ızgara yeniden hesaplanır (lib/sheets/formula).
 *    Basit ve doğru; bağımlılık grafiği tutmak bu boyutta gereksiz karmaşa.
 *  • Satır PENCERELEMESİ var: 5000 satırlık tabloda yalnız görünen satırlar
 *    DOM'a çizilir, yoksa on binlerce hücre tarayıcıyı kilitler.
 *  • Geri al/ileri al: anlık görüntü yığını (snapshot stack). Izgara seyrek
 *    olduğu için kopyalamak ucuz.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bold, Italic, AlignLeft, AlignCenter, AlignRight,
  Undo2, Redo2, Sigma, Plus, Trash2, Rows3, Columns3,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  GUTTER_W, HEAD_H, ROW_H, MAX_COLS, MAX_ROWS,
  colName, colWidth, deleteCol, deleteRow, emptyGrid, getCell, insertCol, insertRow,
  key, setCell, toA1,
  type Cell, type CellStyle, type GridSnapshot, type NumberFormat,
} from "@/lib/sheets/model";
import { evaluateGrid, isError, parseNumber, type Scalar } from "@/lib/sheets/formula";
import { alignOf, formatValue, NUMBER_FORMAT_LABELS } from "@/lib/sheets/format";

export interface SheetEditorApi {
  getSnapshot: () => GridSnapshot;
}

interface Props {
  initialSnapshot: GridSnapshot | null;
  readOnly?: boolean;
  onReady: (_api: SheetEditorApi) => void;
  onDirty?: () => void;
}

type Sel = { r1: number; c1: number; r2: number; c2: number };
const norm = (s: Sel) => ({
  r1: Math.min(s.r1, s.r2), c1: Math.min(s.c1, s.c2),
  r2: Math.max(s.r1, s.r2), c2: Math.max(s.c1, s.c2),
});
const inSel = (s: Sel, r: number, c: number) => {
  const n = norm(s);
  return r >= n.r1 && r <= n.r2 && c >= n.c1 && c <= n.c2;
};

const OVERSCAN = 6;

export function SpreadsheetEditor({ initialSnapshot, readOnly = false, onReady, onDirty }: Props) {
  const [grid, setGrid] = useState<GridSnapshot>(() => initialSnapshot ?? emptyGrid());
  const [sel, setSel] = useState<Sel>({ r1: 0, c1: 0, r2: 0, c2: 0 });
  const [editing, setEditing] = useState<{ r: number; c: number; draft: string } | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  /* Görünür yükseklik STATE'te tutulur, ref'ten render sırasında okunmaz —
     ref okumak React'in "render saf olmalı" kuralını bozuyor ve pencereleme
     ilk çizimde yanlış hesaplanıyordu. ResizeObserver ile güncellenir. */
  const [viewH, setViewH] = useState(600);
  const [dragging, setDragging] = useState(false);

  const undoStack = useRef<GridSnapshot[]>([]);
  const redoStack = useRef<GridSnapshot[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef(grid);
  useEffect(() => { gridRef.current = grid; }, [grid]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    setViewH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const onReadyRef = useRef(onReady);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);
  useEffect(() => {
    onReadyRef.current({ getSnapshot: () => gridRef.current });
  }, []);

  /** Hesaplanmış değerler — her ızgara değişiminde bir kez. */
  const values = useMemo(() => evaluateGrid(grid), [grid]);
  const valueAt = useCallback(
    (r: number, c: number): Scalar => values.get(key(r, c)) ?? "",
    [values],
  );

  const commit = useCallback((next: GridSnapshot) => {
    if (readOnly) return;
    undoStack.current.push(gridRef.current);
    if (undoStack.current.length > 100) undoStack.current.shift();
    redoStack.current = [];
    setGrid(next);
    onDirty?.();
  }, [readOnly, onDirty]);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(gridRef.current);
    setGrid(prev);
    onDirty?.();
  }, [onDirty]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(gridRef.current);
    setGrid(next);
    onDirty?.();
  }, [onDirty]);

  // ── Hücre yazma ───────────────────────────────────────────────────────────
  const writeCell = useCallback((g: GridSnapshot, r: number, c: number, raw: string): GridSnapshot => {
    const prev = getCell(g, r, c);
    const isFormula = raw.trim().startsWith("=");
    const cell: Cell = {
      ...(prev?.s ? { s: prev.s } : {}),
      ...(isFormula ? { f: raw } : raw !== "" ? { v: raw } : {}),
    };
    return setCell(g, r, c, cell);
  }, []);

  const applyEdit = useCallback((r: number, c: number, raw: string) => {
    commit(writeCell(gridRef.current, r, c, raw));
  }, [commit, writeCell]);

  // ── Seçim ve gezinme ──────────────────────────────────────────────────────
  const active = { r: sel.r1, c: sel.c1 };

  const moveTo = useCallback((r: number, c: number, extend = false) => {
    const rr = Math.max(0, Math.min(gridRef.current.rows - 1, r));
    const cc = Math.max(0, Math.min(gridRef.current.cols - 1, c));
    setSel((s) => (extend ? { ...s, r2: rr, c2: cc } : { r1: rr, c1: cc, r2: rr, c2: cc }));
    // Görünür alana kaydır
    const el = scrollRef.current;
    if (el) {
      const top = rr * ROW_H;
      if (top < el.scrollTop) el.scrollTop = top;
      else if (top + ROW_H > el.scrollTop + el.clientHeight - HEAD_H) {
        el.scrollTop = top + ROW_H - el.clientHeight + HEAD_H;
      }
    }
  }, []);

  const startEdit = useCallback((r: number, c: number, initial?: string) => {
    if (readOnly) return;
    const cell = getCell(gridRef.current, r, c);
    setEditing({ r, c, draft: initial !== undefined ? initial : (cell?.f ?? cell?.v ?? "") });
  }, [readOnly]);

  useEffect(() => {
    if (editing) editRef.current?.focus();
  }, [editing]);

  const stopEdit = useCallback((save: boolean, move?: "down" | "right") => {
    setEditing((e) => {
      if (!e) return null;
      if (save) applyEdit(e.r, e.c, e.draft);
      if (move === "down") moveTo(e.r + 1, e.c);
      if (move === "right") moveTo(e.r, e.c + 1);
      return null;
    });
  }, [applyEdit, moveTo]);

  // ── Klavye ────────────────────────────────────────────────────────────────
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (editing) return;                       // düzenleme kutusu kendi işler
    const meta = e.metaKey || e.ctrlKey;

    if (meta && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
      return;
    }
    if (meta && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    if (meta && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setSel({ r1: 0, c1: 0, r2: grid.rows - 1, c2: grid.cols - 1 });
      return;
    }

    switch (e.key) {
      case "ArrowUp":    e.preventDefault(); moveTo(active.r - 1, active.c, e.shiftKey); return;
      case "ArrowDown":  e.preventDefault(); moveTo(active.r + 1, active.c, e.shiftKey); return;
      case "ArrowLeft":  e.preventDefault(); moveTo(active.r, active.c - 1, e.shiftKey); return;
      case "ArrowRight": e.preventDefault(); moveTo(active.r, active.c + 1, e.shiftKey); return;
      case "Tab":        e.preventDefault(); moveTo(active.r, active.c + (e.shiftKey ? -1 : 1)); return;
      case "Enter":
        e.preventDefault();
        if (readOnly) { moveTo(active.r + 1, active.c); return; }
        startEdit(active.r, active.c);
        return;
      case "F2":         e.preventDefault(); startEdit(active.r, active.c); return;
      case "Home":       e.preventDefault(); moveTo(active.r, 0, e.shiftKey); return;
      case "End":        e.preventDefault(); moveTo(active.r, grid.cols - 1, e.shiftKey); return;
      case "PageDown":   e.preventDefault(); moveTo(active.r + 20, active.c, e.shiftKey); return;
      case "PageUp":     e.preventDefault(); moveTo(active.r - 20, active.c, e.shiftKey); return;
      case "Delete":
      case "Backspace": {
        if (readOnly) return;
        e.preventDefault();
        const n = norm(sel);
        let g = gridRef.current;
        for (let r = n.r1; r <= n.r2; r++)
          for (let c = n.c1; c <= n.c2; c++) {
            const prev = getCell(g, r, c);
            g = setCell(g, r, c, prev?.s ? { s: prev.s } : undefined);
          }
        commit(g);
        return;
      }
      case "Escape": setSel({ r1: active.r, c1: active.c, r2: active.r, c2: active.c }); return;
    }

    // Yazmaya başlayınca doğrudan düzenlemeye gir (Excel davranışı)
    if (!meta && !e.altKey && e.key.length === 1) {
      e.preventDefault();
      startEdit(active.r, active.c, e.key);
    }
  }, [editing, active.r, active.c, sel, grid.rows, grid.cols, moveTo, startEdit, commit, undo, redo, readOnly]);

  // ── Kopyala / kes / yapıştır ──────────────────────────────────────────────
  const selectionTsv = useCallback((): string => {
    const n = norm(sel);
    const lines: string[] = [];
    for (let r = n.r1; r <= n.r2; r++) {
      const row: string[] = [];
      for (let c = n.c1; c <= n.c2; c++) {
        const cell = getCell(grid, r, c);
        row.push(cell?.f ?? cell?.v ?? "");
      }
      lines.push(row.join("\t"));
    }
    return lines.join("\n");
  }, [sel, grid]);

  const onCopy = useCallback((e: React.ClipboardEvent) => {
    if (editing) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", selectionTsv());
  }, [editing, selectionTsv]);

  const onCut = useCallback((e: React.ClipboardEvent) => {
    if (editing || readOnly) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", selectionTsv());
    const n = norm(sel);
    let g = gridRef.current;
    for (let r = n.r1; r <= n.r2; r++)
      for (let c = n.c1; c <= n.c2; c++) g = setCell(g, r, c, undefined);
    commit(g);
  }, [editing, readOnly, selectionTsv, sel, commit]);

  const onPaste = useCallback((e: React.ClipboardEvent) => {
    if (editing || readOnly) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    // Excel / Sheets panosu: satırlar \n, sütunlar \t
    const rows = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    if (rows.length && rows[rows.length - 1] === "") rows.pop();
    let g = gridRef.current;
    const needRows = active.r + rows.length;
    const needCols = active.c + Math.max(...rows.map((r) => r.split("\t").length));
    if (needRows > g.rows) g = { ...g, rows: Math.min(MAX_ROWS, needRows) };
    if (needCols > g.cols) g = { ...g, cols: Math.min(MAX_COLS, needCols) };
    rows.forEach((line, dr) => {
      line.split("\t").forEach((cellText, dc) => {
        g = writeCell(g, active.r + dr, active.c + dc, cellText);
      });
    });
    commit(g);
    setSel({
      r1: active.r, c1: active.c,
      r2: Math.min(g.rows - 1, active.r + rows.length - 1),
      c2: Math.min(g.cols - 1, needCols - 1),
    });
  }, [editing, readOnly, active.r, active.c, commit, writeCell]);

  // ── Biçim ─────────────────────────────────────────────────────────────────
  const applyStyle = useCallback((patch: Partial<CellStyle>) => {
    if (readOnly) return;
    const n = norm(sel);
    let g = gridRef.current;
    for (let r = n.r1; r <= n.r2; r++)
      for (let c = n.c1; c <= n.c2; c++) {
        const prev = getCell(g, r, c);
        const s: CellStyle = { ...(prev?.s ?? {}), ...patch };
        for (const k of Object.keys(s) as (keyof CellStyle)[]) {
          if (s[k] === undefined || s[k] === false) delete s[k];
        }
        g = setCell(g, r, c, { ...(prev ?? {}), s });
      }
    commit(g);
  }, [readOnly, sel, commit]);

  const activeStyle = getCell(grid, active.r, active.c)?.s ?? {};

  const toggleBold = () => applyStyle({ b: !activeStyle.b });
  const toggleItalic = () => applyStyle({ i: !activeStyle.i });

  /** Seçimin altına TOPLA formülü yazar (Excel'in Σ düğmesi). */
  const autoSum = useCallback(() => {
    if (readOnly) return;
    const n = norm(sel);
    const target = { r: n.r2 + 1, c: n.c1 };
    if (target.r >= gridRef.current.rows) return;
    const range = `${toA1(n.r1, n.c1)}:${toA1(n.r2, n.c1)}`;
    commit(writeCell(gridRef.current, target.r, target.c, `=TOPLA(${range})`));
    moveTo(target.r, target.c);
  }, [readOnly, sel, commit, writeCell, moveTo]);

  // ── Satır / sütun ─────────────────────────────────────────────────────────
  const doInsertRow = () => commit(insertRow(gridRef.current, norm(sel).r1));
  const doDeleteRow = () => commit(deleteRow(gridRef.current, norm(sel).r1));
  const doInsertCol = () => commit(insertCol(gridRef.current, norm(sel).c1));
  const doDeleteCol = () => commit(deleteCol(gridRef.current, norm(sel).c1));

  // ── Sütun genişliği sürükleme ─────────────────────────────────────────────
  const resizeRef = useRef<{ c: number; startX: number; startW: number } | null>(null);
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const st = resizeRef.current;
      if (!st) return;
      const w = Math.max(48, Math.min(600, st.startW + (e.clientX - st.startX)));
      setGrid((g) => ({ ...g, colW: { ...(g.colW ?? {}), [st.c]: w } }));
    }
    function onUp() {
      if (resizeRef.current) { resizeRef.current = null; onDirty?.(); }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [onDirty]);

  // ── Satır pencereleme ─────────────────────────────────────────────────────
  const firstRow = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const lastRow = Math.min(grid.rows - 1, Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN);
  const visibleRows: number[] = [];
  for (let r = firstRow; r <= lastRow; r++) visibleRows.push(r);

  const colLefts = useMemo(() => {
    const out: number[] = [];
    let x = 0;
    for (let c = 0; c < grid.cols; c++) { out.push(x); x += colWidth(grid, c); }
    return out;
  }, [grid]);
  const totalW = colLefts.length ? colLefts[colLefts.length - 1] + colWidth(grid, grid.cols - 1) : 0;

  // ── Durum çubuğu özeti ────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const n = norm(sel);
    const nums: number[] = [];
    let filled = 0;
    for (let r = n.r1; r <= n.r2; r++)
      for (let c = n.c1; c <= n.c2; c++) {
        const v = valueAt(r, c);
        if (v === "" || isError(v)) continue;
        filled++;
        const num = typeof v === "number" ? v : parseNumber(String(v));
        if (num !== null) nums.push(num);
      }
    if (nums.length === 0) return filled > 0 ? `${filled} dolu hücre` : null;
    const sum = nums.reduce((s, x) => s + x, 0);
    const fmt = (x: number) => x.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
    return `Toplam ${fmt(sum)}  ·  Ortalama ${fmt(sum / nums.length)}  ·  Sayı ${nums.length}`;
  }, [sel, valueAt]);

  const selN = norm(sel);
  const selLabel = selN.r1 === selN.r2 && selN.c1 === selN.c2
    ? toA1(selN.r1, selN.c1)
    : `${toA1(selN.r1, selN.c1)}:${toA1(selN.r2, selN.c2)}`;
  const activeCell = getCell(grid, active.r, active.c);
  const formulaBarValue = editing ? editing.draft : (activeCell?.f ?? activeCell?.v ?? "");

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      {/* ── Araç çubuğu ──────────────────────────────────────────────────── */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-1 border-b border-hairline px-2 py-1.5">
          <TBtn onClick={undo} title="Geri al (⌘Z)"><Undo2 size={15} /></TBtn>
          <TBtn onClick={redo} title="İleri al (⇧⌘Z)"><Redo2 size={15} /></TBtn>
          <Sep />
          <TBtn onClick={toggleBold} active={!!activeStyle.b} title="Kalın (⌘B)"><Bold size={15} /></TBtn>
          <TBtn onClick={toggleItalic} active={!!activeStyle.i} title="İtalik (⌘I)"><Italic size={15} /></TBtn>
          <Sep />
          <TBtn onClick={() => applyStyle({ a: "l" })} active={activeStyle.a === "l"} title="Sola yasla"><AlignLeft size={15} /></TBtn>
          <TBtn onClick={() => applyStyle({ a: "c" })} active={activeStyle.a === "c"} title="Ortala"><AlignCenter size={15} /></TBtn>
          <TBtn onClick={() => applyStyle({ a: "r" })} active={activeStyle.a === "r"} title="Sağa yasla"><AlignRight size={15} /></TBtn>
          <Sep />
          <select
            value={activeStyle.n ?? "auto"}
            onChange={(e) => applyStyle({ n: e.target.value as NumberFormat })}
            className="h-7 rounded-md border border-line bg-surface px-1.5 text-[12.5px] text-muted transition-colors hover:border-line-strong focus:outline-none focus:ring-2 focus:ring-brand-ring/40"
            aria-label="Sayı biçimi"
          >
            {NUMBER_FORMAT_LABELS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <Sep />
          <TBtn onClick={autoSum} title="Otomatik toplam — seçimin altına =TOPLA yazar"><Sigma size={15} /></TBtn>
          <Sep />
          <TBtn onClick={doInsertRow} title="Üste satır ekle"><Rows3 size={15} /><Plus size={10} className="-ml-1" /></TBtn>
          <TBtn onClick={doDeleteRow} title="Satırı sil"><Rows3 size={15} /><Trash2 size={10} className="-ml-1" /></TBtn>
          <TBtn onClick={doInsertCol} title="Sola sütun ekle"><Columns3 size={15} /><Plus size={10} className="-ml-1" /></TBtn>
          <TBtn onClick={doDeleteCol} title="Sütunu sil"><Columns3 size={15} /><Trash2 size={10} className="-ml-1" /></TBtn>
        </div>
      )}

      {/* ── Formül çubuğu ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-0 border-b border-hairline">
        <span className="grid h-8 shrink-0 place-items-center border-r border-hairline px-2 text-[12.5px] font-semibold tabular-nums text-muted" style={{ width: GUTTER_W + 24 }}>
          {selLabel}
        </span>
        <span className="grid h-8 w-7 shrink-0 place-items-center border-r border-hairline text-[13px] font-serif italic text-subtle">fx</span>
        <input
          value={formulaBarValue}
          readOnly={readOnly}
          onChange={(e) => setEditing({ r: active.r, c: active.c, draft: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); stopEdit(true, "down"); }
            if (e.key === "Escape") { e.preventDefault(); stopEdit(false); }
          }}
          onFocus={() => { if (!editing && !readOnly) startEdit(active.r, active.c); }}
          placeholder="Değer veya =formül"
          className="h-8 min-w-0 flex-1 bg-transparent px-2.5 text-[13px] text-ink placeholder:text-subtle focus:outline-none"
        />
      </div>

      {/* ── Izgara ───────────────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        tabIndex={0}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        onKeyDown={onKeyDown}
        onCopy={onCopy}
        onCut={onCut}
        onPaste={onPaste}
        onMouseUp={() => setDragging(false)}
        className="relative min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-ring/40"
      >
        <div style={{ width: totalW + GUTTER_W, height: grid.rows * ROW_H + HEAD_H, position: "relative" }}>
          {/* Sütun başlıkları */}
          <div className="sticky top-0 z-20 flex" style={{ height: HEAD_H }}>
            <div
              className="sticky left-0 z-30 shrink-0 border-b border-r border-line-strong bg-surface-muted"
              style={{ width: GUTTER_W, height: HEAD_H }}
            />
            {colLefts.map((left, c) => (
              <div
                key={c}
                onClick={() => setSel({ r1: 0, c1: c, r2: grid.rows - 1, c2: c })}
                className={cn(
                  "relative shrink-0 cursor-pointer select-none border-b border-r border-line-strong text-center text-[11.5px] font-semibold leading-[30px] text-muted",
                  c >= selN.c1 && c <= selN.c2 ? "bg-brand-soft text-brand-strong" : "bg-surface-muted",
                )}
                style={{ width: colWidth(grid, c), height: HEAD_H }}
                title={`${colName(c)} sütunu`}
              >
                {colName(c)}
                {/* Genişlik tutamacı */}
                <span
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    resizeRef.current = { c, startX: e.clientX, startW: colWidth(gridRef.current, c) };
                  }}
                  className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-brand/40"
                />
              </div>
            ))}
          </div>

          {/* Satırlar */}
          {visibleRows.map((r) => (
            <div
              key={r}
              className="absolute flex"
              style={{ top: r * ROW_H + HEAD_H, height: ROW_H, left: 0 }}
            >
              {/* Satır numarası */}
              <div
                onClick={() => setSel({ r1: r, c1: 0, r2: r, c2: grid.cols - 1 })}
                className={cn(
                  "sticky left-0 z-10 shrink-0 cursor-pointer select-none border-b border-r border-line text-center text-[11.5px] tabular-nums leading-[29px]",
                  r >= selN.r1 && r <= selN.r2 ? "bg-brand-soft font-semibold text-brand-strong" : "bg-surface-muted text-subtle",
                )}
                style={{ width: GUTTER_W, height: ROW_H }}
              >
                {r + 1}
              </div>

              {colLefts.map((_left, c) => {
                const isEditing = editing?.r === r && editing?.c === c;
                const isActive = active.r === r && active.c === c;
                const selected = inSel(sel, r, c);
                const cell = getCell(grid, r, c);
                const val = valueAt(r, c);
                const st = cell?.s;
                const w = colWidth(grid, c);

                if (isEditing) {
                  return (
                    <div key={c} className="relative shrink-0" style={{ width: w, height: ROW_H }}>
                      <input
                        ref={editRef}
                        value={editing.draft}
                        onChange={(e) => setEditing({ r, c, draft: e.target.value })}
                        onBlur={() => stopEdit(true)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); stopEdit(true, "down"); }
                          else if (e.key === "Tab") { e.preventDefault(); stopEdit(true, "right"); }
                          else if (e.key === "Escape") { e.preventDefault(); stopEdit(false); }
                        }}
                        className="absolute inset-0 z-40 w-full border-2 border-brand bg-surface px-1.5 text-[13px] text-ink shadow-pop outline-none"
                        style={{ minWidth: w }}
                      />
                    </div>
                  );
                }

                return (
                  <div
                    key={c}
                    onMouseDown={(e) => {
                      if (e.detail === 2) { startEdit(r, c); return; }
                      setDragging(true);
                      setSel(e.shiftKey ? { r1: active.r, c1: active.c, r2: r, c2: c } : { r1: r, c1: c, r2: r, c2: c });
                      scrollRef.current?.focus();
                    }}
                    onMouseEnter={() => { if (dragging) setSel((s) => ({ ...s, r2: r, c2: c })); }}
                    className={cn(
                      "shrink-0 select-none overflow-hidden whitespace-nowrap border-b border-r border-hairline px-1.5 text-[13px] leading-[29px]",
                      selected ? "bg-brand-soft/50" : "bg-surface",
                      isActive && "outline outline-2 -outline-offset-2 outline-brand",
                      isError(val) ? "text-danger" : "text-ink",
                      st?.b && "font-semibold",
                      st?.i && "italic",
                    )}
                    style={{ width: w, height: ROW_H, textAlign: alignOf(val, st) }}
                    title={cell?.f ? `${cell.f} → ${formatValue(val, st)}` : undefined}
                  >
                    {formatValue(val, st)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Durum çubuğu ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 border-t border-hairline px-3 py-1.5 text-[12px] text-subtle">
        <span className="tabular-nums">{grid.rows} satır · {grid.cols} sütun</span>
        {summary && <span className="truncate font-medium tabular-nums text-muted">{summary}</span>}
      </div>
    </div>
  );
}

function TBtn({
  onClick, title, active, children,
}: { onClick: () => void; title: string; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 items-center gap-0 rounded-md px-1.5 transition-colors duration-150 active:scale-[0.97]",
        active ? "bg-brand-soft text-brand-strong" : "text-muted hover:bg-surface-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-0.5 h-5 w-px shrink-0 bg-line" />;
