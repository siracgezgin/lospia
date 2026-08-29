"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bold, Italic, Underline, List, ListOrdered, Quote, Heading1, Heading2,
  Link2, Undo2, Redo2, Loader2, Check, FileDown, Printer, Eraser,
  Palette, ImagePlus, Highlighter,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { saveTeamworkDoc, uploadDocImage } from "@/lib/actions/documents";

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

  /* Gövde YALNIZ ilk boyamada yazılır. React her render'da innerHTML'i
     tazelerse imleç her tuş vuruşunda başa atlar — contentEditable'ın klasik
     tuzağı. Sonraki güncellemeler DOM'un kendi işi. */
  useEffect(() => {
    if (bodyRef.current && bodyRef.current.innerHTML === "") {
      bodyRef.current.innerHTML = initialBody || "";
    }
  }, [initialBody]);

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
        placeholder="Yazı başlığı"
        className="w-full rounded-xl border border-transparent bg-transparent px-2 py-1 text-[24px] font-semibold tracking-tight text-ink outline-none transition-colors duration-150 placeholder:text-subtle hover:border-line focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40 disabled:hover:border-transparent"
      />

      {error && (
        <p role="alert" className="anim-fade-down rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-card">
        {/* Araç çubuğu — bir satır, ikon. "Minimum yazı, maksimum kullanılabilir." */}
        <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-surface-muted px-2 py-1.5">
          {!readOnly && (
            <>
              <Btn icon={Bold} label="Kalın" onClick={() => cmd("bold")} />
              <Btn icon={Italic} label="İtalik" onClick={() => cmd("italic")} />
              <Btn icon={Underline} label="Altı çizili" onClick={() => cmd("underline")} />
              <Sep />
              <Btn icon={Heading1} label="Başlık 1" onClick={() => cmd("formatBlock", "H2")} />
              <Btn icon={Heading2} label="Başlık 2" onClick={() => cmd("formatBlock", "H3")} />
              <Btn icon={Quote} label="Alıntı" onClick={() => cmd("formatBlock", "BLOCKQUOTE")} />
              <Sep />
              <Btn icon={List} label="Madde listesi" onClick={() => cmd("insertUnorderedList")} />
              <Btn icon={ListOrdered} label="Numaralı liste" onClick={() => cmd("insertOrderedList")} />
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
                onClick={() => setPalette((p) => (p === "text" ? null : "text"))}
              />
              <Btn
                icon={Highlighter}
                label="Vurgu rengi"
                onClick={() => setPalette((p) => (p === "mark" ? null : "mark"))}
              />
              <Btn
                icon={busyImage ? Loader2 : ImagePlus}
                label="Görsel ekle"
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
          <span className="ml-auto inline-flex items-center gap-1.5 pr-1 text-[12px] text-subtle">
            {isSaving ? (
              <><Loader2 size={13} className="animate-spin" /> kaydediliyor</>
            ) : saved ? (
              <><Check size={13} className="text-success" /> kaydedildi</>
            ) : dirty ? (
              "kaydedilmedi"
            ) : readOnly ? (
              "salt okunur"
            ) : null}
          </span>
        </div>

        {/* Renk paleti — araç çubuğunun altında, istenince açılır tek satır. */}
        {palette && !readOnly && (
          <div className="anim-fade-down flex flex-wrap items-center gap-1.5 border-b border-line bg-surface-muted/60 px-3 py-2">
            <span className="mr-1 text-[11.5px] font-medium text-muted">
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
                className="h-5 w-5 rounded-full ring-1 ring-inset ring-black/15 transition-transform duration-150 hover:scale-110"
                style={{ backgroundColor: c.hex }}
              />
            ))}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { cmd("removeFormat"); setPalette(null); }}
              className="ml-1 rounded-md px-2 py-0.5 text-[12px] font-medium text-subtle transition-colors hover:text-ink"
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
          role="textbox"
          aria-multiline="true"
          aria-label="Yazı gövdesi"
          data-placeholder="Yazmaya başlayın…"
          className={cn(
            "doc-body min-h-[60vh] w-full px-5 py-6 text-[15px] leading-[1.75] text-ink outline-none sm:px-8",
            "[&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-[20px] [&_h2]:font-semibold [&_h2]:tracking-tight",
            "[&_h3]:mb-1.5 [&_h3]:mt-4 [&_h3]:text-[17px] [&_h3]:font-semibold",
            "[&_p]:mb-3 [&_ul]:mb-3 [&_ol]:mb-3 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5",
            "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-line-strong [&_blockquote]:pl-3 [&_blockquote]:text-muted",
            "[&_a]:text-brand [&_a]:underline",
            "[&_img]:my-3 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg",
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

/** Araç çubuğu düğmesi. Bileşen DIŞARIDA tanımlı: render içinde tanımlanan
 *  bileşen her çizimde yeniden yaratılır, React ağacı söker ve odak kaçar. */
function Btn({
  icon: Icon, label, onClick,
}: { icon: typeof Bold; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}  // seçim kaybolmasın
      onClick={onClick}
      title={label}
      aria-label={label}
      className="tap-target rounded-md p-1.5 text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-ink active:scale-95"
    >
      <Icon size={15} />
    </button>
  );
}

function Sep() {
  return <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line" />;
}

function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
