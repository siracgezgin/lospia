"use client";

/**
 * Hesap tablosu düzenleyici — Excel / Google Sheets davranışı.
 *
 * Aslı Hanım (2026-08-24): "Sheets kısmını tamamen Excel gibi yapalım, Google
 * Sheet'te olduğu gibi. Profesyonelce olmalı." İlk sürümden sonra üç eksik
 * söyledi ve bu sürüm onları kapatır:
 *   • sayfa sekmeleri yok        → altta Sayfa1/Sayfa2… sekmeleri
 *   • doldurma tutamağı + sağ tık yok → köşeden çekip doldurma, sağ tık menüsü
 *   • biçimlendirme zayıf        → dolgu/yazı rengi, kenarlık, birleştirme,
 *                                  metni kaydır, ondalık artır/azalt
 * Kaydetme de elle değil, kendiliğinden (üst bileşen yürütür).
 *
 * NEDEN KÜTÜPHANE DEĞİL: panelin hızı yeni düzeltilmişti; sırf bu ekran için
 * ~1MB'lık bir paket taşımak mantıksızdı (kullanıcı kararı).
 *
 * MİMARİ
 *  • Tek doğruluk kaynağı `wb` (çok sayfalı kitap, lib/sheets/model).
 *  • Etkin sayfa her değiştiğinde bir kez hesaplanır (lib/sheets/formula).
 *  • Satır PENCERELEMESİ: yalnız görünen satırlar DOM'a çizilir.
 *  • Geri al/ileri al: kitap anlık görüntüsü yığını (hücreler seyrek, ucuz).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  Undo2, Redo2, Sigma, Plus, WrapText,
  PaintBucket, Baseline, Square, Combine, X, Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  GUTTER_W, HEAD_H, ROW_H, MAX_COLS, MAX_ROWS,
  activeSheet, colName, colWidth, deleteCol, deleteRow, emptySheet, emptyWorkbook,
  getCell, insertCol, insertRow, key, mergeAt, mergeKey, mergesOf, newSheetId,
  rowHeight, setCell, toA1, uniqueSheetName, withSheet,
  type Cell, type CellStyle, type NumberFormat, type Sheet, type WorkbookSnapshot,
} from "@/lib/sheets/model";
import { evaluateSheet, isError, parseNumber, shiftFormula, type Scalar } from "@/lib/sheets/formula";
import { alignOf, formatValue, NUMBER_FORMAT_LABELS } from "@/lib/sheets/format";

export interface SheetEditorApi {
  getSnapshot: () => WorkbookSnapshot;
}

interface Props {
  initialSnapshot: WorkbookSnapshot | null;
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

/** Dolgu ve yazı için sade palet — marka tonlarıyla çakışmayan yumuşak renkler. */
const FILL_COLORS = [
  "", "#fee2e2", "#ffedd5", "#fef9c3", "#dcfce7", "#dbeafe", "#ede9fe", "#fce7f3", "#e5e7eb", "#111827",
];
const TEXT_COLORS = [
  "", "#b91c1c", "#c2410c", "#a16207", "#15803d", "#1d4ed8", "#6d28d9", "#be185d", "#374151", "#ffffff",
];

export function SpreadsheetEditor({ initialSnapshot, readOnly = false, onReady, onDirty }: Props) {
  const [wb, setWb] = useState<WorkbookSnapshot>(() => initialSnapshot ?? emptyWorkbook());
  const [sel, setSel] = useState<Sel>({ r1: 0, c1: 0, r2: 0, c2: 0 });
  const [editing, setEditing] = useState<{ r: number; c: number; draft: string } | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);
  const [dragging, setDragging] = useState(false);
  /** Doldurma tutamacı sürükleniyorsa hedef aralık. */
  const [fillTo, setFillTo] = useState<{ r: number; c: number } | null>(null);
  /* Sürükleme durumu ref'te de tutulur: bırakma (mouseup) pencere seviyesinde
     dinleniyor — fare hücrenin dışında bırakılsa bile doldurma uygulanmalı.
     Yalnız state'e güvenmek, olay dinleyicisinin eski değeri görmesine yol
     açıyordu ve bırakınca hiçbir şey olmuyordu. */
  const fillRef = useRef<{ from: Sel; to: { r: number; c: number } } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; kind: "cell" | "row" | "col"; r: number; c: number } | null>(null);
  const [popover, setPopover] = useState<"fill" | "text" | "border" | null>(null);
  const [renaming, setRenaming] = useState<{ index: number; draft: string } | null>(null);

  const undoStack = useRef<WorkbookSnapshot[]>([]);
  const redoStack = useRef<WorkbookSnapshot[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const wbRef = useRef(wb);
  useEffect(() => { wbRef.current = wb; }, [wb]);

  const sheet = activeSheet(wb);
  const sheetRef = useRef(sheet);
  useEffect(() => { sheetRef.current = sheet; }, [sheet]);

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
  useEffect(() => { onReadyRef.current({ getSnapshot: () => wbRef.current }); }, []);

  // Menü/paletleri dışarı tıklayınca kapat
  useEffect(() => {
    if (!menu && !popover) return;
    const close = () => { setMenu(null); setPopover(null); };
    window.addEventListener("mousedown", close);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("resize", close); };
  }, [menu, popover]);

  const values = useMemo(() => evaluateSheet(wb, sheet), [wb, sheet]);
  const valueAt = useCallback((r: number, c: number): Scalar => values.get(key(r, c)) ?? "", [values]);

  // ── Değişiklik kaydı ──────────────────────────────────────────────────────
  const commitWb = useCallback((next: WorkbookSnapshot) => {
    if (readOnly) return;
    undoStack.current.push(wbRef.current);
    if (undoStack.current.length > 100) undoStack.current.shift();
    redoStack.current = [];
    setWb(next);
    onDirty?.();
  }, [readOnly, onDirty]);

  const commit = useCallback((nextSheet: Sheet) => {
    commitWb(withSheet(wbRef.current, wbRef.current.active, nextSheet));
  }, [commitWb]);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(wbRef.current);
    setWb(prev);
    onDirty?.();
  }, [onDirty]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(wbRef.current);
    setWb(next);
    onDirty?.();
  }, [onDirty]);

  // ── Hücre yazma ───────────────────────────────────────────────────────────
  const writeCell = useCallback((g: Sheet, r: number, c: number, raw: string): Sheet => {
    const prev = getCell(g, r, c);
    const isFormula = raw.trim().startsWith("=");
    const cell: Cell = {
      ...(prev?.s ? { s: prev.s } : {}),
      ...(isFormula ? { f: raw } : raw !== "" ? { v: raw } : {}),
    };
    return setCell(g, r, c, cell);
  }, []);

  const applyEdit = useCallback((r: number, c: number, raw: string) => {
    commit(writeCell(sheetRef.current, r, c, raw));
  }, [commit, writeCell]);

  // ── Seçim ve gezinme ──────────────────────────────────────────────────────
  const active = { r: sel.r1, c: sel.c1 };

  const moveTo = useCallback((r: number, c: number, extend = false) => {
    const g = sheetRef.current;
    const rr = Math.max(0, Math.min(g.rows - 1, r));
    const cc = Math.max(0, Math.min(g.cols - 1, c));
    setSel((s) => (extend ? { ...s, r2: rr, c2: cc } : { r1: rr, c1: cc, r2: rr, c2: cc }));
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
    const cell = getCell(sheetRef.current, r, c);
    setEditing({ r, c, draft: initial !== undefined ? initial : (cell?.f ?? cell?.v ?? "") });
  }, [readOnly]);

  useEffect(() => { if (editing) editRef.current?.focus(); }, [editing]);

  const stopEdit = useCallback((save: boolean, move?: "down" | "right") => {
    setEditing((e) => {
      if (!e) return null;
      if (save) applyEdit(e.r, e.c, e.draft);
      if (move === "down") moveTo(e.r + 1, e.c);
      if (move === "right") moveTo(e.r, e.c + 1);
      return null;
    });
  }, [applyEdit, moveTo]);

  const clearRange = useCallback((n: Sel, alsoStyle = false) => {
    let g = sheetRef.current;
    for (let r = n.r1; r <= n.r2; r++)
      for (let c = n.c1; c <= n.c2; c++) {
        const prev = getCell(g, r, c);
        g = setCell(g, r, c, !alsoStyle && prev?.s ? { s: prev.s } : undefined);
      }
    commit(g);
  }, [commit]);

  // ── Biçim ─────────────────────────────────────────────────────────────────
  const applyStyle = useCallback((patch: Partial<CellStyle>) => {
    if (readOnly) return;
    const n = norm(sel);
    let g = sheetRef.current;
    for (let r = n.r1; r <= n.r2; r++)
      for (let c = n.c1; c <= n.c2; c++) {
        const prev = getCell(g, r, c);
        const s: CellStyle = { ...(prev?.s ?? {}), ...patch };
        for (const k of Object.keys(s) as (keyof CellStyle)[]) {
          if (s[k] === undefined || s[k] === false || s[k] === "") delete s[k];
        }
        g = setCell(g, r, c, { ...(prev ?? {}), s });
      }
    commit(g);
    setPopover(null);
  }, [readOnly, sel, commit]);

  const activeStyle = getCell(sheet, active.r, active.c)?.s ?? {};

  /** Ondalık basamağı artır/azalt — biçim "Genel" ise "Sayı"ya geçer. */
  const stepDecimals = (delta: number) => {
    const cur = activeStyle.d ?? (activeStyle.n === "money" ? 2 : 0);
    const next = Math.max(0, Math.min(8, cur + delta));
    applyStyle({ n: activeStyle.n && activeStyle.n !== "auto" ? activeStyle.n : "number", d: next });
  };

  // ── Klavye ────────────────────────────────────────────────────────────────
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (editing) return;
    const meta = e.metaKey || e.ctrlKey;

    if (meta && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (meta && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    if (meta && e.key.toLowerCase() === "a") { e.preventDefault(); setSel({ r1: 0, c1: 0, r2: sheet.rows - 1, c2: sheet.cols - 1 }); return; }
    if (meta && e.key.toLowerCase() === "b") { e.preventDefault(); applyStyle({ b: !activeStyle.b }); return; }
    if (meta && e.key.toLowerCase() === "i") { e.preventDefault(); applyStyle({ i: !activeStyle.i }); return; }
    if (meta && e.key.toLowerCase() === "u") { e.preventDefault(); applyStyle({ u: !activeStyle.u }); return; }

    /* Shift+ok seçimi UCUNDAN büyütür.
       Hareket her zaman `active`ten (seçimin çıpası) hesaplanıyordu; bu yüzden
       Shift+Aşağı'ya ikinci kez basmak seçimi büyütmüyor, hep bir satır
       aşağıda kalıyordu. Excel'de çıpa sabit kalır, hareket eden UÇTUR. */
    const er = e.shiftKey ? sel.r2 : active.r;
    const ec = e.shiftKey ? sel.c2 : active.c;

    switch (e.key) {
      case "ArrowUp":    e.preventDefault(); moveTo(er - 1, ec, e.shiftKey); return;
      case "ArrowDown":  e.preventDefault(); moveTo(er + 1, ec, e.shiftKey); return;
      case "ArrowLeft":  e.preventDefault(); moveTo(er, ec - 1, e.shiftKey); return;
      case "ArrowRight": e.preventDefault(); moveTo(er, ec + 1, e.shiftKey); return;
      case "Tab":        e.preventDefault(); moveTo(active.r, active.c + (e.shiftKey ? -1 : 1)); return;
      case "Enter":      e.preventDefault(); if (readOnly) moveTo(active.r + 1, active.c); else startEdit(active.r, active.c); return;
      case "F2":         e.preventDefault(); startEdit(active.r, active.c); return;
      case "Home":       e.preventDefault(); moveTo(er, 0, e.shiftKey); return;
      case "End":        e.preventDefault(); moveTo(er, sheet.cols - 1, e.shiftKey); return;
      case "PageDown":   e.preventDefault(); moveTo(er + 20, ec, e.shiftKey); return;
      case "PageUp":     e.preventDefault(); moveTo(er - 20, ec, e.shiftKey); return;
      case "Delete":
      case "Backspace":  if (readOnly) return; e.preventDefault(); clearRange(norm(sel)); return;
      case "Escape":     setSel({ r1: active.r, c1: active.c, r2: active.r, c2: active.c }); return;
    }

    if (!meta && !e.altKey && e.key.length === 1) { e.preventDefault(); startEdit(active.r, active.c, e.key); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, active.r, active.c, sel, sheet.rows, sheet.cols, moveTo, startEdit, clearRange, undo, redo, readOnly]);

  // ── Kopyala / kes / yapıştır ──────────────────────────────────────────────
  const selectionTsv = useCallback((): string => {
    const n = norm(sel);
    const lines: string[] = [];
    for (let r = n.r1; r <= n.r2; r++) {
      const row: string[] = [];
      for (let c = n.c1; c <= n.c2; c++) {
        const cell = getCell(sheet, r, c);
        row.push(cell?.f ?? cell?.v ?? "");
      }
      lines.push(row.join("\t"));
    }
    return lines.join("\n");
  }, [sel, sheet]);

  const onCopy = useCallback((e: React.ClipboardEvent) => {
    if (editing) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", selectionTsv());
  }, [editing, selectionTsv]);

  const onCut = useCallback((e: React.ClipboardEvent) => {
    if (editing || readOnly) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", selectionTsv());
    clearRange(norm(sel), true);
  }, [editing, readOnly, selectionTsv, sel, clearRange]);

  function pasteText(text: string) {
    const rows = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    if (rows.length && rows[rows.length - 1] === "") rows.pop();
    let g = sheetRef.current;
    const needRows = active.r + rows.length;
    const needCols = active.c + Math.max(...rows.map((r) => r.split("\t").length));
    if (needRows > g.rows) g = { ...g, rows: Math.min(MAX_ROWS, needRows) };
    if (needCols > g.cols) g = { ...g, cols: Math.min(MAX_COLS, needCols) };
    rows.forEach((line, dr) => {
      line.split("\t").forEach((cellText, dc) => { g = writeCell(g, active.r + dr, active.c + dc, cellText); });
    });
    commit(g);
    setSel({
      r1: active.r, c1: active.c,
      r2: Math.min(g.rows - 1, active.r + rows.length - 1),
      c2: Math.min(g.cols - 1, needCols - 1),
    });
  }

  function onPaste(e: React.ClipboardEvent) {
    if (editing || readOnly) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    pasteText(text);
  }

  /** Seçimi birleştir / birleşmeyi çöz. */
  const toggleMerge = () => {
    if (readOnly) return;
    const n = norm(sel);
    const g = sheetRef.current;
    const existing = mergeAt(g, n.r1, n.c1);
    if (existing) {
      commit({ ...g, merges: (g.merges ?? []).filter((m) => m !== mergeKey(existing.rect)) });
      return;
    }
    if (n.r1 === n.r2 && n.c1 === n.c2) return;   // tek hücre birleşmez
    // Kapsanan eski birleşmeleri temizle, sonra ekle
    const kept = mergesOf(g).filter(
      (m) => m.r2 < n.r1 || m.r1 > n.r2 || m.c2 < n.c1 || m.c1 > n.c2,
    ).map(mergeKey);
    commit({ ...g, merges: [...kept, mergeKey(n)] });
  };

  const autoSum = useCallback(() => {
    if (readOnly) return;
    const n = norm(sel);
    const target = { r: n.r2 + 1, c: n.c1 };
    if (target.r >= sheetRef.current.rows) return;
    const range = `${toA1(n.r1, n.c1)}:${toA1(n.r2, n.c1)}`;
    commit(writeCell(sheetRef.current, target.r, target.c, `=TOPLA(${range})`));
    moveTo(target.r, target.c);
  }, [readOnly, sel, commit, writeCell, moveTo]);

  // ── Doldurma tutamağı ─────────────────────────────────────────────────────
  /**
   * Seçimi hedefe kadar doldurur. Formüller GÖRECELİ referanslarıyla kayar
   * (=A1*B1 bir aşağı → =A2*B2); sayı dizisi ise seri devam eder (1,2 → 3,4).
   */
  const doFill = useCallback((from: Sel, to: { r: number; c: number }) => {
    if (readOnly) return;
    const n = norm(from);
    const g0 = sheetRef.current;
    const down = to.r > n.r2;
    const right = to.c > n.c2;
    if (!down && !right) return;

    let g = g0;
    const srcH = n.r2 - n.r1 + 1;
    const srcW = n.c2 - n.c1 + 1;

    // Sayı serisi adımı: kaynak tek sütun/satır ve hepsi sayıysa
    const stepOf = (vals: (number | null)[]): number | null => {
      if (vals.length < 2 || vals.some((v) => v === null)) return null;
      const d = (vals[1] as number) - (vals[0] as number);
      for (let i = 2; i < vals.length; i++) {
        if ((vals[i] as number) - (vals[i - 1] as number) !== d) return null;
      }
      return d;
    };

    if (down) {
      for (let c = n.c1; c <= n.c2; c++) {
        const col = [];
        for (let r = n.r1; r <= n.r2; r++) col.push(parseNumber(getCell(g0, r, c)?.v ?? ""));
        const step = stepOf(col);
        for (let r = n.r2 + 1; r <= to.r; r++) {
          const srcR = n.r1 + ((r - n.r1) % srcH);
          const src = getCell(g0, srcR, c);
          if (step !== null) {
            const base = col[col.length - 1] as number;
            g = writeCell(g, r, c, String(base + step * (r - n.r2)));
          } else if (src?.f) {
            g = setCell(g, r, c, { ...src, f: shiftFormula(src.f, r - srcR, 0) });
          } else {
            g = setCell(g, r, c, src ? { ...src } : undefined);
          }
        }
      }
    }
    if (right) {
      for (let r = n.r1; r <= n.r2; r++) {
        const row = [];
        for (let c = n.c1; c <= n.c2; c++) row.push(parseNumber(getCell(g0, r, c)?.v ?? ""));
        const step = stepOf(row);
        for (let c = n.c2 + 1; c <= to.c; c++) {
          const srcC = n.c1 + ((c - n.c1) % srcW);
          const src = getCell(g0, r, srcC);
          if (step !== null) {
            const base = row[row.length - 1] as number;
            g = writeCell(g, r, c, String(base + step * (c - n.c2)));
          } else if (src?.f) {
            g = setCell(g, r, c, { ...src, f: shiftFormula(src.f, 0, c - srcC) });
          } else {
            g = setCell(g, r, c, src ? { ...src } : undefined);
          }
        }
      }
    }
    commit(g);
    setSel({ r1: n.r1, c1: n.c1, r2: Math.max(n.r2, to.r), c2: Math.max(n.c2, to.c) });
  }, [readOnly, commit, writeCell]);

  // Doldurma bırakması pencere seviyesinde — fare ızgaranın dışına çıksa bile.
  useEffect(() => {
    function onUp() {
      const st = fillRef.current;
      fillRef.current = null;
      if (!st) return;
      setFillTo(null);
      const n = norm(st.from);
      const to = { r: Math.max(st.to.r, n.r2), c: Math.max(st.to.c, n.c2) };
      if (to.r > n.r2 || to.c > n.c2) doFill(st.from, to);
    }
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [doFill]);

  // ── Satır / sütun ─────────────────────────────────────────────────────────
  const doInsertRow = (at: number) => commit(insertRow(sheetRef.current, at));
  const doDeleteRow = (at: number) => commit(deleteRow(sheetRef.current, at));
  const doInsertCol = (at: number) => commit(insertCol(sheetRef.current, at));
  const doDeleteCol = (at: number) => commit(deleteCol(sheetRef.current, at));

  // ── Sayfa sekmeleri ───────────────────────────────────────────────────────
  const addSheet = () => {
    const w = wbRef.current;
    const s: Sheet = { ...emptySheet(uniqueSheetName(w, `Sayfa${w.sheets.length + 1}`)), id: newSheetId() };
    commitWb({ engine: "wb", sheets: [...w.sheets, s], active: w.sheets.length });
    setSel({ r1: 0, c1: 0, r2: 0, c2: 0 });
  };
  const removeSheet = (index: number) => {
    const w = wbRef.current;
    if (w.sheets.length <= 1) return;               // son sayfa silinmez
    const name = w.sheets[index].name;
    if (!window.confirm(`"${name}" sayfası silinsin mi? İçindeki veriler gider.`)) return;
    const sheets = w.sheets.filter((_, i) => i !== index);
    commitWb({ engine: "wb", sheets, active: Math.max(0, Math.min(sheets.length - 1, index > 0 ? index - 1 : 0)) });
    setSel({ r1: 0, c1: 0, r2: 0, c2: 0 });
  };
  const renameSheet = (index: number, name: string) => {
    const w = wbRef.current;
    const clean = uniqueSheetName(w, name.trim() || w.sheets[index].name, index);
    commitWb({ ...w, sheets: w.sheets.map((s, i) => (i === index ? { ...s, name: clean } : s)) });
  };
  const selectSheet = (index: number) => {
    setWb((w) => ({ ...w, active: index }));
    setSel({ r1: 0, c1: 0, r2: 0, c2: 0 });
    setEditing(null);
  };

  // ── Sütun genişliği / satır yüksekliği sürükleme ──────────────────────────
  const resizeRef = useRef<{ kind: "col" | "row"; i: number; start: number; startSize: number } | null>(null);
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const st = resizeRef.current;
      if (!st) return;
      if (st.kind === "col") {
        const w = Math.max(48, Math.min(600, st.startSize + (e.clientX - st.start)));
        setWb((prev) => withSheet(prev, prev.active, { ...activeSheet(prev), colW: { ...(activeSheet(prev).colW ?? {}), [st.i]: w } }));
      } else {
        const h = Math.max(22, Math.min(300, st.startSize + (e.clientY - st.start)));
        setWb((prev) => withSheet(prev, prev.active, { ...activeSheet(prev), rowH: { ...(activeSheet(prev).rowH ?? {}), [st.i]: h } }));
      }
    }
    function onUp() { if (resizeRef.current) { resizeRef.current = null; onDirty?.(); } }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [onDirty]);

  // ── Yerleşim hesapları ────────────────────────────────────────────────────
  const rowTops = useMemo(() => {
    const tops: number[] = [];
    let y = 0;
    for (let r = 0; r < sheet.rows; r++) { tops.push(y); y += rowHeight(sheet, r); }
    return { tops, total: y };
  }, [sheet]);

  const firstRow = useMemo(() => {
    let lo = 0, hi = sheet.rows - 1, out = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (rowTops.tops[mid] <= scrollTop) { out = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return Math.max(0, out - OVERSCAN);
  }, [scrollTop, rowTops, sheet.rows]);

  const lastRow = useMemo(() => {
    let r = firstRow;
    while (r < sheet.rows - 1 && rowTops.tops[r] < scrollTop + viewH) r++;
    return Math.min(sheet.rows - 1, r + OVERSCAN);
  }, [firstRow, scrollTop, viewH, rowTops, sheet.rows]);

  const visibleRows: number[] = [];
  for (let r = firstRow; r <= lastRow; r++) visibleRows.push(r);

  const colLefts = useMemo(() => {
    const out: number[] = [];
    let x = 0;
    for (let c = 0; c < sheet.cols; c++) { out.push(x); x += colWidth(sheet, c); }
    return { lefts: out, total: x };
  }, [sheet]);

  // ── Durum çubuğu ──────────────────────────────────────────────────────────
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
    const f = (x: number) => x.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
    return `Toplam ${f(sum)}  ·  Ortalama ${f(sum / nums.length)}  ·  Sayı ${nums.length}`;
  }, [sel, valueAt]);

  const selN = norm(sel);
  const selLabel = selN.r1 === selN.r2 && selN.c1 === selN.c2
    ? toA1(selN.r1, selN.c1)
    : `${toA1(selN.r1, selN.c1)}:${toA1(selN.r2, selN.c2)}`;
  const activeCell = getCell(sheet, active.r, active.c);
  const formulaBarValue = editing ? editing.draft : (activeCell?.f ?? activeCell?.v ?? "");

  const fillTarget = fillTo ? { r: Math.max(fillTo.r, selN.r2), c: Math.max(fillTo.c, selN.c2) } : null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      {/* ── Araç çubuğu ──────────────────────────────────────────────────── */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-hairline px-2 py-1.5">
          <TBtn onClick={undo} title="Geri al (⌘Z)"><Undo2 size={15} /></TBtn>
          <TBtn onClick={redo} title="İleri al (⇧⌘Z)"><Redo2 size={15} /></TBtn>
          <Sep />
          <TBtn onClick={() => applyStyle({ b: !activeStyle.b })} active={!!activeStyle.b} title="Kalın (⌘B)"><Bold size={15} /></TBtn>
          <TBtn onClick={() => applyStyle({ i: !activeStyle.i })} active={!!activeStyle.i} title="İtalik (⌘I)"><Italic size={15} /></TBtn>
          <TBtn onClick={() => applyStyle({ u: !activeStyle.u })} active={!!activeStyle.u} title="Altı çizili (⌘U)"><Underline size={15} /></TBtn>

          {/* Yazı rengi */}
          <div className="relative">
            <TBtn onClick={() => setPopover(popover === "text" ? null : "text")} active={popover === "text"} title="Yazı rengi" stop>
              <Baseline size={15} />
              <span className="ml-0.5 h-1 w-3 rounded-sm" style={{ background: activeStyle.fg || "currentColor" }} />
            </TBtn>
            {popover === "text" && <Palette colors={TEXT_COLORS} onPick={(c) => applyStyle({ fg: c })} />}
          </div>

          {/* Dolgu rengi */}
          <div className="relative">
            <TBtn onClick={() => setPopover(popover === "fill" ? null : "fill")} active={popover === "fill"} title="Dolgu rengi" stop>
              <PaintBucket size={15} />
              <span className="ml-0.5 h-1 w-3 rounded-sm ring-1 ring-line" style={{ background: activeStyle.bg || "transparent" }} />
            </TBtn>
            {popover === "fill" && <Palette colors={FILL_COLORS} onPick={(c) => applyStyle({ bg: c })} />}
          </div>

          {/* Kenarlık */}
          <div className="relative">
            <TBtn onClick={() => setPopover(popover === "border" ? null : "border")} active={popover === "border"} title="Kenarlık" stop>
              <Square size={15} />
            </TBtn>
            {popover === "border" && (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                className="anim-fade-down absolute left-0 top-full z-50 mt-1 w-44 rounded-lg border border-line bg-surface p-1 shadow-pop"
              >
                {[
                  { v: "tlbr", label: "Tüm kenarlar" },
                  { v: "t", label: "Üst" },
                  { v: "b", label: "Alt" },
                  { v: "l", label: "Sol" },
                  { v: "r", label: "Sağ" },
                  { v: "", label: "Kenarlığı kaldır" },
                ].map((o) => (
                  <button
                    key={o.label}
                    onClick={() => applyStyle({ bd: o.v })}
                    className="block w-full rounded-md px-2 py-1.5 text-left text-[13px] text-muted transition-colors hover:bg-surface-muted hover:text-ink"
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Sep />
          <TBtn onClick={() => applyStyle({ a: "l" })} active={activeStyle.a === "l"} title="Sola yasla"><AlignLeft size={15} /></TBtn>
          <TBtn onClick={() => applyStyle({ a: "c" })} active={activeStyle.a === "c"} title="Ortala"><AlignCenter size={15} /></TBtn>
          <TBtn onClick={() => applyStyle({ a: "r" })} active={activeStyle.a === "r"} title="Sağa yasla"><AlignRight size={15} /></TBtn>
          <TBtn onClick={() => applyStyle({ w: !activeStyle.w })} active={!!activeStyle.w} title="Metni kaydır"><WrapText size={15} /></TBtn>
          <TBtn onClick={toggleMerge} active={!!mergeAt(sheet, active.r, active.c)} title="Hücreleri birleştir / çöz"><Combine size={15} /></TBtn>

          <Sep />
          <select
            value={activeStyle.n ?? "auto"}
            onChange={(e) => applyStyle({ n: e.target.value as NumberFormat })}
            className="h-7 rounded-md border border-line bg-surface px-1.5 text-[12.5px] text-muted transition-colors hover:border-line-strong focus:outline-none focus:ring-2 focus:ring-brand-ring/40"
            aria-label="Sayı biçimi"
          >
            {NUMBER_FORMAT_LABELS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <TBtn onClick={() => stepDecimals(-1)} title="Ondalık azalt"><span className="text-[12px] font-semibold tabular-nums">.0−</span></TBtn>
          <TBtn onClick={() => stepDecimals(1)} title="Ondalık artır"><span className="text-[12px] font-semibold tabular-nums">.00+</span></TBtn>
          <TBtn onClick={autoSum} title="Otomatik toplam"><Sigma size={15} /></TBtn>
        </div>
      )}

      {/* ── Formül çubuğu ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-0 border-b border-hairline">
        <span className="grid h-8 shrink-0 place-items-center border-r border-hairline px-2 text-[12.5px] font-semibold tabular-nums text-muted" style={{ width: GUTTER_W + 24 }}>
          {selLabel}
        </span>
        <span className="grid h-8 w-7 shrink-0 place-items-center border-r border-hairline font-serif text-[13px] italic text-subtle">fx</span>
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
        <div style={{ width: colLefts.total + GUTTER_W, height: rowTops.total + HEAD_H, position: "relative" }}>
          {/* Sütun başlıkları */}
          <div className="sticky top-0 z-20 flex" style={{ height: HEAD_H }}>
            <div className="sticky left-0 z-30 shrink-0 border-b border-r border-line-strong bg-surface-muted" style={{ width: GUTTER_W, height: HEAD_H }} />
            {colLefts.lefts.map((_l, c) => (
              <div
                key={c}
                onMouseDown={() => setSel({ r1: 0, c1: c, r2: sheet.rows - 1, c2: c })}
                onContextMenu={(e) => { e.preventDefault(); setSel({ r1: 0, c1: c, r2: sheet.rows - 1, c2: c }); setMenu({ x: e.clientX, y: e.clientY, kind: "col", r: 0, c }); }}
                className={cn(
                  "relative shrink-0 cursor-pointer select-none border-b border-r border-line-strong text-center text-[11.5px] font-semibold text-muted",
                  c >= selN.c1 && c <= selN.c2 ? "bg-brand-soft text-brand-strong" : "bg-surface-muted",
                )}
                style={{ width: colWidth(sheet, c), height: HEAD_H, lineHeight: `${HEAD_H}px` }}
                title={`${colName(c)} sütunu — sağ tık: ekle / sil`}
              >
                {colName(c)}
                <span
                  onMouseDown={(e) => { e.stopPropagation(); resizeRef.current = { kind: "col", i: c, start: e.clientX, startSize: colWidth(sheetRef.current, c) }; }}
                  className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-brand/40"
                />
              </div>
            ))}
          </div>

          {/* Satırlar */}
          {visibleRows.map((r) => {
            const rh = rowHeight(sheet, r);
            return (
              <div key={r} className="absolute flex" style={{ top: rowTops.tops[r] + HEAD_H, height: rh, left: 0 }}>
                <div
                  onMouseDown={() => setSel({ r1: r, c1: 0, r2: r, c2: sheet.cols - 1 })}
                  onContextMenu={(e) => { e.preventDefault(); setSel({ r1: r, c1: 0, r2: r, c2: sheet.cols - 1 }); setMenu({ x: e.clientX, y: e.clientY, kind: "row", r, c: 0 }); }}
                  className={cn(
                    "sticky left-0 z-10 shrink-0 cursor-pointer select-none border-b border-r border-line text-center text-[11.5px] tabular-nums",
                    r >= selN.r1 && r <= selN.r2 ? "bg-brand-soft font-semibold text-brand-strong" : "bg-surface-muted text-subtle",
                  )}
                  style={{ width: GUTTER_W, height: rh, lineHeight: `${rh - 1}px` }}
                  title="Sağ tık: satır ekle / sil"
                >
                  {r + 1}
                  <span
                    onMouseDown={(e) => { e.stopPropagation(); resizeRef.current = { kind: "row", i: r, start: e.clientY, startSize: rowHeight(sheetRef.current, r) }; }}
                    className="absolute bottom-0 left-0 h-1.5 w-full cursor-row-resize hover:bg-brand/40"
                  />
                </div>

                {colLefts.lefts.map((_left, c) => {
                  const mg = mergeAt(sheet, r, c);
                  if (mg && !mg.anchor) return null;         // birleşmenin gövdesi çizilmez

                  const w = mg
                    ? Array.from({ length: mg.rect.c2 - mg.rect.c1 + 1 }, (_, i) => colWidth(sheet, mg.rect.c1 + i)).reduce((a, b) => a + b, 0)
                    : colWidth(sheet, c);
                  const h = mg
                    ? Array.from({ length: mg.rect.r2 - mg.rect.r1 + 1 }, (_, i) => rowHeight(sheet, mg.rect.r1 + i)).reduce((a, b) => a + b, 0)
                    : rh;

                  const isEditing = editing?.r === r && editing?.c === c;
                  const isActive = active.r === r && active.c === c;
                  const selected = inSel(sel, r, c);
                  const inFill =
                    fillTarget !== null &&
                    r >= selN.r1 && c >= selN.c1 &&
                    r <= fillTarget.r && c <= fillTarget.c &&
                    (r > selN.r2 || c > selN.c2);
                  const cell = getCell(sheet, r, c);
                  const val = valueAt(r, c);
                  const st = cell?.s;
                  const isFillCorner = r === selN.r2 && c === selN.c2;

                  if (isEditing) {
                    return (
                      <div key={c} className="relative shrink-0" style={{ width: w, height: h }}>
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
                        if (e.button === 2) return;
                        if (e.detail === 2) { startEdit(r, c); return; }
                        setDragging(true);
                        setSel(e.shiftKey ? { r1: active.r, c1: active.c, r2: r, c2: c } : { r1: r, c1: c, r2: r, c2: c });
                        scrollRef.current?.focus();
                      }}
                      onMouseEnter={() => {
                        if (dragging) setSel((s) => ({ ...s, r2: r, c2: c }));
                        else if (fillRef.current) {
                          fillRef.current = { ...fillRef.current, to: { r, c } };
                          setFillTo({ r, c });
                        }
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (!inSel(sel, r, c)) setSel({ r1: r, c1: c, r2: r, c2: c });
                        setMenu({ x: e.clientX, y: e.clientY, kind: "cell", r, c });
                      }}
                      className={cn(
                        "relative shrink-0 select-none overflow-hidden border-b border-r border-hairline px-1.5 text-[13px]",
                        st?.w ? "whitespace-pre-wrap break-words leading-[1.35]" : "whitespace-nowrap",
                        selected ? "bg-brand-soft/50" : "bg-surface",
                        inFill && "bg-brand-soft/30",
                        isActive && "outline outline-2 -outline-offset-2 outline-brand",
                        isError(val) && "text-danger",
                        st?.b && "font-semibold",
                        st?.i && "italic",
                        st?.u && "underline",
                      )}
                      style={{
                        width: w, height: h,
                        textAlign: alignOf(val, st),
                        lineHeight: st?.w ? undefined : `${h - 1}px`,
                        background: st?.bg || undefined,
                        color: st?.fg || undefined,
                        borderTop: st?.bd?.includes("t") ? "1.5px solid #6b7280" : undefined,
                        borderBottom: st?.bd?.includes("b") ? "1.5px solid #6b7280" : undefined,
                        borderLeft: st?.bd?.includes("l") ? "1.5px solid #6b7280" : undefined,
                        borderRight: st?.bd?.includes("r") ? "1.5px solid #6b7280" : undefined,
                      }}
                      title={cell?.f ? `${cell.f} → ${formatValue(val, st)}` : undefined}
                    >
                      {formatValue(val, st)}
                      {/* Doldurma tutamağı — seçimin sağ alt köşesi */}
                      {isFillCorner && !readOnly && (
                        <span
                          onMouseDown={(e) => {
                            e.stopPropagation(); e.preventDefault();
                            fillRef.current = { from: sel, to: { r, c } };
                            setFillTo({ r, c });
                          }}
                          title="Aşağı ya da sağa çekerek doldur"
                          className="absolute -bottom-[3px] -right-[3px] z-30 h-2 w-2 cursor-crosshair rounded-[1px] bg-brand ring-1 ring-surface"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Sayfa sekmeleri ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 overflow-x-auto border-t border-line bg-surface-muted px-2 py-1">
        {!readOnly && (
          <button
            onClick={addSheet}
            title="Sayfa ekle"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <Plus size={15} />
          </button>
        )}
        {wb.sheets.map((s, i) => {
          const on = i === wb.active;
          if (renaming?.index === i) {
            return (
              <input
                key={s.id}
                autoFocus
                value={renaming.draft}
                onChange={(e) => setRenaming({ index: i, draft: e.target.value })}
                onBlur={() => { renameSheet(i, renaming.draft); setRenaming(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { renameSheet(i, renaming.draft); setRenaming(null); }
                  if (e.key === "Escape") setRenaming(null);
                }}
                className="h-7 w-28 shrink-0 rounded-md border border-brand bg-surface px-2 text-[12.5px] text-ink outline-none"
              />
            );
          }
          return (
            <span
              key={s.id}
              className={cn(
                "group inline-flex h-7 shrink-0 items-center gap-1 rounded-md pl-2.5 pr-1 text-[12.5px] transition-colors",
                on ? "bg-surface font-semibold text-ink shadow-xs ring-1 ring-line" : "text-muted hover:bg-surface/70 hover:text-ink",
              )}
            >
              <button onClick={() => selectSheet(i)} onDoubleClick={() => !readOnly && setRenaming({ index: i, draft: s.name })} className="max-w-40 truncate">
                {s.name}
              </button>
              {!readOnly && on && (
                <>
                  <button onClick={() => setRenaming({ index: i, draft: s.name })} title="Yeniden adlandır" className="grid h-5 w-5 place-items-center rounded text-subtle transition-colors hover:bg-surface-muted hover:text-ink">
                    <Pencil size={11} />
                  </button>
                  {wb.sheets.length > 1 && (
                    <button onClick={() => removeSheet(i)} title="Sayfayı sil" className="grid h-5 w-5 place-items-center rounded text-subtle transition-colors hover:bg-[#fbe6e2] hover:text-danger">
                      <X size={12} />
                    </button>
                  )}
                </>
              )}
            </span>
          );
        })}
      </div>

      {/* ── Durum çubuğu ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 border-t border-hairline px-3 py-1.5 text-[12px] text-subtle">
        <span className="tabular-nums">{sheet.rows} satır · {sheet.cols} sütun</span>
        {summary && <span className="truncate font-medium tabular-nums text-muted">{summary}</span>}
      </div>

      {/* ── Sağ tık menüsü ───────────────────────────────────────────────── */}
      {menu && !readOnly && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="anim-fade fixed z-[70] w-56 rounded-lg border border-line bg-surface py-1 shadow-drawer"
          style={{ left: Math.min(menu.x, (typeof window !== "undefined" ? window.innerWidth : 9999) - 240), top: menu.y }}
        >
          <MenuItem onClick={() => { navigator.clipboard?.writeText(selectionTsv()); setMenu(null); }}>Kopyala</MenuItem>
          <MenuItem onClick={() => { navigator.clipboard?.writeText(selectionTsv()); clearRange(norm(sel), true); setMenu(null); }}>Kes</MenuItem>
          <MenuItem onClick={async () => { const t = await navigator.clipboard?.readText?.(); if (t) pasteText(t); setMenu(null); }}>Yapıştır</MenuItem>
          <MenuSep />
          <MenuItem onClick={() => { doInsertRow(selN.r1); setMenu(null); }}>Üste satır ekle</MenuItem>
          <MenuItem onClick={() => { doInsertRow(selN.r2 + 1); setMenu(null); }}>Alta satır ekle</MenuItem>
          <MenuItem onClick={() => { doDeleteRow(selN.r1); setMenu(null); }} danger>Satırı sil</MenuItem>
          <MenuSep />
          <MenuItem onClick={() => { doInsertCol(selN.c1); setMenu(null); }}>Sola sütun ekle</MenuItem>
          <MenuItem onClick={() => { doInsertCol(selN.c2 + 1); setMenu(null); }}>Sağa sütun ekle</MenuItem>
          <MenuItem onClick={() => { doDeleteCol(selN.c1); setMenu(null); }} danger>Sütunu sil</MenuItem>
          <MenuSep />
          <MenuItem onClick={() => { toggleMerge(); setMenu(null); }}>Hücreleri birleştir / çöz</MenuItem>
          <MenuItem onClick={() => { clearRange(norm(sel), true); setMenu(null); }} danger>İçeriği ve biçimi temizle</MenuItem>
        </div>
      )}
    </div>
  );
}

function Palette({ colors, onPick }: { colors: string[]; onPick: (_c: string) => void }) {
  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      className="anim-fade-down absolute left-0 top-full z-50 mt-1 grid w-[184px] grid-cols-5 gap-1 rounded-lg border border-line bg-surface p-2 shadow-pop"
    >
      {colors.map((c) => (
        <button
          key={c || "none"}
          onClick={() => onPick(c)}
          title={c || "Yok"}
          className="grid h-6 w-6 place-items-center rounded ring-1 ring-line transition-transform hover:scale-110"
          style={{ background: c || "transparent" }}
        >
          {!c && <span className="text-[10px] text-subtle">✕</span>}
        </button>
      ))}
    </div>
  );
}

function MenuItem({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "block w-full px-3 py-1.5 text-left text-[13px] transition-colors",
        danger ? "text-danger hover:bg-[#fbe6e2]" : "text-muted hover:bg-surface-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

const MenuSep = () => <span className="my-1 block h-px bg-hairline" />;

function TBtn({
  onClick, title, active, stop, children,
}: { onClick: () => void; title: string; active?: boolean; stop?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={stop ? (e) => e.stopPropagation() : undefined}
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 items-center rounded-md px-1.5 transition-colors duration-150 active:scale-[0.97]",
        active ? "bg-brand-soft text-brand-strong" : "text-muted hover:bg-surface-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-0.5 h-5 w-px shrink-0 bg-line" />;
