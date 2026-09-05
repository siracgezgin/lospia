"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bold, Italic, Underline, Strikethrough, Subscript, Superscript,
  List, ListOrdered, IndentIncrease, IndentDecrease,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Link2, Link2Off, Undo2, Redo2, Loader2, Check, FileDown, Printer, Eraser,
  Palette, ImagePlus, Highlighter, Minus, Table as TableIcon,
  SlidersHorizontal, Rows3, Columns3, Trash2, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button, IconButton } from "@/components/ui/Button";
import { SelectInput, TextInput } from "@/components/ui/Field";
import { useConfirm } from "@/components/ui/useConfirm";
import { saveTeamworkDoc, uploadDocImage } from "@/lib/actions/documents";
import { sanitizeRichText } from "@/lib/office/sanitize-html";
import {
  DOC_FONTS, DOC_FONT_SIZES, DOC_LINE_SPACING,
  DOC_BASE_FONT_PT, DOC_BASE_LINE_HEIGHT,
} from "@/lib/office/constants";

interface Props {
  /** "← Geri" — başlık satırının soluna konur; ayrı bir satır açmasın. */
  backSlot?: React.ReactNode;
  docId: string;
  initialTitle: string;
  initialBody: string;
  readOnly?: boolean;
}

/**
 * YAZI EDİTÖRÜ — AF Teamwork'ün Word'ü.
 *
 * Aslı Hanım (2026-08-28): "Excel'in yanına Word'ü de gir… Bize sunum yaparken
 * biz buradan açalım, Alev'in mailini okuyalım, revize verelim ve o bir format
 * olarak hazırlansın." Yani yazı sistemde AÇILIP DÜZENLENEBİLMELİ.
 *
 * Sıraç (2026-09-05): "Word artık Word gibi çalışmalı." Eksik olan ne varsa
 * eklendi: yazı tipi ve PUNTO, satır aralığı, girinti, hizalama, üstü çizili,
 * alt/üst simge, yatay çizgi, TABLO (satır/sütun ekle-sil), bağlantı düzenleme,
 * kelime sayacı, kısayollar (Ctrl+B/I/U/K/S/Z/Y, listede Tab), Word'den
 * yapıştırmada biçimin korunması ve düzgün bir A4 çıktısı.
 *
 * Yeni bağımlılık YOK (proje kuralı): tarayıcının kendi `contentEditable`'ı +
 * `document.execCommand`. execCommand resmen "deprecated" ama tüm tarayıcılarda
 * çalışıyor ve yerine geçen bir standart hâlâ yok; alternatif 200 KB'lık bir
 * editör paketi kurmak olurdu.
 *
 * GÖVDE SUNUCUDA TEMİZLENİR (lib/office/sanitize-html.ts). Aynı temizleyici
 * yapıştırma anında istemcide de çalışır: ekranda gördüğün ile veritabanına
 * yazılan aynı olsun diye.
 *
 * Otomatik kaydetme: yazmayı bıraktıktan 1,5 sn sonra, alandan çıkınca ve
 * sayfadan ayrılırken. Kaydedilmemiş değişiklik varken sekme kapanmaz.
 */
export function DocEditor({
  docId, initialTitle, initialBody, readOnly = false, backSlot,
}: Props) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const bodyRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(initialTitle);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fmt, setFmt] = useState<Fmt>(NO_FMT);
  const [panel, setPanel] = useState<Panel>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [busyImage, setBusyImage] = useState(false);
  const [counts, setCounts] = useState({ words: 0, chars: 0 });
  const [empty, setEmpty] = useState(true);

  const titleRef = useRef(initialTitle);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const queuedRef = useRef(false);
  const mountedRef = useRef(true);
  const paintedRef = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const countTimer = useRef<number | null>(null);
  const savedTimer = useRef<number | null>(null);
  const rangeRef = useRef<Range | null>(null);
  const flushRef = useRef<() => void>(() => {});

  /* ── Sayaç ve boşluk durumu ─────────────────────────────────────────── */

  const recount = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    const text = (el.innerText ?? "").replace(/\u00a0/g, " ");
    const trimmed = text.trim();
    setCounts({
      words: trimmed ? trimmed.split(/\s+/).length : 0,
      chars: text.replace(/\n/g, "").length,
    });
    setEmpty(!trimmed && !el.querySelector("img, table, hr"));
  }, []);

  const scheduleCount = useCallback(() => {
    if (countTimer.current) window.clearTimeout(countTimer.current);
    countTimer.current = window.setTimeout(recount, 400);
  }, [recount]);

  /* ── Kaydetme ───────────────────────────────────────────────────────── */

  const scheduleSave = useCallback((ms = 1500) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { flushRef.current(); }, ms);
  }, []);

  const flush = useCallback(async (announce = false) => {
    if (readOnly) return;
    const el = bodyRef.current;
    if (!el) return;
    if (savingRef.current) { queuedRef.current = true; return; }
    savingRef.current = true;
    queuedRef.current = false;
    dirtyRef.current = false;             // buradan sonraki her tuş yeniden kirletir
    if (mountedRef.current) { setSaving(true); setError(null); }

    try {
      const res = await saveTeamworkDoc(docId, {
        title: titleRef.current.trim() || "Adsız yazı",
        body: el.innerHTML,
      });
      if ("error" in res) {
        dirtyRef.current = true;
        if (mountedRef.current) { setError(res.error); setDirty(true); }
        return;
      }
      if (mountedRef.current) {
        setDirty(dirtyRef.current);
        if (!dirtyRef.current) {
          setSaved(true);
          if (savedTimer.current) window.clearTimeout(savedTimer.current);
          savedTimer.current = window.setTimeout(() => setSaved(false), 1800);
        }
      }
      if (announce) router.refresh();      // liste önizlemesi tazelensin
    } catch {
      dirtyRef.current = true;
      if (mountedRef.current) {
        setError("Kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.");
        setDirty(true);
      }
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
      /* Kaydederken yazmaya devam edildiyse bir tur daha at. HATADA otomatik
         denemeyiz: sunucu hayır diyorsa saniyede bir aynı hatayı basmak
         kullanıcıyı bilgilendirmez, yalnız yorar — "Kaydet" düğmesi elinde. */
      if (queuedRef.current) { queuedRef.current = false; scheduleSave(700); }
    }
  }, [docId, readOnly, router, scheduleSave]);

  useEffect(() => { flushRef.current = () => { void flush(false); }; });

  /** Yazmayı bırakınca kaydet — her tuşta sunucuya gitmeyelim. */
  const touch = useCallback(() => {
    if (readOnly) return;
    dirtyRef.current = true;
    setDirty(true);
    scheduleSave();
    scheduleCount();
  }, [readOnly, scheduleSave, scheduleCount]);

  /** Ctrl+S / "Kaydet" — bekleyen zamanlayıcıyı iptal edip hemen yazar. */
  const saveNow = useCallback(() => {
    if (readOnly) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    void flush(true);
  }, [flush, readOnly]);

  /* Sayfadan ayrılırken kaydedilmemiş bir şey kalmasın: hem uyarı, hem
     sökülme anında son bir yazma denemesi.

     Gövde elemanı BURADA yakalanır: React, ref'i geçici efektler çalışmadan
     önce boşaltıyor; `bodyRef.current` sökülme anında null olurdu ve son
     paragraf sessizce kaybolurdu. Kapanış (closure) düğümü canlı tutar. */
  useEffect(() => {
    const el = bodyRef.current;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      if (countTimer.current) window.clearTimeout(countTimer.current);
      if (savedTimer.current) window.clearTimeout(savedTimer.current);
      if (dirtyRef.current && el && !readOnly) {
        void saveTeamworkDoc(docId, {
          title: titleRef.current.trim() || "Adsız yazı",
          body: el.innerHTML,
        }).catch(() => { /* ekran gitti; uyarıyı gösterecek yer yok */ });
      }
    };
  }, [docId, readOnly]);

  useEffect(() => {
    if (!dirty || readOnly) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, readOnly]);

  /* ── İlk boyama ─────────────────────────────────────────────────────── */

  /* Gövde YALNIZ bir kez yazılır. React her render'da innerHTML'i tazelerse
     imleç her tuş vuruşunda başa atlar — contentEditable'ın klasik tuzağı. */
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || paintedRef.current) return;
    paintedRef.current = true;
    el.innerHTML = initialBody || "";
    recount();
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch { /* eski tarayıcı */ }
  }, [initialBody, recount]);

  /* ── İmleçteki biçim ────────────────────────────────────────────────── */

  const refreshFmt = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    const sel = window.getSelection();
    const node = sel && sel.rangeCount ? sel.anchorNode : null;
    const inside = !!node && el.contains(node);
    if (inside && sel && sel.rangeCount) {
      // Araç çubuğundaki bir açılır liste odağı çalınca seçim kaybolur;
      // gövdedeki SON geçerli aralığı burada saklarız.
      rangeRef.current = sel.getRangeAt(0).cloneRange();
    }
    if (!inside || readOnly) { setFmt((p) => (sameFmt(p, NO_FMT) ? p : NO_FMT)); return; }

    const q = (c: string) => { try { return document.queryCommandState(c); } catch { return false; } };
    let block = "";
    try { block = String(document.queryCommandValue("formatBlock") ?? "").toLowerCase(); } catch { /* eski tarayıcı */ }

    const anchor = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
    let font = "", size = "", spacing = "";
    let link = false, inTable = false;
    if (anchor) {
      const cs = window.getComputedStyle(anchor);
      const px = parseFloat(cs.fontSize);
      if (Number.isFinite(px)) {
        const pt = String(Math.round(px * 0.75));
        size = DOC_FONT_SIZES.includes(pt) ? pt : "";
      }
      font = matchFont(cs.fontFamily);
      const lh = parseFloat(cs.lineHeight);
      if (Number.isFinite(lh) && Number.isFinite(px) && px > 0) {
        const ratio = String(Math.round((lh / px) * 100) / 100);
        spacing = DOC_LINE_SPACING.some((s) => s.value === ratio) ? ratio : "";
      }
      link = !!anchor.closest("a");
      inTable = !!anchor.closest("table");
    }

    const next: Fmt = {
      bold: q("bold"), italic: q("italic"), underline: q("underline"),
      strike: q("strikeThrough"), sub: q("subscript"), sup: q("superscript"),
      ul: q("insertUnorderedList"), ol: q("insertOrderedList"),
      block: block === "div" ? "p" : block,
      align: q("justifyCenter") ? "center" : q("justifyRight") ? "right"
        : q("justifyFull") ? "justify" : q("justifyLeft") ? "left" : "",
      font, size, spacing, link, inTable,
    };
    setFmt((prev) => (sameFmt(prev, next) ? prev : next));
  }, [readOnly]);

  useEffect(() => {
    let frame = 0;
    const onSelect = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => { frame = 0; refreshFmt(); });
    };
    document.addEventListener("selectionchange", onSelect);
    return () => {
      document.removeEventListener("selectionchange", onSelect);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [refreshFmt]);

  /* ── Komutlar ───────────────────────────────────────────────────────── */

  /** Gövdeyi odakla ve seçimi (araç çubuğuna kaydıysa) geri koy. */
  const focusBody = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return el;
    el.focus({ preventScroll: true });
    const sel = window.getSelection();
    const saved = rangeRef.current;
    if (sel && saved && el.contains(saved.commonAncestorContainer)) {
      const cur = sel.rangeCount ? sel.getRangeAt(0) : null;
      if (!cur || !el.contains(cur.commonAncestorContainer)) {
        sel.removeAllRanges();
        sel.addRange(saved);
      }
    }
    return el;
  }, []);

  const exec = useCallback((command: string, value?: string) => {
    if (readOnly) return;
    const el = focusBody();
    if (!el) return;
    if (command === "undo" || command === "redo") {
      try { document.execCommand(command); } catch { /* yoksay */ }
      touch(); refreshFmt();
      return;
    }
    ensureParagraphs(el);
    /* styleWithCSS: renk / hizalama / girinti komutları <font> ya da
       <blockquote> yerine stil üretsin. Temizleyici `style` içinden yalnız
       izinli özellikleri geçirir; <font> hiç izinli değil. */
    try { document.execCommand("styleWithCSS", false, CSS_COMMANDS.has(command) ? "true" : "false"); } catch { /* eski */ }
    try { document.execCommand(command, false, value); } catch { /* yoksay */ }
    normalizeFontTags(el);
    touch();
    refreshFmt();
  }, [focusBody, readOnly, refreshFmt, touch]);

  /** Seçim varsa ona, yoksa imlecin bulunduğu paragrafa uygular. */
  const applyTypography = useCallback((kind: "size" | "font", value: string) => {
    if (readOnly || !value) return;
    const el = focusBody();
    if (!el) return;
    ensureParagraphs(el);
    const sel = window.getSelection();
    const collapsed = !sel || !sel.rangeCount || sel.isCollapsed;

    if (collapsed) {
      for (const b of blocksInSelection(el)) {
        if (kind === "size") b.style.fontSize = `${value}pt`;
        else b.style.fontFamily = value;
      }
    } else if (kind === "font") {
      try { document.execCommand("styleWithCSS", false, "true"); } catch { /* eski */ }
      try { document.execCommand("fontName", false, value); } catch { /* yoksay */ }
    } else {
      /* execCommand("fontSize") yalnız 1–7 kabul eder ve <font size> üretir.
         7'yi işaret olarak kullanıp çıkan etiketleri gerçek punto taşıyan
         <span>'a çeviriyoruz — Word'deki punto kutusunun karşılığı. */
      try { document.execCommand("styleWithCSS", false, "false"); } catch { /* eski */ }
      try { document.execCommand("fontSize", false, "7"); } catch { /* yoksay */ }
      el.querySelectorAll<HTMLElement>('font[size="7"]').forEach((f) => {
        const span = document.createElement("span");
        span.style.fontSize = `${value}pt`;
        while (f.firstChild) span.appendChild(f.firstChild);
        f.replaceWith(span);
      });
    }
    normalizeFontTags(el);
    touch();
    refreshFmt();
  }, [focusBody, readOnly, refreshFmt, touch]);

  const applySpacing = useCallback((value: string) => {
    if (readOnly || !value) return;
    const el = focusBody();
    if (!el) return;
    ensureParagraphs(el);
    for (const b of blocksInSelection(el)) b.style.lineHeight = value;
    touch();
    refreshFmt();
  }, [focusBody, readOnly, refreshFmt, touch]);

  /**
   * Girinti. Listede tarayıcının iç içe liste davranışı doğrudur; DÜZ
   * paragrafta ise execCommand("indent") Chrome'da
   * `<blockquote style="margin:0 0 0 40px;border:none;padding:0">` üretir.
   * Temizleyici `margin`/`border`/`padding` kısayollarını geçirmediği için
   * kaydettikten sonra girinti gider, geriye ALINTI kutusu kalırdı. Bu yüzden
   * paragrafta girintiyi DOM üzerinden `margin-left` ile yazıyoruz (bu özellik
   * temizleyicide izinli).
   */
  const applyIndent = useCallback((dir: 1 | -1) => {
    if (readOnly) return;
    const el = focusBody();
    if (!el) return;
    ensureParagraphs(el);
    const blocks = blocksInSelection(el);
    if (blocks.some((b) => b.closest("li"))) {
      exec(dir > 0 ? "indent" : "outdent");
      return;
    }
    for (const b of blocks) {
      const cur = parseFloat(b.style.marginLeft) || 0;
      const next = Math.max(0, Math.min(240, cur + dir * 40));
      b.style.marginLeft = next ? `${next}px` : "";
    }
    touch();
    refreshFmt();
  }, [exec, focusBody, readOnly, refreshFmt, touch]);

  /** Başlık/alıntı/kod: zaten o bloktaysa paragrafa döner. */
  const setBlock = useCallback((tag: string) => {
    exec("formatBlock", tag === "p" ? "P" : tag.toUpperCase());
  }, [exec]);

  const applyColor = useCallback((hex: string) => {
    exec(panel === "mark" ? "hiliteColor" : "foreColor", hex);
    setPanel(null);
  }, [exec, panel]);

  /* ── Bağlantı ───────────────────────────────────────────────────────── */

  const openLinkPanel = useCallback(() => {
    if (readOnly) return;
    const el = bodyRef.current;
    const sel = window.getSelection();
    const node = sel && sel.rangeCount ? sel.anchorNode : null;
    const anchor = node && el?.contains(node)
      ? (node.nodeType === 1 ? (node as HTMLElement) : node.parentElement)?.closest("a")
      : null;
    setLinkUrl(anchor?.getAttribute("href") ?? "");
    setLinkError(null);
    setPanel("link");
    window.setTimeout(() => linkRef.current?.focus(), 30);
  }, [readOnly]);

  const applyLink = useCallback(() => {
    const raw = linkUrl.trim();
    if (!raw) { setLinkError("Bir adres yazın."); return; }
    const url = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    if (!/^(https?:|mailto:)/i.test(url)) {
      setLinkError("Yalnız https:// ya da mailto: adresleri eklenebilir.");
      return;
    }
    const el = focusBody();
    if (!el) return;
    const sel = window.getSelection();
    const collapsed = !sel || !sel.rangeCount || sel.isCollapsed;
    const node = sel && sel.rangeCount ? sel.anchorNode : null;
    const anchor = node
      ? (node.nodeType === 1 ? (node as HTMLElement) : node.parentElement)?.closest("a")
      : null;

    if (collapsed && anchor) {
      anchor.setAttribute("href", url);          // var olan bağlantıyı düzenle
    } else if (collapsed) {
      try { document.execCommand("insertHTML", false, `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`); } catch { /* yoksay */ }
    } else {
      try { document.execCommand("createLink", false, url); } catch { /* yoksay */ }
    }
    setPanel(null);
    touch();
    refreshFmt();
  }, [focusBody, linkUrl, refreshFmt, touch]);

  const removeLink = useCallback(() => {
    const el = focusBody();
    if (!el) return;
    const sel = window.getSelection();
    const node = sel && sel.rangeCount ? sel.anchorNode : null;
    const anchor = node
      ? (node.nodeType === 1 ? (node as HTMLElement) : node.parentElement)?.closest("a")
      : null;
    if (anchor && sel) {
      const r = document.createRange();
      r.selectNodeContents(anchor);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    try { document.execCommand("unlink"); } catch { /* yoksay */ }
    setPanel(null);
    touch();
    refreshFmt();
  }, [focusBody, refreshFmt, touch]);

  /* ── Tablo ──────────────────────────────────────────────────────────── */

  const insertTable = useCallback(() => {
    if (readOnly) return;
    const el = focusBody();
    if (!el) return;
    ensureParagraphs(el);
    const head = `<tr>${"<th><br></th>".repeat(3)}</tr>`;
    const row = `<tr>${"<td><br></td>".repeat(3)}</tr>`;
    try {
      document.execCommand("insertHTML", false,
        `<table><thead>${head}</thead><tbody>${row}${row}</tbody></table><p><br></p>`);
    } catch { /* yoksay */ }
    touch();
    refreshFmt();
  }, [focusBody, readOnly, refreshFmt, touch]);

  const addRow = useCallback((where: "above" | "below") => {
    const cell = currentCell(bodyRef.current);
    const row = cell?.parentElement as HTMLTableRowElement | null;
    if (!cell || !row) return;
    const fresh = document.createElement("tr");
    for (let i = 0; i < row.cells.length; i++) {
      const td = document.createElement("td");
      td.appendChild(document.createElement("br"));
      fresh.appendChild(td);
    }
    const table = cell.closest("table");
    const inHead = row.parentElement?.tagName === "THEAD";
    if (inHead && where === "below") {
      const tbody = table?.querySelector("tbody");
      if (tbody) tbody.insertBefore(fresh, tbody.firstChild);
      else row.parentElement?.appendChild(fresh);
    } else {
      row.parentElement?.insertBefore(fresh, where === "above" ? row : row.nextSibling);
    }
    touch();
  }, [touch]);

  const addColumn = useCallback((where: "left" | "right") => {
    const cell = currentCell(bodyRef.current);
    const table = cell?.closest("table");
    if (!cell || !table) return;
    const at = where === "left" ? cell.cellIndex : cell.cellIndex + 1;
    Array.from(table.rows).forEach((r) => {
      const head = r.parentElement?.tagName === "THEAD";
      const fresh = document.createElement(head ? "th" : "td");
      fresh.appendChild(document.createElement("br"));
      r.insertBefore(fresh, r.cells[at] ?? null);
    });
    touch();
  }, [touch]);

  const removeRow = useCallback(async () => {
    const cell = currentCell(bodyRef.current);
    const row = cell?.parentElement as HTMLTableRowElement | null;
    const table = cell?.closest("table");
    if (!cell || !row || !table) return;
    if ((row.textContent ?? "").trim() &&
      !(await ask({ message: "Bu satır ve içindeki metin silinsin mi?", confirmLabel: "Satırı sil", tone: "danger" }))) return;
    if (table.rows.length <= 1) table.remove();
    else row.remove();
    touch();
    refreshFmt();
  }, [ask, refreshFmt, touch]);

  const removeColumn = useCallback(async () => {
    const cell = currentCell(bodyRef.current);
    const table = cell?.closest("table");
    if (!cell || !table) return;
    const index = cell.cellIndex;
    const filled = Array.from(table.rows).some((r) => (r.cells[index]?.textContent ?? "").trim());
    if (filled &&
      !(await ask({ message: "Bu sütun ve içindeki metin silinsin mi?", confirmLabel: "Sütunu sil", tone: "danger" }))) return;
    const firstRow = table.rows[0];
    if (firstRow && firstRow.cells.length <= 1) table.remove();
    else Array.from(table.rows).forEach((r) => r.cells[index]?.remove());
    touch();
    refreshFmt();
  }, [ask, refreshFmt, touch]);

  const removeTable = useCallback(async () => {
    const table = currentCell(bodyRef.current)?.closest("table");
    if (!table) return;
    if (!(await ask({ message: "Tablo tümüyle silinsin mi?", confirmLabel: "Tabloyu sil", tone: "danger" }))) return;
    table.remove();
    touch();
    refreshFmt();
  }, [ask, refreshFmt, touch]);

  /* ── Görsel ─────────────────────────────────────────────────────────── */

  const insertImage = useCallback(async (file: File) => {
    setError(null);
    setBusyImage(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadDocImage(fd);
      if ("error" in res) { setError(res.error); return; }
      focusBody();
      try { document.execCommand("insertHTML", false, `<img src="${escapeHtml(res.url)}" alt="" />`); } catch { /* yoksay */ }
      touch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Görsel yüklenemedi.");
    } finally {
      if (mountedRef.current) setBusyImage(false);
    }
  }, [focusBody, touch]);

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void insertImage(file);
  }

  /* ── Yapıştırma ─────────────────────────────────────────────────────── */

  /** Word / Google Docs'tan gelen biçim KORUNUR ama sunucudaki temizleyicinin
   *  aynısından geçer: `mso-*`, script, sınıf, kimlik hiçbiri girmez. */
  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (readOnly) return;
    const el = bodyRef.current;
    if (!el) return;
    const dt = e.clipboardData;

    const image = Array.from(dt.files ?? []).find((f) => f.type.startsWith("image/"));
    if (image) { e.preventDefault(); void insertImage(image); return; }

    e.preventDefault();
    const html = dt.getData("text/html");
    const clean = html ? sanitizeRichText(html) : "";
    if (clean) {
      try { document.execCommand("insertHTML", false, clean); } catch { /* yoksay */ }
      normalizeFontTags(el);
    } else {
      const text = dt.getData("text/plain");
      if (text) { try { document.execCommand("insertText", false, text); } catch { /* yoksay */ } }
    }
    touch();
    refreshFmt();
  }

  /* ── Klavye ─────────────────────────────────────────────────────────── */

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (readOnly) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "b") { e.preventDefault(); exec("bold"); return; }
      if (k === "i") { e.preventDefault(); exec("italic"); return; }
      if (k === "u") { e.preventDefault(); exec("underline"); return; }
      if (k === "k") { e.preventDefault(); openLinkPanel(); return; }
      if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); exec("redo"); return; }
      if (k === "z") { e.preventDefault(); exec("undo"); return; }
    }
    if (e.key === "Tab") {
      const cell = currentCell(bodyRef.current);
      if (cell) { e.preventDefault(); moveCell(cell, e.shiftKey ? -1 : 1); refreshFmt(); return; }
      const sel = window.getSelection();
      const node = sel && sel.rangeCount ? sel.anchorNode : null;
      const li = node
        ? (node.nodeType === 1 ? (node as HTMLElement) : node.parentElement)?.closest("li")
        : null;
      if (li) { e.preventDefault(); applyIndent(e.shiftKey ? -1 : 1); }
      // Liste dışında Tab varsayılan kalır: klavye kullanıcısı editörden çıkabilsin.
    }
  }

  /* Ctrl/Cmd+S sayfanın her yerinde çalışsın (başlık alanında da) ve
     tarayıcının "sayfayı kaydet" penceresi açılmasın. */
  useEffect(() => {
    if (readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readOnly, saveNow]);

  /* ── Word olarak indir ──────────────────────────────────────────────── */

  function downloadWord() {
    const html =
      `<html xmlns:o="urn:schemas-microsoft-com:office:office" ` +
      `xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">` +
      `<head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
      `<style>${WORD_EXPORT_CSS}</style></head>` +
      `<body><h1>${escapeHtml(title)}</h1>${bodyRef.current?.innerHTML ?? ""}</body></html>`;
    const blob = new Blob(["﻿", html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(title || "yazi").replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "yazi"}.doc`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /* ── Görünüm ────────────────────────────────────────────────────────── */

  const blockValue = BLOCK_OPTIONS.some((o) => o.value === fmt.block) ? fmt.block : "p";

  return (
    <div className="space-y-3">
      <style dangerouslySetInnerHTML={{ __html: DOC_CSS }} />

      {backSlot && <div className="no-print mb-1">{backSlot}</div>}

      {/* Başlık — belgenin adı, listede bu görünür. Kâğıtta girdi kutusu değil
          gerçek bir başlık basılır. */}
      <input
        value={title}
        onChange={(e) => { setTitle(e.target.value); titleRef.current = e.target.value; touch(); }}
        onBlur={() => { if (dirtyRef.current) saveNow(); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); bodyRef.current?.focus(); } }}
        disabled={readOnly}
        aria-label="Yazı başlığı"
        placeholder="Yazı başlığı"
        className="no-print w-full rounded-control border border-transparent bg-transparent px-2 py-1 text-[24px] font-semibold tracking-tight text-ink transition-colors duration-150 placeholder:text-subtle hover:border-line focus:border-brand-ring focus:outline-none focus:ring-2 focus:ring-brand-ring/40 disabled:hover:border-transparent"
      />
      <h1 className="doc-print-title">{title}</h1>

      {error && (
        <p role="alert" className="no-print anim-fade-down rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">
          {error}
        </p>
      )}

      <div className="doc-shell overflow-hidden rounded-card border border-line bg-surface shadow-card">
        {/* Araç çubuğu — telefonda temel satır görünür, gerisi "Daha fazla"
            düğmesiyle açılır; masaüstünde hepsi zaten açıktır. */}
        <div className="no-print border-b border-hairline">
          <div role="toolbar" aria-label="Biçim araçları" className="flex flex-wrap items-center gap-0.5 px-2 py-1.5">
            {!readOnly && (
              <>
                <SelectInput
                  aria-label="Paragraf biçimi"
                  title="Paragraf biçimi"
                  value={blockValue}
                  onChange={(e) => setBlock(e.target.value)}
                  className={TOOL_SELECT + " w-[7.75rem]"}
                >
                  {BLOCK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </SelectInput>
                <Sep />
                <Btn icon={Bold} label="Kalın (Ctrl+B)" active={fmt.bold} onClick={() => exec("bold")} />
                <Btn icon={Italic} label="İtalik (Ctrl+I)" active={fmt.italic} onClick={() => exec("italic")} />
                <Btn icon={Underline} label="Altı çizili (Ctrl+U)" active={fmt.underline} onClick={() => exec("underline")} />
                <Sep />
                <Btn icon={List} label="Madde listesi" active={fmt.ul} onClick={() => exec("insertUnorderedList")} />
                <Btn icon={ListOrdered} label="Numaralı liste" active={fmt.ol} onClick={() => exec("insertOrderedList")} />
                <Btn icon={Link2} label="Bağlantı (Ctrl+K)" active={panel === "link" || fmt.link} onClick={openLinkPanel} />
                <Sep />
                <Btn icon={Undo2} label="Geri al (Ctrl+Z)" onClick={() => exec("undo")} />
                <Btn icon={Redo2} label="Yinele (Ctrl+Y)" onClick={() => exec("redo")} />
                <Btn
                  icon={SlidersHorizontal}
                  label={showMore ? "Ek araçları gizle" : "Daha fazla biçim aracı"}
                  active={showMore}
                  className="sm:hidden"
                  onClick={() => setShowMore((v) => !v)}
                />
              </>
            )}
            <span className="ml-auto flex items-center gap-0.5">
              <Btn icon={FileDown} label="Word olarak indir (.doc)" onClick={downloadWord} />
              <Btn icon={Printer} label="Yazdır / PDF olarak kaydet" onClick={() => window.print()} />
            </span>
          </div>

          {!readOnly && (
            <div
              role="toolbar"
              aria-label="Ek biçim araçları"
              className={cn(
                "flex-wrap items-center gap-0.5 border-t border-hairline px-2 py-1.5",
                showMore ? "flex" : "hidden sm:flex",
              )}
            >
              <SelectInput
                aria-label="Yazı tipi"
                title="Yazı tipi"
                value={fmt.font}
                onChange={(e) => applyTypography("font", e.target.value)}
                className={TOOL_SELECT + " w-[8.5rem]"}
              >
                <option value="" disabled>Yazı tipi</option>
                {DOC_FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </SelectInput>
              <SelectInput
                aria-label="Punto"
                title="Punto"
                value={fmt.size}
                onChange={(e) => applyTypography("size", e.target.value)}
                className={TOOL_SELECT + " w-[4.25rem]"}
              >
                <option value="" disabled>Punto</option>
                {DOC_FONT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </SelectInput>
              <SelectInput
                aria-label="Satır aralığı"
                title="Satır aralığı"
                value={fmt.spacing}
                onChange={(e) => applySpacing(e.target.value)}
                className={TOOL_SELECT + " w-[5.25rem]"}
              >
                <option value="" disabled>Aralık</option>
                {DOC_LINE_SPACING.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </SelectInput>
              <Sep />
              <Btn icon={Strikethrough} label="Üstü çizili" active={fmt.strike} onClick={() => exec("strikeThrough")} />
              <Btn icon={Subscript} label="Alt simge" active={fmt.sub} onClick={() => exec("subscript")} />
              <Btn icon={Superscript} label="Üst simge" active={fmt.sup} onClick={() => exec("superscript")} />
              <Btn icon={Palette} label="Yazı rengi" active={panel === "text"} onClick={() => setPanel((p) => (p === "text" ? null : "text"))} />
              <Btn icon={Highlighter} label="Vurgu rengi" active={panel === "mark"} onClick={() => setPanel((p) => (p === "mark" ? null : "mark"))} />
              <Sep />
              <Btn icon={AlignLeft} label="Sola hizala" active={fmt.align === "left"} onClick={() => exec("justifyLeft")} />
              <Btn icon={AlignCenter} label="Ortala" active={fmt.align === "center"} onClick={() => exec("justifyCenter")} />
              <Btn icon={AlignRight} label="Sağa hizala" active={fmt.align === "right"} onClick={() => exec("justifyRight")} />
              <Btn icon={AlignJustify} label="İki yana yasla" active={fmt.align === "justify"} onClick={() => exec("justifyFull")} />
              <Btn icon={IndentDecrease} label="Girintiyi azalt (Shift+Tab)" onClick={() => applyIndent(-1)} />
              <Btn icon={IndentIncrease} label="Girintiyi artır (Tab)" onClick={() => applyIndent(1)} />
              <Sep />
              <Btn icon={TableIcon} label="Tablo ekle (3×3)" onClick={insertTable} />
              <Btn icon={ImagePlus} label="Görsel ekle" busy={busyImage} onClick={() => !busyImage && imageRef.current?.click()} />
              <Btn icon={Minus} label="Yatay çizgi" onClick={() => exec("insertHorizontalRule")} />
              <Btn icon={Eraser} label="Biçimi temizle" onClick={() => exec("removeFormat")} />
            </div>
          )}

          {/* Tablo araçları — YALNIZ imleç bir tablonun içindeyken. */}
          {!readOnly && fmt.inTable && (
            <div className="anim-fade-down flex flex-wrap items-center gap-0.5 border-t border-hairline bg-surface-muted px-2 py-1.5">
              <span className="mr-1 pl-1 text-[12px] font-medium text-muted">Tablo</span>
              <Btn icon={Rows3} label="Üste satır ekle" onClick={() => addRow("above")} />
              <Btn icon={Rows3} label="Alta satır ekle" flip onClick={() => addRow("below")} />
              <Btn icon={Columns3} label="Sola sütun ekle" onClick={() => addColumn("left")} />
              <Btn icon={Columns3} label="Sağa sütun ekle" flip onClick={() => addColumn("right")} />
              <Sep />
              <Btn icon={Rows3} label="Satırı sil" danger onClick={() => void removeRow()} />
              <Btn icon={Columns3} label="Sütunu sil" danger onClick={() => void removeColumn()} />
              <Btn icon={Trash2} label="Tabloyu sil" danger onClick={() => void removeTable()} />
            </div>
          )}

          {/* Renk paleti — istenince açılan tek satır. */}
          {panel && panel !== "link" && !readOnly && (
            <div className="anim-fade-down flex flex-wrap items-center gap-1.5 border-t border-hairline bg-surface-muted px-3 py-2">
              <span className="mr-1 text-[12px] font-medium text-muted">
                {panel === "mark" ? "Vurgu" : "Yazı rengi"}
              </span>
              {DOC_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyColor(c.hex)}
                  title={c.label}
                  aria-label={c.label}
                  className="tap-target size-6 rounded-full ring-1 ring-inset ring-line transition-[box-shadow] duration-150 hover:ring-2 hover:ring-line-strong focus-visible:ring-2 focus-visible:ring-brand-ring"
                  style={{ backgroundColor: c.hex }}
                />
              ))}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { exec("removeFormat"); setPanel(null); }}
                className="ml-1 h-8 rounded-control px-2 text-[12px] font-medium text-muted transition-colors duration-150 hover:bg-surface hover:text-ink"
              >
                Rengi kaldır
              </button>
            </div>
          )}

          {/* Bağlantı — adres kutusu; imleç bir bağlantının içindeyse mevcut
              adres gelir ve "Kaldır" düğmesi çıkar. */}
          {panel === "link" && !readOnly && (
            <div className="anim-fade-down flex flex-wrap items-center gap-2 border-t border-hairline bg-surface-muted px-3 py-2">
              <TextInput
                ref={linkRef}
                value={linkUrl}
                onChange={(e) => { setLinkUrl(e.target.value); setLinkError(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); applyLink(); }
                  if (e.key === "Escape") { e.preventDefault(); setPanel(null); focusBody(); }
                }}
                placeholder="https://…"
                aria-label="Bağlantı adresi"
                invalid={!!linkError}
                className="h-8 w-full min-w-0 text-[13px] sm:w-80"
              />
              <Button size="sm" onClick={applyLink}>Uygula</Button>
              {fmt.link && (
                <Button size="sm" variant="secondary" onClick={removeLink}>
                  <Link2Off size={14} aria-hidden /> Kaldır
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => { setPanel(null); focusBody(); }}>Vazgeç</Button>
              {linkError && <span role="alert" className="w-full text-[12px] font-medium text-danger">{linkError}</span>}
            </div>
          )}

          {readOnly && (
            <p className="border-t border-hairline bg-surface-muted px-3 py-2 text-[12.5px] text-muted">
              Bu yazı salt okunur. Düzenlemek için yazıyı ekleyen kişiye ya da yöneticiye başvurun.
            </p>
          )}
        </div>

        <input
          ref={imageRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          className="hidden"
          onChange={onPickImage}
        />

        {/* Yazı alanı — SOLA YASLI, tam genişlik (Aslı Hanım, 2026-08-29:
            "sayfayı etkin, optimum kullan"). */}
        <div
          ref={bodyRef}
          contentEditable={!readOnly}
          suppressContentEditableWarning
          onInput={touch}
          onBlur={() => { if (dirtyRef.current) flushRef.current(); }}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
          onFocus={refreshFmt}
          onMouseUp={refreshFmt}
          role="textbox"
          aria-multiline="true"
          aria-label="Yazı gövdesi"
          aria-readonly={readOnly || undefined}
          data-empty={empty ? "true" : undefined}
          data-placeholder="Yazmaya başlayın…"
          className="doc-body min-h-[60vh] w-full outline-none"
        />

        {/* Durum çubuğu — Word'ün alt şeridi: belgeyi TARİF eder. */}
        <div className="no-print flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline bg-surface-muted px-3 py-2 text-[12px] text-subtle">
          <span className="tabular-nums">{counts.words} kelime · {counts.chars} karakter</span>
          <span className="ml-auto inline-flex items-center gap-1.5" aria-live="polite">
            {saving ? (
              <><Loader2 size={13} className="animate-spin" aria-hidden /> kaydediliyor</>
            ) : saved ? (
              <><Check size={13} className="text-success" aria-hidden /> kaydedildi</>
            ) : dirty ? (
              "kaydedilmedi"
            ) : readOnly ? (
              "salt okunur"
            ) : (
              "tüm değişiklikler kayıtlı"
            )}
          </span>
          {!readOnly && (
            <Button
              size="sm"
              variant="secondary"
              onClick={saveNow}
              disabled={!dirty && !saving}
              title="Kaydet (Ctrl+S)"
            >
              Kaydet
            </Button>
          )}
        </div>
      </div>

      {dialog}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Yardımcılar — bileşen DIŞINDA: render içinde tanımlanan bileşen her çizimde
   yeniden yaratılır, React ağacı söker ve odak kaçar.
   ══════════════════════════════════════════════════════════════════════════ */

/** İmlecin bulunduğu yerdeki biçim — araç çubuğu "seçili"yi buradan okur. */
type Fmt = {
  bold: boolean; italic: boolean; underline: boolean;
  strike: boolean; sub: boolean; sup: boolean;
  ul: boolean; ol: boolean;
  /** formatBlock değeri: "h2" · "h3" · "blockquote" · "pre" · "p" · "" */
  block: string;
  align: string;
  font: string; size: string; spacing: string;
  link: boolean; inTable: boolean;
};

const NO_FMT: Fmt = {
  bold: false, italic: false, underline: false, strike: false, sub: false, sup: false,
  ul: false, ol: false, block: "", align: "", font: "", size: "", spacing: "",
  link: false, inTable: false,
};

function sameFmt(a: Fmt, b: Fmt): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.underline === b.underline
    && a.strike === b.strike && a.sub === b.sub && a.sup === b.sup
    && a.ul === b.ul && a.ol === b.ol && a.block === b.block && a.align === b.align
    && a.font === b.font && a.size === b.size && a.spacing === b.spacing
    && a.link === b.link && a.inTable === b.inTable;
}

type Panel = "text" | "mark" | "link" | null;

/** Bu komutlar CSS üretmeli (<font> ya da <blockquote> değil). */
const CSS_COMMANDS = new Set([
  "foreColor", "hiliteColor", "fontName",
  "justifyLeft", "justifyCenter", "justifyRight", "justifyFull",
  "indent", "outdent",
]);

/* Sayfanın kendi H1'i (yazı başlığı) sr-only olduğu için gövdedeki en büyük
   başlık h2'dir; eski yazılar da bu ölçüde yazıldı. */
const BLOCK_OPTIONS: { value: string; label: string }[] = [
  { value: "p", label: "Normal metin" },
  { value: "h2", label: "Başlık 1" },
  { value: "h3", label: "Başlık 2" },
  { value: "h4", label: "Başlık 3" },
  { value: "blockquote", label: "Alıntı" },
  { value: "pre", label: "Kod bloğu" },
];

const BLOCK_SELECTOR = "p,div,h1,h2,h3,h4,h5,h6,li,blockquote,pre,td,th,figcaption";
const BLOCK_TAGS = new Set([
  "P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6",
  "UL", "OL", "BLOCKQUOTE", "PRE", "TABLE", "HR", "FIGURE",
]);

/** Araç çubuğu açılır listeleri — düğmelerle aynı yükseklikte, dar. */
const TOOL_SELECT = "h-8 pointer-coarse:h-10 w-auto shrink-0 px-2 pr-7 text-[12.5px]";

/**
 * Kök seviyedeki başıboş metinleri <p> içine alır.
 *
 * Hizalama, girinti ve satır aralığı BLOK üzerinde çalışır; gövdenin ilk
 * satırı çıplak bir metin düğümüyse bu komutlar sessizce hiçbir şey yapmıyordu.
 * Düğümler TAŞINIR (kopyalanmaz), böylece imleç yerinde kalır.
 */
function ensureParagraphs(el: HTMLElement) {
  const run: ChildNode[] = [];
  const wrap = () => {
    if (!run.length) return;
    const meaningful = run.some((n) => n.nodeType !== 3 || (n.textContent ?? "").trim() !== "");
    if (meaningful) {
      const p = document.createElement("p");
      el.insertBefore(p, run[0]);
      for (const n of run) p.appendChild(n);
    }
    run.length = 0;
  };
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 1 && BLOCK_TAGS.has((node as HTMLElement).tagName)) wrap();
    else run.push(node);
  }
  wrap();
}

/** <font> → <span style>. Temizleyici <font> geçirmez; execCommand hâlâ üretir. */
const FONT_TAG_PT = ["8", "10", "12", "14", "18", "24", "32"];
function normalizeFontTags(el: HTMLElement) {
  el.querySelectorAll<HTMLElement>("font").forEach((f) => {
    const span = document.createElement("span");
    const face = f.getAttribute("face");
    const color = f.getAttribute("color");
    const size = Number(f.getAttribute("size"));
    if (face) span.style.fontFamily = face;
    if (color) span.style.color = color;
    if (size >= 1 && size <= 7) span.style.fontSize = `${FONT_TAG_PT[size - 1]}pt`;
    while (f.firstChild) span.appendChild(f.firstChild);
    f.replaceWith(span);
  });
}

/** Seçimin dokunduğu EN İÇTEKİ bloklar (dış blok da boyanırsa girinti katlanır). */
function blocksInSelection(el: HTMLElement): HTMLElement[] {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return [];
  const range = sel.getRangeAt(0);
  if (!el.contains(range.commonAncestorContainer)) return [];
  const hit = Array.from(el.querySelectorAll<HTMLElement>(BLOCK_SELECTOR))
    .filter((n) => range.intersectsNode(n));
  const inner = hit.filter((n) => !hit.some((o) => o !== n && n.contains(o)));
  if (inner.length) return inner;
  const start = range.startContainer;
  const startEl = start.nodeType === 1 ? (start as HTMLElement) : start.parentElement;
  const near = startEl?.closest<HTMLElement>(BLOCK_SELECTOR) ?? null;
  return near && el.contains(near) ? [near] : [];
}

function currentCell(el: HTMLElement | null): HTMLTableCellElement | null {
  const sel = window.getSelection();
  const node = sel && sel.rangeCount ? sel.anchorNode : null;
  if (!el || !node || !el.contains(node)) return null;
  const start = node.nodeType === 1 ? (node as Element) : node.parentElement;
  const cell = start?.closest("td,th") as HTMLTableCellElement | null;
  return cell && el.contains(cell) ? cell : null;
}

/** Tabloda Tab ile bir sonraki hücreye geç (Word'deki davranış). */
function moveCell(cell: HTMLTableCellElement, dir: 1 | -1) {
  const table = cell.closest("table");
  if (!table) return;
  const cells = Array.from(table.querySelectorAll<HTMLTableCellElement>("td,th"));
  const next = cells[cells.indexOf(cell) + dir];
  if (!next) return;
  const sel = window.getSelection();
  if (!sel) return;
  const r = document.createRange();
  r.selectNodeContents(next);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}

/** Tarayıcının bildirdiği aileyi listemizdeki değere eşler. */
function matchFont(computed: string): string {
  const first = computed.split(",")[0]?.replace(/["']/g, "").trim().toLowerCase() ?? "";
  if (!first) return "";
  const key = first.replace(/\s+/g, "");
  for (const f of DOC_FONTS) {
    const own = f.value.split(",")[0].replace(/["']/g, "").trim().toLowerCase().replace(/\s+/g, "");
    if (key === own || key.startsWith(own)) return f.value;
  }
  return "";
}

/** Yazı ve vurgu renkleri — kişi paletiyle aynı aile, uygulama tek renk
 *  dilinde kalsın. Serbest renk seçici bilerek yok: on renk yeter. */
const DOC_COLORS: { hex: string; label: string }[] = [
  { hex: "#111827", label: "Siyah" },
  { hex: "#5b6e8a", label: "Kurşuni" },
  { hex: "#d23320", label: "Kırmızı" },
  { hex: "#df7314", label: "Turuncu" },
  { hex: "#c98e20", label: "Altın" },
  { hex: "#1f6e4d", label: "Yeşil" },
  { hex: "#1796a4", label: "Turkuaz" },
  { hex: "#2563c9", label: "Mavi" },
  { hex: "#7c3aed", label: "Mor" },
  { hex: "#cc2e93", label: "Magenta" },
];

/** Araç çubuğu düğmesi — eşit kare, seçiliyken marka zemini. */
function Btn({
  icon: Icon, label, active, busy, danger, flip, className, onClick,
}: {
  icon: LucideIcon; label: string; active?: boolean; busy?: boolean;
  danger?: boolean; flip?: boolean; className?: string; onClick: () => void;
}) {
  return (
    <IconButton
      size="sm"
      aria-label={label}
      title={label}
      aria-pressed={active}
      aria-busy={busy || undefined}
      onMouseDown={(e) => e.preventDefault()}  // seçim kaybolmasın
      onClick={onClick}
      className={cn(
        active && "bg-brand-soft text-brand-strong hover:bg-brand-soft hover:text-brand-strong",
        danger && "text-danger hover:bg-danger/10 hover:text-danger",
        className,
      )}
    >
      {busy
        ? <Loader2 size={15} className="animate-spin" aria-hidden />
        : <Icon size={15} className={cn(flip && "rotate-180")} aria-hidden />}
    </IconButton>
  );
}

function Sep() {
  return <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line" />;
}

function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Word'de açılan .doc çıktısı kendi stilini taşır (ekrandaki CSS gitmiyor). */
const WORD_EXPORT_CSS = `
body{font-family:Calibri,Arial,sans-serif;font-size:${DOC_BASE_FONT_PT}pt;line-height:${DOC_BASE_LINE_HEIGHT};color:#111}
h1{font-size:22pt}h2{font-size:16pt}h3{font-size:13.5pt}h4{font-size:12pt}
table{border-collapse:collapse;width:100%}
td,th{border:1px solid #9aa3a8;padding:4pt 6pt;vertical-align:top}
th{background:#eef2f3;text-align:left}
blockquote{margin-left:0;padding-left:10pt;border-left:3pt solid #9aa3a8;color:#444}
pre{font-family:Consolas,monospace;background:#f2f4f5;padding:6pt;white-space:pre-wrap}
hr{border:0;border-top:1px solid #9aa3a8}
img{max-width:100%}
`;

/**
 * Gövde tipografisi + A4 çıktısı.
 *
 * Tailwind'in `[&_x]:` varyantları yerine düz CSS: kural sayısı yirmiyi geçiyor
 * ve aynı kuralların YAZDIRMA karşılığı gerekiyor. Renkler globals.css'teki
 * belirteçlerden okunur — ayrı bir palet doğmasın.
 */
const DOC_CSS = `
.doc-print-title{display:none}
.doc-body{position:relative;padding:24px 20px;font-size:${DOC_BASE_FONT_PT}pt;line-height:${DOC_BASE_LINE_HEIGHT};color:var(--text);word-break:break-word}
@media (min-width:640px){.doc-body{padding:28px 32px}}
.doc-body[data-empty="true"]::before{content:attr(data-placeholder);position:absolute;top:24px;left:20px;color:var(--text-subtle);pointer-events:none}
@media (min-width:640px){.doc-body[data-empty="true"]::before{top:28px;left:32px}}
.doc-body>*:first-child{margin-top:0}
.doc-body p{margin:0 0 .6em}
.doc-body h1{font-size:22pt}
.doc-body h2{font-size:16pt}
.doc-body h3{font-size:13.5pt}
.doc-body h4{font-size:12pt}
.doc-body h1,.doc-body h2,.doc-body h3,.doc-body h4,.doc-body h5,.doc-body h6{font-weight:640;line-height:1.3;margin:1.1em 0 .35em;letter-spacing:-0.01em}
.doc-body ul{list-style:disc;padding-left:1.7em;margin:0 0 .6em}
.doc-body ol{list-style:decimal;padding-left:1.7em;margin:0 0 .6em}
.doc-body ul ul{list-style:circle}.doc-body ul ul ul{list-style:square}
.doc-body ol ol{list-style:lower-alpha}.doc-body ol ol ol{list-style:lower-roman}
.doc-body li{margin:.15em 0}
.doc-body li>ul,.doc-body li>ol{margin:.15em 0}
.doc-body blockquote{margin:.8em 0;padding-left:.9em;border-left:3px solid var(--border-strong);color:var(--text-muted)}
.doc-body pre{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10.5pt;background:var(--surface-sunken);border-radius:8px;padding:10px 12px;white-space:pre-wrap;margin:.8em 0}
.doc-body code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.92em;background:var(--surface-sunken);border-radius:4px;padding:1px 4px}
.doc-body pre code{background:none;padding:0}
.doc-body hr{border:0;border-top:1px solid var(--border);margin:1.1em 0}
.doc-body a{color:var(--brand);text-decoration:underline}
.doc-body img{max-width:100%;height:auto;border-radius:8px;margin:.6em 0}
.doc-body table{border-collapse:collapse;width:100%;margin:.8em 0;table-layout:fixed}
.doc-body th,.doc-body td{border:1px solid var(--border);padding:6px 8px;vertical-align:top}
.doc-body th{background:var(--surface-muted);font-weight:640;text-align:left}
.doc-body sub,.doc-body sup{font-size:.72em;line-height:0}
.doc-body:focus{outline:none}
@page{size:A4 portrait;margin:18mm 16mm}
@media print{
  .doc-shell{border:0!important;box-shadow:none!important;border-radius:0!important;background:#fff!important}
  .doc-body{padding:0!important;min-height:0!important;font-size:11.5pt;color:#000}
  .doc-print-title{display:block!important;font-size:20pt;font-weight:700;margin:0 0 10pt;color:#000}
  .doc-body a{color:#000}
  .doc-body h1,.doc-body h2,.doc-body h3,.doc-body h4{break-after:avoid;page-break-after:avoid}
  .doc-body p,.doc-body li{orphans:2;widows:2}
  .doc-body img,.doc-body table,.doc-body pre,.doc-body blockquote{break-inside:avoid;page-break-inside:avoid}
  .doc-body th{background:#eef2f3!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .doc-body th,.doc-body td{border:1px solid #888!important}
}
`;
