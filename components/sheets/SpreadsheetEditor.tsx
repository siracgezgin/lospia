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
  PaintBucket, Baseline, Square, Combine, X, Pencil, ImagePlus, ImageOff,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useConfirm } from "@/components/ui/useConfirm";
import { SelectInput } from "@/components/ui/Field";
import { ImagePicker } from "./ImagePicker";
import { signSheetImages } from "@/lib/actions/sheet-images";
import {
  GUTTER_W, HEAD_H, ROW_H, MAX_COLS, MAX_ROWS,
  activeSheet, colName, colWidth, deleteCol, deleteRow, emptySheet, emptyWorkbook,
  getCell, insertCol, insertRow, key, mergeAt, mergeKey, mergesOf, newSheetId,
  rowHeight, setCell, toA1, uniqueSheetName, withCells, withSheet,
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
type EditState = { r: number; c: number; draft: string };

/** Pano izni reddedildiğinde gösterilir — sessizce hiçbir şey yapmasın. */
const CLIPBOARD_WRITE_HINT = "Tarayıcı panoya yazamadı — ⌘C / Ctrl+C (kesmek için ⌘X / Ctrl+X) kullanın.";
const norm = (s: Sel) => ({
  r1: Math.min(s.r1, s.r2), c1: Math.min(s.c1, s.c2),
  r2: Math.max(s.r1, s.r2), c2: Math.max(s.c1, s.c2),
});
const inSel = (s: Sel, r: number, c: number) => {
  const n = norm(s);
  return r >= n.r1 && r <= n.r2 && c >= n.c1 && c <= n.c2;
};

const OVERSCAN = 6;

/** Bundan geniş bir seçimde (⌘A gibi) biçim yalnız DOLU hücrelere yazılır. */
const WIDE_SELECTION = 20_000;

/** Dolgu ve yazı paleti — yazı editörüyle (DocEditor.DOC_COLORS) ve kişi
 *  paletiyle AYNI aile. Önce genel bir Tailwind paletiydi; tablodaki kırmızı
 *  ile yazıdaki kırmızı birbirini tutmuyordu. İlk göz "yok" demektir. */
const FILL_COLORS = [
  "", "#fbe6e2", "#fdebd9", "#f6ecd4", "#dcf0e6", "#dbe7f8", "#ece4fb", "#fbe2f0", "#eef0f2", "#111827",
];
const TEXT_COLORS = [
  "", "#d23320", "#df7314", "#c98e20", "#1f6e4d", "#2563c9", "#7c3aed", "#cc2e93", "#5b6e8a", "#ffffff",
];

export function SpreadsheetEditor({ initialSnapshot, readOnly = false, onReady, onDirty }: Props) {
  const { ask, dialog } = useConfirm();
  /* GÖRSEL HÜCRESİ. Hücre yalnız Drive kaydının kimliğini tutar; görüntülenebilir
     adres imzalıdır ve saatliktir, o yüzden burada AYRI tutulur — anlık
     görüntüye yazılsaydı yarın kırık resim olurdu (lib/actions/sheet-images). */
  const [pickerOpen, setPickerOpen] = useState(false);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [wb, setWb] = useState<WorkbookSnapshot>(() => initialSnapshot ?? emptyWorkbook());
  const [sel, setSel] = useState<Sel>({ r1: 0, c1: 0, r2: 0, c2: 0 });
  const [editing, setEditingState] = useState<EditState | null>(null);
  /* Düzenleme durumu ref'te DE tutulur: stopEdit yan etkiyi (yazma, geri-al
     yığını, kayıt tetikleme) setState GÜNCELLEYİCİSİNİN İÇİNDE çalıştırıyordu.
     React güncelleyiciyi iki kez oynatabilir (StrictMode geliştirmede her
     zaman oynatır) → her hücre düzenlemesi geri-al yığınına İKİ adım bırakıp
     kaydı iki kez tetikliyordu. Yan etki artık güncelleyicinin dışında. */
  const editingRef = useRef<EditState | null>(null);
  const setEditing = useCallback((next: EditState | null) => {
    editingRef.current = next;
    setEditingState(next);
  }, []);
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
  /** Kısa bilgi (durum çubuğunda) — pano izni reddedilince sessiz kalmasın. */
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const undoStack = useRef<WorkbookSnapshot[]>([]);
  const redoStack = useRef<WorkbookSnapshot[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLInputElement>(null);
  /* Formül çubuğu ayrı bir ref tutar: aşağıdaki odak etkisi, odak ZATEN fx'te
     iken hücre kutusuna atlamasın diye buna bakar. Yoksa fx'e yazılan her
     karakter setEditing ile etkiyi tetikliyor ve imleç hücreye kaçıyordu. */
  const formulaRef = useRef<HTMLInputElement>(null);
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

  /* Hesaplama render sırasında çalışıyor: burada atılan bir istisna (çok derin
     formül zinciri yığını taşırıyordu) tüm ekranı beyaza çeviriyor ve
     kaydedilmemiş iş gidiyordu. Hata sınırı yok, o yüzden kapı burada. */
  const evaluated = useMemo(() => {
    try {
      return { values: evaluateSheet(wb, sheet), failed: false };
    } catch {
      return { values: new Map<string, Scalar>(), failed: true };
    }
  }, [wb, sheet]);
  const values = evaluated.values;
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
  }, [readOnly, setEditing]);

  useEffect(() => {
    if (!editing) return;
    if (document.activeElement === formulaRef.current) return;
    editRef.current?.focus();
  }, [editing]);

  const stopEdit = useCallback((save: boolean, move?: "down" | "right") => {
    const e = editingRef.current;
    if (!e) return;
    setEditing(null);
    /* DEĞİŞMEDİYSE yazma. fx çubuğuna tıklayıp başka yere geçmek de burayı
       çağırıyor; her seferinde geri-al yığınına boş bir adım eklemesin ve
       belgeyi kirli işaretleyip gereksiz kayıt tetiklemesin. */
    const cur = getCell(sheetRef.current, e.r, e.c);
    if (save && e.draft !== (cur?.f ?? cur?.v ?? "")) applyEdit(e.r, e.c, e.draft);
    if (move === "down") moveTo(e.r + 1, e.c);
    if (move === "right") moveTo(e.r, e.c + 1);
  }, [applyEdit, moveTo, setEditing]);

  /* Seçim DEĞİL, dolu hücreler taranır: ⌘A 5.000×100 = 500.000 hücre seçer ve
     her setCell haritanın tamamını kopyaladığı için silme O(n²) oluyordu —
     sekme dakikalarca donuyordu. Boş hücrede silinecek bir şey zaten yok. */
  const clearRange = useCallback((n: Sel, alsoStyle = false) => {
    const g0 = sheetRef.current;
    commit(withCells(g0, (put) => {
      for (const k of Object.keys(g0.cells)) {
        const sep = k.indexOf(":");
        const r = Number(k.slice(0, sep));
        const c = Number(k.slice(sep + 1));
        if (r < n.r1 || r > n.r2 || c < n.c1 || c > n.c2) continue;
        const prev = g0.cells[k];
        put(r, c, !alsoStyle && prev?.s ? { s: prev.s } : undefined);
      }
    }));
  }, [commit]);

  // ── Biçim ─────────────────────────────────────────────────────────────────
  /* Etkin sayfadaki görsellerin adresleri. Kimlik kümesi değişmedikçe yeni
     istek atılmaz (yoksa her tuş vuruşunda imza üretilirdi); anahtar sıralı
     kimlik dizisidir. */
  const imageIdKey = useMemo(() => {
    const ids = new Set<string>();
    for (const cell of Object.values(sheet.cells)) if (cell.img?.id) ids.add(cell.img.id);
    return [...ids].sort().join(",");
  }, [sheet.cells]);

  useEffect(() => {
    /* Hiç görsel yoksa DURUM SIFIRLANMAZ: efekt içinde senkron setState
       fazladan bir çizim turu doğurur (ve lint kuralı reddeder). Harita
       kimlikle anahtarlı olduğu için eski adreslerin durması zararsız —
       kullanılmayan kimse okunmuyor. */
    if (!imageIdKey) return;
    let cancelled = false;
    (async () => {
      const res = await signSheetImages(imageIdKey.split(","));
      if (cancelled || "error" in res) return;
      setImageUrls(res.urls);
    })();
    return () => { cancelled = true; };
  }, [imageIdKey]);

  /* Seçili hücreye Drive'dan seçilen görseli koyar. Metni SİLMEZ: kullanıcı
     hem ürün adını hem fotoğrafını aynı hücrede tutmak isteyebilir; görsel
     varsa çizimde o öne geçer. */
  /* Elle eklenen görselin VARSAYILAN boyu. Tek hücre 128×30 piksel; oraya
     sıkışan fotoğraf "küçücük" görünüyordu (Sıraç, 2026-09-06). Excel'den
     gelen görseller kendi yayılmasını taşıyor, elle eklenende öyle bir bilgi
     yok — bu yüzden görülebilir bir başlangıç veriyoruz. Kullanıcı sağ tık
     menüsünden büyütüp küçültebilir. */
  const DEFAULT_IMG_CS = 3;
  const DEFAULT_IMG_RS = 4;

  const putImage = useCallback((image: { id: string; name: string }) => {
    if (readOnly) return;
    const g0 = sheetRef.current;
    const prev = getCell(g0, active.r, active.c);
    commit(setCell(g0, active.r, active.c, {
      ...(prev ?? {}),
      img: { id: image.id, name: image.name, cs: DEFAULT_IMG_CS, rs: DEFAULT_IMG_RS },
    }));
  }, [readOnly, active.r, active.c, commit]);

  /** Seçili hücredeki görseli büyütür/küçültür (en az 1 hücre). */
  const resizeImage = useCallback((delta: number) => {
    if (readOnly) return;
    const g0 = sheetRef.current;
    const prev = getCell(g0, active.r, active.c);
    if (!prev?.img) return;
    const cs = Math.max(1, Math.min(20, (prev.img.cs ?? 1) + delta));
    const rs = Math.max(1, Math.min(40, (prev.img.rs ?? 1) + delta));
    commit(setCell(g0, active.r, active.c, { ...prev, img: { ...prev.img, cs, rs } }));
  }, [readOnly, active.r, active.c, commit]);

  /** Seçimdeki görselleri kaldırır (metin ve biçim kalır). */
  const clearImages = useCallback(() => {
    if (readOnly) return;
    const n = norm(sel);
    const g0 = sheetRef.current;
    commit(withCells(g0, (put) => {
      for (let r = n.r1; r <= n.r2; r++) {
        for (let c = n.c1; c <= n.c2; c++) {
          const prev = getCell(g0, r, c);
          if (!prev?.img) continue;
          const next = { ...prev };
          delete next.img;
          put(r, c, next);
        }
      }
    }));
  }, [readOnly, sel, commit]);

  const applyStyle = useCallback((patch: Partial<CellStyle>) => {
    if (readOnly) return;
    const n = norm(sel);
    const g0 = sheetRef.current;
    const styled = (prev: Cell | undefined): Cell => {
      const s: CellStyle = { ...(prev?.s ?? {}), ...patch };
      for (const k of Object.keys(s) as (keyof CellStyle)[]) {
        if (s[k] === undefined || s[k] === false || s[k] === "") delete s[k];
      }
      return { ...(prev ?? {}), s };
    };
    const area = (n.r2 - n.r1 + 1) * (n.c2 - n.c1 + 1);
    commit(withCells(g0, (put) => {
      if (area > WIDE_SELECTION) {
        /* ⌘A + ⌘B seçilen 500.000 hücrenin HEPSİNE stil nesnesi yazıyordu:
           seyrek harita yarım milyon kayda şişiyor, kaydedilen JSON onlarca
           MB oluyordu. Excel de görünmeyen boş hücreye biçim taşımaz. */
        for (const k of Object.keys(g0.cells)) {
          const sep = k.indexOf(":");
          const r = Number(k.slice(0, sep));
          const c = Number(k.slice(sep + 1));
          if (r < n.r1 || r > n.r2 || c < n.c1 || c > n.c2) continue;
          put(r, c, styled(g0.cells[k]));
        }
        return;
      }
      for (let r = n.r1; r <= n.r2; r++)
        for (let c = n.c1; c <= n.c2; c++) put(r, c, styled(getCell(g0, r, c)));
    }));
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

    /* ⌘/Ctrl + ok = blok atlaması (Excel'deki gibi). Duyurulmuştu ama kodda
       yoktu: ok tuşları `meta` durumuna hiç bakmıyor, Ctrl+Aşağı tek satır
       iniyordu. Kural: bir sonraki hücre DOLUYSA bloğun son dolu hücresine,
       BOŞSA boşluğu atlayıp ilk dolu hücreye; hiç yoksa sayfanın ucuna. */
    if (meta && (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      const g = sheetRef.current;
      const dr = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
      const dc = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      const filled = (r: number, c: number) => {
        const cell = getCell(g, r, c);
        return !!cell && ((cell.f ?? "") !== "" || (cell.v ?? "") !== "");
      };
      const inGrid = (r: number, c: number) => r >= 0 && r < g.rows && c >= 0 && c < g.cols;
      let tr = er;
      let tc = ec;
      if (inGrid(er + dr, ec + dc) && filled(er + dr, ec + dc)) {
        while (inGrid(tr + dr, tc + dc) && filled(tr + dr, tc + dc)) { tr += dr; tc += dc; }
      } else {
        let rr = er + dr;
        let cc = ec + dc;
        let found = false;
        while (inGrid(rr, cc)) {
          if (filled(rr, cc)) { found = true; break; }
          rr += dr; cc += dc;
        }
        if (found) { tr = rr; tc = cc; }
        else {
          tr = dr > 0 ? g.rows - 1 : dr < 0 ? 0 : tr;
          tc = dc > 0 ? g.cols - 1 : dc < 0 ? 0 : tc;
        }
      }
      moveTo(tr, tc, e.shiftKey);
      return;
    }

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

  /**
   * Seçimi panoya yazar; başarılıysa true.
   *
   * SAHİPSİZ PROMISE YOKTUR: writeText belge odakta değilken, izin
   * verilmediğinde ya da güvensiz bağlamda REDDEDİLİR. Eskiden yakalanmıyordu;
   * "Kes" panoya yazamadığı hâlde hücreleri siliyordu — pano boş, hücreler
   * boş, veri gitmiş oluyordu.
   */
  const writeClipboard = useCallback(async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(selectionTsv());
      return true;
    } catch {
      return false;
    }
  }, [selectionTsv]);

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
    // Tek harita kopyası: hücre başına writeCell çağırmak 5.000 hücrelik bir
    // yapıştırmayı O(n²) yapıyordu.
    const base = g;
    g = withCells(base, (put) => {
      rows.forEach((line, dr) => {
        line.split("\t").forEach((cellText, dc) => {
          const r = active.r + dr;
          const c = active.c + dc;
          if (r >= base.rows || c >= base.cols) return;   // ızgara sınırını aşma
          const prev = getCell(base, r, c);
          const isFormula = cellText.trim().startsWith("=");
          put(r, c, {
            ...(prev?.s ? { s: prev.s } : {}),
            ...(isFormula ? { f: cellText } : cellText !== "" ? { v: cellText } : {}),
          });
        });
      });
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

  /* Doldurma sürüklemesi pencere seviyesinde dinlenir — fare ızgaranın dışına
     çıksa bile bırakma yakalansın. POINTER olayları kullanılır: yalnız fare
     olaylarıyla tutamak TELEFONDA hiç çalışmıyordu (parmak sürüklemesi mouse
     değil kaydırma üretir). Parmakta hedef hücre `elementFromPoint` ile
     bulunur; dokunmada pointermove olayları tutamağa yakalandığı için
     hücrelerin onMouseEnter'ı hiç tetiklenmez. */
  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!fillRef.current) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cellEl = el?.closest?.("[data-cell-r]") as HTMLElement | null;
      if (!cellEl) return;
      const r = Number(cellEl.dataset.cellR);
      const c = Number(cellEl.dataset.cellC);
      if (!Number.isFinite(r) || !Number.isFinite(c)) return;
      fillRef.current = { ...fillRef.current, to: { r, c } };
      setFillTo({ r, c });
    }
    function onUp() {
      const st = fillRef.current;
      fillRef.current = null;
      if (!st) return;
      setFillTo(null);
      const n = norm(st.from);
      const to = { r: Math.max(st.to.r, n.r2), c: Math.max(st.to.c, n.c2) };
      if (to.r > n.r2 || to.c > n.c2) doFill(st.from, to);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [doFill]);

  // ── Satır / sütun ─────────────────────────────────────────────────────────
  const doInsertRow = (at: number) => commit(insertRow(sheetRef.current, at));
  const doDeleteRow = (at: number) => commit(deleteRow(sheetRef.current, at));
  const doInsertCol = (at: number) => commit(insertCol(sheetRef.current, at));
  const doDeleteCol = (at: number) => commit(deleteCol(sheetRef.current, at));

  // ── Sayfa sekmeleri ───────────────────────────────────────────────────────
  const addSheet = () => {
    const w = wbRef.current;
    // Kayıtlı kitapta eski kimlikler korunuyor; çakışma olmadığını burada da
    // güvenceye al (aynı kimlik = çift React anahtarı + karışan formül önbelleği).
    const used = new Set(w.sheets.map((x) => x.id));
    let id = newSheetId();
    while (used.has(id)) id = newSheetId();
    const s: Sheet = { ...emptySheet(uniqueSheetName(w, `Sayfa${w.sheets.length + 1}`)), id };
    commitWb({ engine: "wb", sheets: [...w.sheets, s], active: w.sheets.length });
    setSel({ r1: 0, c1: 0, r2: 0, c2: 0 });
  };
  const removeSheet = async (index: number) => {
    const w = wbRef.current;
    if (w.sheets.length <= 1) return;               // son sayfa silinmez
    const name = w.sheets[index].name;
    if (!(await ask({
      title: "Sayfa silinsin mi?",
      message: `"${name}" sayfası ve İÇİNDEKİ TÜM VERİLER kalıcı olarak silinir.`,
    }))) return;
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
    if (index === wbRef.current.active) return;
    setWb((w) => ({ ...w, active: index }));
    setSel({ r1: 0, c1: 0, r2: 0, c2: 0 });
    setEditing(null);
    /* Etkin sayfa KAYDEDİLEN anlık görüntünün parçası. onDirty çağrılmazsa
       Sayfa2'ye geçip çıkan kullanıcı, tabloyu bir dahaki açışında yine
       Sayfa1'de buluyordu. (Geri-al yığınını kirletmemek için commitWb değil.) */
    if (!readOnly) onDirty?.();
  };

  // ── Sütun genişliği / satır yüksekliği sürükleme ──────────────────────────
  const resizeRef = useRef<{ kind: "col" | "row"; i: number; start: number; startSize: number } | null>(null);
  useEffect(() => {
    // POINTER: boyutlandırma çubukları da telefonda çalışsın (bkz. doldurma).
    function onMove(e: PointerEvent) {
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
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card">
      {/* ── Araç çubuğu ──────────────────────────────────────────────────── */}
      {!readOnly && (
        <div role="toolbar" aria-label="Biçim" className="flex flex-wrap items-center gap-0.5 border-b border-hairline px-2 py-1.5">
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
                role="menu"
                aria-label="Kenarlık"
                className="anim-fade-down absolute left-0 top-full z-50 mt-1 w-44 rounded-card border border-line bg-surface p-1 shadow-pop"
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
                    type="button"
                    role="menuitem"
                    onClick={() => applyStyle({ bd: o.v })}
                    className="block w-full rounded-control px-2 py-1.5 text-left text-[13.5px] text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
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
          {/* GÖRSEL: hücreye dosya YÜKLENMEZ, Drive'da duran bir görsel SEÇİLİR
              — aynı fotoğraf her yerde tek kopya (Sıraç, 2026-09-06). */}
          <TBtn onClick={() => setPickerOpen(true)} title="Görsel ekle (Drive'dan seç)"><ImagePlus size={15} /></TBtn>
          {getCell(sheet, active.r, active.c)?.img && (
            <TBtn onClick={clearImages} title="Görseli kaldır"><ImageOff size={15} /></TBtn>
          )}

          <Sep />
          {/* Ortak SelectInput — araç çubuğu boyuna (h-8) indirilmiş. */}
          <SelectInput
            value={activeStyle.n ?? "auto"}
            onChange={(e) => applyStyle({ n: e.target.value as NumberFormat })}
            className="h-8 w-auto py-0 pl-2 pr-7 text-[12.5px] text-muted"
            aria-label="Sayı biçimi"
          >
            {NUMBER_FORMAT_LABELS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </SelectInput>
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
        <span aria-hidden className="grid h-8 w-7 shrink-0 place-items-center border-r border-hairline text-[13px] font-medium italic text-subtle">fx</span>
        {/* onBlur ŞART: odak kaybında düzenleme kapanmazsa onKeyDown'daki
            "if (editing) return" yüzünden ızgara klavyesi tamamen ölüyordu. */}
        <input
          ref={formulaRef}
          value={formulaBarValue}
          readOnly={readOnly}
          onChange={(e) => setEditing({ r: active.r, c: active.c, draft: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); stopEdit(true, "down"); }
            if (e.key === "Escape") { e.preventDefault(); stopEdit(false); }
          }}
          onFocus={() => { if (!editing && !readOnly) startEdit(active.r, active.c); }}
          onBlur={() => { if (!readOnly) stopEdit(true); }}
          placeholder="Değer veya =formül"
          aria-label="Formül çubuğu"
          className="h-8 min-w-0 flex-1 bg-transparent px-2.5 text-[13.5px] text-ink placeholder:text-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-ring/40"
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
        role="grid"
        aria-label="Hücreler"
        aria-readonly={readOnly || undefined}
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-ring/40"
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
                  "relative shrink-0 cursor-pointer select-none border-b border-r border-line-strong text-center text-[12px] font-semibold tabular-nums text-muted",
                  c >= selN.c1 && c <= selN.c2 ? "bg-brand-soft text-brand-strong" : "bg-surface-muted",
                )}
                style={{ width: colWidth(sheet, c), height: HEAD_H, lineHeight: `${HEAD_H}px` }}
                title={`${colName(c)} sütunu — sağ tık: ekle / sil`}
              >
                {colName(c)}
                <span
                  onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); resizeRef.current = { kind: "col", i: c, start: e.clientX, startSize: colWidth(sheetRef.current, c) }; }}
                  style={{ touchAction: "none" }}
                  title={`${colName(c)} sütun genişliği`}
                  className="absolute right-0 top-0 h-full w-2.5 cursor-col-resize hover:bg-brand/40"
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
                    "sticky left-0 z-10 shrink-0 cursor-pointer select-none border-b border-r border-line text-center text-[12px] tabular-nums",
                    r >= selN.r1 && r <= selN.r2 ? "bg-brand-soft font-semibold text-brand-strong" : "bg-surface-muted text-subtle",
                  )}
                  style={{ width: GUTTER_W, height: rh, lineHeight: `${rh - 1}px` }}
                  title="Sağ tık: satır ekle / sil"
                >
                  {r + 1}
                  <span
                    onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); resizeRef.current = { kind: "row", i: r, start: e.clientY, startSize: rowHeight(sheetRef.current, r) }; }}
                    style={{ touchAction: "none" }}
                    title={`${r + 1}. satır yüksekliği`}
                    className="absolute bottom-0 left-0 h-2.5 w-full cursor-row-resize hover:bg-brand/40"
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
                          aria-label="Hücre"
                          className="absolute inset-0 z-40 w-full border-2 border-brand bg-surface px-1.5 text-[13.5px] tabular-nums text-ink shadow-pop outline-none"
                          style={{ minWidth: w }}
                        />
                      </div>
                    );
                  }

                  /* Sağdaki hücre boşsa metin oraya taşabilir (bkz. className). */
                  const textSpill =
                    !st?.w && !cell?.img && formatValue(val, st) !== "" && !getCell(sheet, r, c + 1);

                  /* GÖRSEL YAYILMASI — Excel'de görsel hücrenin içinde değil
                     ÜSTÜNDE yüzer ve birden çok hücreyi kaplar. Hücreler
                     BİRLEŞTİRİLMEZ (altlarındaki metin kaybolmasın); görsel
                     mutlak konumlu olarak kaplayacağı alan kadar çizilir. */
                  const imgSpan = cell?.img
                    ? {
                        w: Array.from(
                          { length: Math.max(1, cell.img.cs ?? 1) },
                          (_, i) => colWidth(sheet, c + i),
                        ).reduce((a, b) => a + b, 0),
                        h: Array.from(
                          { length: Math.max(1, cell.img.rs ?? 1) },
                          (_, i) => rowHeight(sheet, r + i),
                        ).reduce((a, b) => a + b, 0),
                      }
                    : null;
                  const spill = textSpill || (imgSpan !== null && ((cell?.img?.cs ?? 1) > 1 || (cell?.img?.rs ?? 1) > 1));

                  return (
                    <div
                      key={c}
                      /* Doldurma sürüklemesi hedef hücreyi elementFromPoint ile
                         bulur (dokunmada onMouseEnter tetiklenmiyor). */
                      data-cell-r={r}
                      data-cell-c={c}
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
                        "relative shrink-0 select-none border-b border-r border-hairline px-1.5 text-[13.5px] tabular-nums",
                        /* TAŞMA — Excel davranışı. Uzun bir metin, sağındaki
                           hücre BOŞSA onun üzerine taşar; Excel'de de böyledir.
                           Önce her hücre overflow-hidden'dı ve uzun başlıklar
                           ortadan kesiliyordu (Sıraç, 2026-09-06). Kaydırma
                           açıksa ya da sağdaki hücre doluysa yine kırpılır —
                           yoksa iki metin üst üste binerdi. */
                        spill ? "overflow-visible" : "overflow-hidden",
                        st?.w ? "whitespace-pre-wrap break-words leading-[1.35]" : "whitespace-nowrap",
                        selected ? "bg-brand-soft/50" : "bg-surface",
                        inFill && "bg-brand-soft/30",
                        /* Yayılan görselde seçim çerçevesi hücreye DEĞİL
                           görselin kendisine çizilir (aşağıda): küçük çapa
                           hücresinin etrafındaki kutu, kocaman bir görselin
                           yanında "hangi satır seçili?" sorusunu
                           cevaplamıyordu (Sıraç, 2026-09-06). */
                        isActive && !imgSpan && "outline outline-2 -outline-offset-2 outline-brand",
                        isError(val) && "text-danger",
                        st?.b && "font-semibold",
                        st?.i && "italic",
                        st?.u && "underline",
                      )}
                      style={{
                        width: w, height: h,
                        /* Taşan hücre komşusunun ZEMİNİNİN üstünde kalmalı;
                           yoksa boş komşu kendi arka planıyla yazıyı örterdi. */
                        zIndex: spill ? 1 : undefined,
                        textAlign: alignOf(val, st),
                        lineHeight: st?.w ? undefined : `${h - 1}px`,
                        background: st?.bg || undefined,
                        color: st?.fg || undefined,
                        borderTop: st?.bd?.includes("t") ? "1.5px solid var(--color-ink)" : undefined,
                        borderBottom: st?.bd?.includes("b") ? "1.5px solid var(--color-ink)" : undefined,
                        borderLeft: st?.bd?.includes("l") ? "1.5px solid var(--color-ink)" : undefined,
                        borderRight: st?.bd?.includes("r") ? "1.5px solid var(--color-ink)" : undefined,
                      }}
                      title={
                        cell?.img
                          ? cell.img.name ?? "Görsel"
                          : cell?.f ? `${cell.f} → ${formatValue(val, st)}` : undefined
                      }
                    >
                      {cell?.img ? (
                        /* GÖRSEL hücreyi doldurur ama TAŞMAZ: object-contain,
                           oranı bozmadan sığdırır. Satır yüksekliğini kullanıcı
                           belirler — resim yüksekliği dayatmaz, yoksa tablo
                           kendiliğinden şişerdi. */
                        imageUrls[cell.img.id] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={imageUrls[cell.img.id]}
                            alt={cell.img.name ?? "Görsel"}
                            loading="lazy"
                            draggable={false}
                            className={cn(
                              "pointer-events-none absolute left-0 top-0 object-contain p-0.5",
                              /* Sınır HER ZAMAN görünür: görselin nerede
                                 başlayıp bittiği, dolayısıyla hangi hücreye
                                 ait olduğu ızgaradan okunabilsin. */
                              "rounded-[2px] ring-1 ring-inset ring-hairline",
                              isActive && "ring-2 ring-brand",
                            )}
                            style={{ width: imgSpan?.w ?? w, height: imgSpan?.h ?? h }}
                          />
                        ) : (
                          /* Adres henüz gelmediyse ya da kayıt silindiyse hücre
                             BOŞ kalmaz; kullanıcı neyin eksik olduğunu görür. */
                          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-subtle">
                            <ImageOff size={14} aria-hidden />
                          </span>
                        )
                      ) : (
                        formatValue(val, st)
                      )}
                      {/* Doldurma tutamağı — seçimin sağ alt köşesi */}
                      {isFillCorner && !readOnly && (
                        <span
                          onPointerDown={(e) => {
                            e.stopPropagation(); e.preventDefault();
                            fillRef.current = { from: sel, to: { r, c } };
                            setFillTo({ r, c });
                          }}
                          /* touch-action: none — parmakla çekince tarayıcı
                             kaydırmasın; tap-target parmakta görünmez hedefi
                             büyütür (görsel boyut aynı kalır). */
                          style={{ touchAction: "none" }}
                          title="Aşağı ya da sağa çekerek doldur"
                          className="tap-target absolute -bottom-[3px] -right-[3px] z-30 h-2 w-2 cursor-crosshair rounded-[1px] bg-brand ring-1 ring-surface"
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
            type="button"
            onClick={addSheet}
            title="Sayfa ekle"
            aria-label="Sayfa ekle"
            className="tap-target grid h-7 w-7 shrink-0 place-items-center rounded-control text-muted transition-colors duration-150 hover:bg-surface hover:text-ink"
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
                aria-label="Sayfa adı"
                className="h-7 w-28 shrink-0 rounded-control border border-brand bg-surface px-2 text-[12.5px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand-ring/40"
              />
            );
          }
          return (
            <span
              key={s.id}
              className={cn(
                "group inline-flex h-7 shrink-0 items-center gap-1 rounded-control pl-2.5 pr-1 text-[12.5px] transition-colors duration-150",
                on ? "bg-surface font-semibold text-ink shadow-xs ring-1 ring-line" : "text-muted hover:bg-surface/70 hover:text-ink",
              )}
            >
              <button type="button" aria-current={on ? "true" : undefined} onClick={() => selectSheet(i)} onDoubleClick={() => !readOnly && setRenaming({ index: i, draft: s.name })} className="max-w-40 truncate">
                {s.name}
              </button>
              {!readOnly && on && (
                <>
                  <button type="button" onClick={() => setRenaming({ index: i, draft: s.name })} title="Yeniden adlandır" aria-label="Sayfayı yeniden adlandır" className="tap-target grid h-5 w-5 place-items-center rounded-[4px] text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-ink">
                    <Pencil size={11} />
                  </button>
                  {wb.sheets.length > 1 && (
                    <button type="button" onClick={() => removeSheet(i)} title="Sayfayı sil" aria-label="Sayfayı sil" className="tap-target grid h-5 w-5 place-items-center rounded-[4px] text-subtle transition-colors duration-150 hover:bg-danger/10 hover:text-danger">
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
        {notice
          ? <span role="status" className="min-w-0 truncate font-medium text-ink">{notice}</span>
          : evaluated.failed
            ? <span className="truncate font-medium text-danger">Tablo hesaplanamadı</span>
            : summary && <span className="truncate font-medium tabular-nums text-muted">{summary}</span>}
      </div>

      {/* ── Sağ tık menüsü ───────────────────────────────────────────────── */}
      {menu && !readOnly && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          role="menu"
          className="anim-fade fixed z-[70] max-h-[80vh] w-56 overflow-y-auto rounded-card border border-line bg-surface py-1 shadow-pop"
          /* Menü 12 madde ≈ 450px. Eskiden yalnız YATAY eksen kırpılıyordu:
             ızgaranın alt yarısına sağ tıklandığında "Satırı sil" ve
             "Sütunu sil" görünür alanın ALTINDA kalıyordu ve menü `fixed`
             olduğu için kaydırarak da erişilemiyordu. Artık iki eksen de
             kırpılır, taşarsa menü kendi içinde kayar. */
          style={{
            left: Math.max(8, Math.min(menu.x, (typeof window !== "undefined" ? window.innerWidth : 9999) - 232)),
            top: Math.max(8, Math.min(menu.y, (typeof window !== "undefined" ? window.innerHeight : 9999) - 460)),
          }}
        >
          <MenuItem onClick={async () => {
            try { if (!(await writeClipboard())) setNotice(CLIPBOARD_WRITE_HINT); }
            finally { setMenu(null); }
          }}>Kopyala</MenuItem>
          {/* Önce panoya YAZ, ancak başarılıysa sil. */}
          <MenuItem onClick={async () => {
            try {
              if (await writeClipboard()) clearRange(norm(sel), true);
              else setNotice(CLIPBOARD_WRITE_HINT);
            } finally { setMenu(null); }
          }}>Kes</MenuItem>
          <MenuItem onClick={async () => {
            try {
              const t = await navigator.clipboard.readText();
              if (t) pasteText(t);
            } catch {
              /* Firefox readText'i web içeriğine hiç açmaz; Chrome'da izin
                 reddedilebilir. Çalışan onPaste yolunu söyle. */
              setNotice("Tarayıcı panoya erişemedi — yapıştırmak için ⌘V / Ctrl+V kullanın.");
            } finally { setMenu(null); }
          }}>Yapıştır</MenuItem>
          <MenuSep />
          <MenuItem onClick={() => { doInsertRow(selN.r1); setMenu(null); }}>Üste satır ekle</MenuItem>
          <MenuItem onClick={() => { doInsertRow(selN.r2 + 1); setMenu(null); }}>Alta satır ekle</MenuItem>
          {/* HANGİ satır/sütun olduğu YAZILIR. "Satırı sil" derken kullanıcı
              hangisinin gideceğini kestirmek zorunda kalıyordu — kocaman bir
              görselin altında seçim iyice belirsizleşiyor (Sıraç, 2026-09-06).
              Silinen satırdaki görsel de ayrıca söylenir. */}
          <MenuItem onClick={() => { doDeleteRow(selN.r1); setMenu(null); }} danger>
            {selN.r1 + 1}. satırı sil
          </MenuItem>
          <MenuSep />
          <MenuItem onClick={() => { doInsertCol(selN.c1); setMenu(null); }}>Sola sütun ekle</MenuItem>
          <MenuItem onClick={() => { doInsertCol(selN.c2 + 1); setMenu(null); }}>Sağa sütun ekle</MenuItem>
          <MenuItem onClick={() => { doDeleteCol(selN.c1); setMenu(null); }} danger>
            {colName(selN.c1)} sütununu sil
          </MenuItem>
          <MenuSep />
          <MenuItem onClick={() => { toggleMerge(); setMenu(null); }}>Hücreleri birleştir / çöz</MenuItem>
          <MenuSep />
          <MenuItem onClick={() => { setPickerOpen(true); setMenu(null); }}>Görsel ekle…</MenuItem>
          {getCell(sheet, active.r, active.c)?.img && (
            <>
              <MenuItem onClick={() => { resizeImage(1); setMenu(null); }}>Görseli büyüt</MenuItem>
              <MenuItem onClick={() => { resizeImage(-1); setMenu(null); }}>Görseli küçült</MenuItem>
            </>
          )}
          <MenuItem onClick={() => { clearImages(); setMenu(null); }}>Görseli kaldır</MenuItem>
          <MenuSep />
          <MenuItem onClick={() => { clearRange(norm(sel), true); setMenu(null); }} danger>İçeriği ve biçimi temizle</MenuItem>
        </div>
      )}
      {/* Drive görsel seçici — hücreye kimlik yazar, bayt değil. */}
      <ImagePicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={putImage} />
      {dialog}
    </div>
  );
}

function Palette({ colors, onPick }: { colors: string[]; onPick: (_c: string) => void }) {
  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      role="group"
      aria-label="Renk"
      className="anim-fade-down absolute left-0 top-full z-50 mt-1 grid w-[184px] grid-cols-5 gap-1 rounded-card border border-line bg-surface p-2 shadow-pop"
    >
      {colors.map((c) => (
        <button
          key={c || "none"}
          type="button"
          onClick={() => onPick(c)}
          title={c || "Yok"}
          aria-label={c ? `Renk ${c}` : "Rengi kaldır"}
          className="tap-target grid h-6 w-6 place-items-center rounded-[4px] ring-1 ring-line transition-[box-shadow] duration-150 hover:ring-2 hover:ring-line-strong"
          style={{ background: c || "transparent" }}
        >
          {!c && <X size={11} className="text-subtle" aria-hidden />}
        </button>
      ))}
    </div>
  );
}

function MenuItem({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "block w-full px-3 py-1.5 text-left text-[13.5px] transition-colors duration-150",
        danger ? "text-danger hover:bg-danger/10" : "text-ink hover:bg-surface-muted",
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
        /* Eşit kare (32px) — araç çubuğunda ikonlar bir hizada dursun;
           `tap-target` telefonda görünmez 40px hedef verir. */
        "tap-target inline-flex h-8 min-w-8 items-center justify-center rounded-control px-1.5 transition-colors duration-150 active:scale-[0.97]",
        active ? "bg-brand-soft text-brand-strong" : "text-muted hover:bg-surface-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-0.5 h-5 w-px shrink-0 bg-line" />;
