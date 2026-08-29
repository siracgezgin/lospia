"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bold, Italic, Underline, List, ListOrdered, Quote, Heading1, Heading2,
  Link2, Undo2, Redo2, Loader2, Check, FileDown, Printer, Eraser,
  Palette, ImagePlus, Highlighter, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { IconButton } from "@/components/ui/Button";
import { saveTeamworkDoc, uploadDocImage } from "@/lib/actions/documents";

interface Props {
  /** "← Geri" — başlık satırının soluna konur; ayrı bir satır açmasın. */
  backSlot?: React.ReactNode;
  docId: string;
  initialTitle: string;
  initialBody: string;
  readOnly?: boolean;
}

/** İmlecin bulunduğu yerdeki biçim — araç çubuğu "seçili"yi buradan okur. */
type Fmt = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  ul: boolean;
  ol: boolean;
  /** formatBlock değeri: "h2" · "h3" · "blockquote" · "p" · "" */
  block: string;
};
const NO_FMT: Fmt = { bold: false, italic: false, underline: false, ul: false, ol: false, block: "" };

/**
 * YAZI EDİTÖRÜ — AF Teamwork'ün Word'ü.
 *
 * Aslı Hanım (2026-08-28): "Excel'in yanına Word'ü de gir… Bize sunum yaparken
 * biz buradan açalım, Alev'in mailini okuyalım, revize verelim ve o bir format
 * olarak hazırlansın." Yani yazı sistemde AÇILIP DÜZENLENEBİLMELİ; indirilip
 * başka programda açılan bir dosya bu akışı karşılamıyor.
 *
 * Sheets'in Excel için yaptığının metin karşılığı. Yeni bağımlılık YOK (proje
 * kuralı): tarayıcının kendi `contentEditable`'ı + `document.execCommand`.
 * execCommand resmen "deprecated" ama tüm tarayıcılarda çalışıyor ve yerine
 * geçen bir standart hâlâ yok; alternatif 200 KB'lık bir editör paketi kurmak
 * olurdu.
 *
 * GÖVDE SUNUCUDA TEMİZLENİR (lib/office/sanitize-html.ts) — buradaki HTML'e
 * güvenilmez, yapıştırma da düz metne indirgenir.
 *
 * Otomatik kaydetme: yazmayı bıraktıktan 1,5 sn sonra ve alandan çıkınca.
 *
 * ARAÇ ÇUBUĞU: eşit kare düğmeler, imlecin olduğu yerdeki biçim SEÇİLİ
 * görünür (Word'de "Kalın"ın basılı durması gibi). Önce hiçbir düğme durum
 * göstermiyordu; kalın bir kelimenin içinde miyim, bilinmiyordu.
 */
export function DocEditor({
  docId, initialTitle, initialBody, readOnly = false, backSlot,
}: Props) {
  const router = useRouter();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(initialTitle);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();
  const timer = useRef<number | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [palette, setPalette] = useState<"text" | "mark" | null>(null);
  const [busyImage, setBusyImage] = useState(false);
  const [fmt, setFmt] = useState<Fmt>(NO_FMT);

  /* Gövde YALNIZ ilk boyamada yazılır. React her render'da innerHTML'i
     tazelerse imleç her tuş vuruşunda başa atlar — contentEditable'ın klasik
     tuzağı. Sonraki güncellemeler DOM'un kendi işi. */
  useEffect(() => {
    if (bodyRef.current && bodyRef.current.innerHTML === "") {
      bodyRef.current.innerHTML = initialBody || "";
    }
  }, [initialBody]);

  /** İmleç nerede, orada hangi biçim var? Yalnız seçim gövdenin İÇİNDEYSE
   *  okunur; başlık alanındayken araç çubuğu sönük kalır. Değer değişmediyse
   *  state de değişmez — her imleç hareketinde yeniden çizim olmasın. */
  const refreshFmt = useCallback(() => {
    const el = bodyRef.current;
    if (!el || readOnly) return;
    const s = window.getSelection();
    const inside = !!s?.anchorNode && el.contains(s.anchorNode);
    const q = (c: string) => { try { return inside && document.queryCommandState(c); } catch { return false; } };
    let block = "";
    if (inside) {
      try { block = String(document.queryCommandValue("formatBlock") ?? "").toLowerCase(); } catch { /* eski tarayıcı */ }
    }
    const next: Fmt = {
      bold: q("bold"), italic: q("italic"), underline: q("underline"),
      ul: q("insertUnorderedList"), ol: q("insertOrderedList"), block,
    };
    setFmt((prev) =>
      prev.bold === next.bold && prev.italic === next.italic && prev.underline === next.underline &&
      prev.ul === next.ul && prev.ol === next.ol && prev.block === next.block ? prev : next,
    );
  }, [readOnly]);

  useEffect(() => {
    if (readOnly) return;
    document.addEventListener("selectionchange", refreshFmt);
    return () => document.removeEventListener("selectionchange", refreshFmt);
  }, [refreshFmt, readOnly]);

  const save = useCallback(() => {
    if (readOnly) return;
    const body = bodyRef.current?.innerHTML ?? "";
    setError(null);
    startSave(async () => {
      const res = await saveTeamworkDoc(docId, { title: title.trim() || "Adsız yazı", body });
      if ("error" in res) { setError(res.error); return; }
      setDirty(false);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
      router.refresh();
    });
  }, [docId, title, readOnly, router]);

  /** Yazmayı bırakınca kaydet — her tuşta sunucuya gitmeyelim. */
  const touch = useCallback(() => {
    if (readOnly) return;
    setDirty(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(save, 1500);
  }, [save, readOnly]);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  /* Sekme kapanmadan önce uyar — 1,5 sn'lik pencerede kaybolan paragraf
     kullanıcının hatası değildir. */
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function cmd(command: string, value?: string) {
    bodyRef.current?.focus();
    /* styleWithCSS: renk komutları <font color> yerine
       <span style="color:…"> üretsin. Temizleyici `style` içinden yalnız
       color / background-color geçiriyor; <font> hiç izinli değil. */
    if (command === "foreColor" || command === "hiliteColor") {
      try { document.execCommand("styleWithCSS", false, "true"); } catch { /* eski tarayıcı */ }
    }
    document.execCommand(command, false, value);
    touch();
    refreshFmt();
  }

  /** Başlık/alıntı düğmesi: zaten o bloktaysa paragrafa döner (Word'de
   *  ikinci basış biçimi kaldırır). */
  function block(tag: "H2" | "H3" | "BLOCKQUOTE") {
    cmd("formatBlock", fmt.block === tag.toLowerCase() ? "P" : tag);
  }

  /** Seçili metne renk uygular ve paleti kapatır. */
  function applyColor(hex: string) {
    cmd(palette === "mark" ? "hiliteColor" : "foreColor", hex);
    setPalette(null);
  }

  /** Görsel yükler ve imlecin olduğu yere gömer. */
  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setBusyImage(true);
    const fd = new FormData();
    fd.append("file", file);
    void (async () => {
      try {
        const res = await uploadDocImage(fd);
        if ("error" in res) { setError(res.error); return; }
        bodyRef.current?.focus();
        document.execCommand("insertHTML", false, `<img src="${res.url}" alt="" />`);
        touch();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Görsel yüklenemedi.");
      } finally {
        setBusyImage(false);
      }
    })();
  }

  /** Yapıştırma DÜZ METİN. Word'den kopyalanan içerik yüzlerce satır
   *  `mso-` stili taşıyor; sunucu zaten atıyor, kullanıcı da çirkin ara
   *  biçimi hiç görmesin. */
  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    touch();
  }

  /** Word'de açılabilen .doc indir — tek dosya, ek kütüphane yok. */
  function downloadWord() {
    const html =
      `<html xmlns:o="urn:schemas-microsoft-com:office:office" ` +
      `xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">` +
      `<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>` +
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

  return (
    <div className="space-y-3">
      {/* Başlık — belgenin adı, listede bu görünür. */}
      {backSlot && <div className="mb-1">{backSlot}</div>}
      <input
        value={title}
        onChange={(e) => { setTitle(e.target.value); touch(); }}
        onBlur={() => dirty && save()}
        disabled={readOnly}
        aria-label="Yazı başlığı"
        placeholder="Yazı başlığı"
        className="w-full rounded-control border border-transparent bg-transparent px-2 py-1 text-[24px] font-semibold tracking-tight text-ink transition-colors duration-150 placeholder:text-subtle hover:border-line focus:border-brand-ring focus:outline-none focus:ring-2 focus:ring-brand-ring/40 disabled:hover:border-transparent"
      />

      {error && (
        <p role="alert" className="anim-fade-down rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        {/* Araç çubuğu — bir satır, ikon. "Minimum yazı, maksimum kullanılabilir."
            Zemin kartın kendi yüzeyi: gri bir şerit araç çubuğunu "ayrı bir
            panel" gibi gösteriyor, düğme hover'ı da zeminle aynı renge
            düşüp kayboluyordu. */}
        <div role="toolbar" aria-label="Biçim" className="flex flex-wrap items-center gap-0.5 border-b border-hairline px-2 py-1.5">
          {!readOnly && (
            <>
              <Btn icon={Bold} label="Kalın" active={fmt.bold} onClick={() => cmd("bold")} />
              <Btn icon={Italic} label="İtalik" active={fmt.italic} onClick={() => cmd("italic")} />
              <Btn icon={Underline} label="Altı çizili" active={fmt.underline} onClick={() => cmd("underline")} />
              <Sep />
              <Btn icon={Heading1} label="Başlık 1" active={fmt.block === "h2"} onClick={() => block("H2")} />
              <Btn icon={Heading2} label="Başlık 2" active={fmt.block === "h3"} onClick={() => block("H3")} />
              <Btn icon={Quote} label="Alıntı" active={fmt.block === "blockquote"} onClick={() => block("BLOCKQUOTE")} />
              <Sep />
              <Btn icon={List} label="Madde listesi" active={fmt.ul} onClick={() => cmd("insertUnorderedList")} />
              <Btn icon={ListOrdered} label="Numaralı liste" active={fmt.ol} onClick={() => cmd("insertOrderedList")} />
              <Btn
                icon={Link2}
                label="Bağlantı"
                onClick={() => {
                  const url = window.prompt("Bağlantı adresi (https://…)");
                  if (url) cmd("createLink", url);
                }}
              />
              <Btn
                icon={Palette}
                label="Yazı rengi"
                active={palette === "text"}
                onClick={() => setPalette((p) => (p === "text" ? null : "text"))}
              />
              <Btn
                icon={Highlighter}
                label="Vurgu rengi"
                active={palette === "mark"}
                onClick={() => setPalette((p) => (p === "mark" ? null : "mark"))}
              />
              <Btn
                icon={busyImage ? Loader2 : ImagePlus}
                label="Görsel ekle"
                busy={busyImage}
                onClick={() => !busyImage && imageRef.current?.click()}
              />
              <Btn icon={Eraser} label="Biçimi temizle" onClick={() => cmd("removeFormat")} />
              <Sep />
              <Btn icon={Undo2} label="Geri al" onClick={() => cmd("undo")} />
              <Btn icon={Redo2} label="Yinele" onClick={() => cmd("redo")} />
              <Sep />
            </>
          )}
          <Btn icon={FileDown} label="Word olarak indir (.doc)" onClick={downloadWord} />
          <Btn icon={Printer} label="Yazdır / PDF" onClick={() => window.print()} />

          {/* Kaydetme durumu — sağda, tek işaret. */}
          <span className="ml-auto inline-flex items-center gap-1.5 pr-1 text-[12px] text-subtle" aria-live="polite">
            {isSaving ? (
              <><Loader2 size={13} className="animate-spin" aria-hidden /> kaydediliyor</>
            ) : saved ? (
              <><Check size={13} className="text-success" aria-hidden /> kaydedildi</>
            ) : dirty ? (
              "kaydedilmedi"
            ) : readOnly ? (
              "salt okunur"
            ) : null}
          </span>
        </div>

        {/* Renk paleti — araç çubuğunun altında, istenince açılır tek satır. */}
        {palette && !readOnly && (
          <div className="anim-fade-down flex flex-wrap items-center gap-1.5 border-b border-hairline bg-surface-muted px-3 py-2">
            <span className="mr-1 text-[12px] font-medium text-muted">
              {palette === "mark" ? "Vurgu" : "Yazı rengi"}
            </span>
            {DOC_COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyColor(c.hex)}
                title={c.label}
                aria-label={c.label}
                className="tap-target size-6 rounded-full ring-1 ring-inset ring-line transition-[box-shadow] duration-150 hover:ring-2 hover:ring-line-strong"
                style={{ backgroundColor: c.hex }}
              />
            ))}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { cmd("removeFormat"); setPalette(null); }}
              className="ml-1 h-7 rounded-control px-2 text-[12px] font-medium text-muted transition-colors duration-150 hover:bg-surface hover:text-ink"
            >
              Rengi kaldır
            </button>
          </div>
        )}

        <input
          ref={imageRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          className="hidden"
          onChange={onPickImage}
        />

        {/* Yazı alanı — SOLA YASLI, tam genişlik.
            Önce `mx-auto max-w-[68ch]` ile ortalanmış bir sütundu: geniş
            ekranda metin sayfanın ortasında asılı duruyordu (Aslı Hanım,
            2026-08-29: "neden ortadan yazıyor… sayfayı etkin, optimum
            kullan"). Artık kutunun tamamını kullanıyor; okunabilirliği satır
            aralığı ve kenar boşluğu taşıyor. */}
        <div
          ref={bodyRef}
          contentEditable={!readOnly}
          suppressContentEditableWarning
          onInput={touch}
          onBlur={() => dirty && save()}
          onPaste={onPaste}
          onFocus={refreshFmt}
          role="textbox"
          aria-multiline="true"
          aria-label="Yazı gövdesi"
          aria-readonly={readOnly || undefined}
          data-placeholder="Yazmaya başlayın…"
          className={cn(
            "doc-body min-h-[60vh] w-full px-5 py-6 text-[15px] leading-[1.75] text-ink outline-none sm:px-8",
            "[&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-[20px] [&_h2]:font-semibold [&_h2]:tracking-tight",
            "[&_h3]:mb-1.5 [&_h3]:mt-4 [&_h3]:text-[17px] [&_h3]:font-semibold",
            "[&_p]:mb-3 [&_ul]:mb-3 [&_ol]:mb-3 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5",
            "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-line-strong [&_blockquote]:pl-3 [&_blockquote]:text-muted",
            "[&_a]:text-brand [&_a]:underline",
            "[&_img]:my-3 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-card",
            "empty:before:text-subtle empty:before:content-[attr(data-placeholder)]",
          )}
        />
      </div>
    </div>
  );
}

/** Yazı ve vurgu renkleri — kişi paletiyle aynı aile, uygulama tek renk
 *  dilinde kalsın. Serbest renk seçici bilerek yok: on renk yeter, seçici
 *  her yazıya farklı bir ton sokup belgeleri birbirine benzemez yapıyordu. */
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

/** Araç çubuğu düğmesi — eşit kare (32px), seçiliyken marka zemini.
 *  Bileşen DIŞARIDA tanımlı: render içinde tanımlanan bileşen her çizimde
 *  yeniden yaratılır, React ağacı söker ve odak kaçar. */
function Btn({
  icon: Icon, label, active, busy, onClick,
}: { icon: LucideIcon; label: string; active?: boolean; busy?: boolean; onClick: () => void }) {
  return (
    <IconButton
      size="sm"
      aria-label={label}
      title={label}
      aria-pressed={active}
      aria-busy={busy || undefined}
      onMouseDown={(e) => e.preventDefault()}  // seçim kaybolmasın
      onClick={onClick}
      className={cn(active && "bg-brand-soft text-brand-strong hover:bg-brand-soft hover:text-brand-strong")}
    >
      <Icon size={15} className={cn(busy && "animate-spin")} aria-hidden />
    </IconButton>
  );
}

function Sep() {
  return <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line" />;
}

function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
