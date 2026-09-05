"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * ÖRTÜ KATMANI — uygulamadaki BÜTÜN pop-up'ların tek gövdesi.
 *
 * Sıraç (2026-08-29): "Pop-up'lar çok kötü mesela, baştan responsive
 * profesyonelce tasarla… bu ürünü designer kullanacak, en ufak çizgi bile çok
 * fark ettiriyor."
 *
 * Öncesinde on bir ayrı diyalog vardı ve HİÇBİRİ birbirine benzemiyordu:
 *   • arka plan dört ayrı tonda (siyah %30 · %40 · %70 · ink %30),
 *   • bulanıklık kiminde var kiminde yok,
 *   • dolgu p-4 / p-6 / p-4 sm:p-8,
 *   • Esc on birinin yalnız üçünde kapatıyordu,
 *   • hiçbiri arkadaki sayfanın kaymasını durdurmuyordu,
 *   • hiçbiri PORTAL kullanmıyordu.
 *
 * Sonuncusu görünür bir hataydı: `position: fixed` en yakın DÖNÜŞTÜRÜLMÜŞ
 * (transform/filter/animation) atasına göre çözülür. Üretim föyünde galeri
 * görselinin büyütmesi böyle sayfanın içine sıkışıp taşıyordu. Portal ile
 * katman <body>'ye taşınır; hangi kartın içinde açıldığı artık önemli değil.
 *
 * Mobilde alttan gelen yaprak (sheet), masaüstünde ortada kart — aynı bileşen.
 */

type Size = "sm" | "md" | "lg";

const WIDTH: Record<Size, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-3xl",
};

/** SSR'de portal yok; ilk boyamada `document` yokken çizmemek için. */
const subscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

/** Açık diyalog sayısı — iç içe açılanlarda kilidi erken açmamak için. */
let lockCount = 0;
/* Kilit AÇILMADAN ÖNCEKİ body.overflow — MODÜL düzeyinde, kilit 0→1'e
   geçerken BİR KEZ saklanır. Örnek başına saklanınca şu tuzak vardı: dış
   pencere, iç pencere (onay kutusu) açıkken bir kez yeniden render olursa
   effect'i baştan kuruluyor ve "önceki değer" olarak artık "hidden" okuyordu;
   ikisi de kapanınca body "hidden" kalıyor, sayfa BİR DAHA kaydırılamıyordu. */
let savedOverflow = "";

/** Çekmece gibi Overlay dışı katmanlar da aynı sayaca katılsın diye dışa
 *  açık: kilidi al / bırak. (bkz. components/layout/MobileNav) */
export function lockBodyScroll(): () => void {
  const body = document.body;
  if (lockCount === 0) {
    savedOverflow = body.style.overflow;
    body.style.overflow = "hidden";
  }
  lockCount++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) body.style.overflow = savedOverflow;
  };
}
/** Açık pencereler. Esc ve odak tuzağı YALNIZ EN ÜSTTEKİNE aittir; alttakiler
 *  sessiz kalır. "En üstteki" DOM SIRASINDAN okunur (portal düğümleri body'ye
 *  açılış sırasıyla eklenir) — bir dizi/yığın tutmak yanıltıcı olurdu: alttaki
 *  pencere yeniden çizilince kendini yığının tepesine taşır ve Esc'i çalardı. */
const openPanels = new Set<HTMLDivElement>();

function isTopmostOverlay(panel: HTMLDivElement | null): boolean {
  if (!panel) return false;
  for (const other of openPanels) {
    if (other === panel) continue;
    const after = (panel.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    if (after) return false;
  }
  return true;
}

export interface OverlayProps {
  open: boolean;
  onClose: () => void;
  /** Başlık satırı. Boşsa üst çubuk hiç çizilmez (görsel büyütme gibi). */
  title?: string;
  /** Düz metin yerine zengin başlık (ör. düzenlenebilir saat alanı). Kapatma
   *  düğmesi ve çerçeve yine ortak kalır. */
  titleNode?: React.ReactNode;
  /** Başlığın altındaki tek satırlık açıklama. Zorunlu değil — çoğu diyalogda
   *  gereksizdir; başlık zaten söylüyor. */
  hint?: string;
  /** Alt eylem çubuğu. Gövde kaydırılırken burası SABİT kalır. */
  footer?: React.ReactNode;
  size?: Size;
  /** Arka plana tıklayınca kapanmasın (veri girilen uzun formlarda). */
  dismissOnBackdrop?: boolean;
  /** Başlık çubuğu YOKKEN sağ üste yüzen kapatma düğmesi (görsel büyütme). */
  floatingClose?: boolean;
  className?: string;
  /** Gövde sınıfları — liste tipi içerikte dolguyu kaldırmak için
   *  (`p-0`); varsayılan `px-5 py-4`. */
  bodyClassName?: string;
  children?: React.ReactNode;
}

export function Overlay({
  open,
  onClose,
  title,
  titleNode,
  hint,
  footer,
  size = "md",
  dismissOnBackdrop = true,
  floatingClose = false,
  className,
  bodyClassName,
  children,
}: OverlayProps) {
  const mounted = useMounted();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  /* KAPANIŞ ANİMASYONU.
     Pop-up açılırken canlanıyor ama kapanırken BİR ANDA yok oluyordu
     (Sıraç, 2026-08-30: "pop-up açılırken kapanırken responsive olmuyor").
     Sebebi: `open` false olur olmaz bileşen null dönüyordu. Artık katman
     çıkış animasyonu bitene kadar DOM'da kalır, sonra sökülür.

     Durum RENDER sırasında uyarlanır (React'in "prop değişince state'i
     düzelt" deseni), effect içinde DEĞİL: effect'te senkron setState hem
     basamaklı render uyarısı veriyor hem de projenin lint kuralına takılıyor
     (bkz. AppSidebar daraltma tercihi). */
  const [prevOpen, setPrevOpen] = useState(open);
  const [closing, setClosing] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    setClosing(prevOpen && !open);
  }
  const render = open || closing;

  useEffect(() => {
    if (!closing) return;
    // Hareket azaltma açıksa bekleme yok — anında kapanır.
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => setClosing(false), reduce ? 0 : 170);
    return () => window.clearTimeout(t);
  }, [closing]);

  // Esc + sayfa kaydırma kilidi. Arkadaki liste kayıyordu; diyalogu kapatınca
  // kullanıcı bambaşka bir yerde buluyordu kendini.
  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      /* İÇ İÇE PENCERELERDE YALNIZ EN ÜSTTEKİ cevap verir. Dinleyici
         `document` üzerinde olduğu için Esc AÇIK OLAN HER pencereyi birden
         kapatıyordu (ör. föy içinden açılan onay kutusunda Esc, onayla
         birlikte föy penceresini de kapatıyordu). */
      if (!isTopmostOverlay(panelRef.current)) return;

      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      /* ODAK TUZAĞI. Esc ve kaydırma kilidi vardı ama Tab tuşu katmanın
         DIŞINA çıkabiliyordu: pencere açıkken klavye kullanıcısı arkadaki
         sayfanın bağlantılarında dolaşıyor, ekran okuyucu "modal" derken imleç
         başka yerde oluyordu. Tab artık pencerenin içinde döner. */
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusables.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;
      if (!panel.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    const panel = panelRef.current;
    if (panel) openPanels.add(panel);
    document.addEventListener("keydown", onKey);

    const releaseScroll = lockBodyScroll();

    return () => {
      document.removeEventListener("keydown", onKey);
      if (panel) openPanels.delete(panel);
      releaseScroll();
    };
  }, [open, onClose]);

  // Açılınca odağı içeri al — Tab tuşu arkadaki sayfada dolaşmasın.
  useEffect(() => {
    if (!open) return;
    const first = panelRef.current?.querySelector<HTMLElement>(
      "input, select, textarea, button:not([data-overlay-close]), [href], [tabindex]:not([tabindex='-1'])",
    );
    (first ?? panelRef.current)?.focus();
  }, [open]);

  if (!render || !mounted) return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-end justify-center bg-ink/50 sm:items-center sm:p-6",
        // Kapanırken tıklamayı YUTMASIN: çıkış animasyonu sürerken (~170ms)
        // katman hâlâ ekranı kaplıyor; altındaki düğmeye basan kullanıcı
        // "tıklamam gitmedi" yaşıyordu.
        closing ? "anim-fade-out pointer-events-none" : "anim-fade",
      )}
      onMouseDown={(e) => {
        // mousedown: form içinde metin seçip dışarıda bırakınca kapanmasın.
        if (dismissOnBackdrop && e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      /* Ad: h2 çiziliyorsa ona bağlan; `titleNode` verilmişse (h2 yok) düz
         metin `title` ad olarak kullanılır. Eskiden titleNode'lu pencereler
         ekran okuyucuya "Pencere" diye açılıyordu. */
      aria-labelledby={title && !titleNode ? titleId : undefined}
      aria-label={title && !titleNode ? undefined : (title ?? "Pencere")}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          // Mobil: alttan yaprak, üst köşeler yuvarlak, ekranın çoğu.
          // Masaüstü: ortada kart.
          "relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-modal border border-line bg-surface shadow-drawer outline-none",
          "sm:max-h-[86dvh] sm:rounded-modal",
          closing ? "anim-slide-down sm:anim-scale-out" : "anim-slide-up sm:anim-scale-in",
          WIDTH[size],
          className,
        )}
      >
        {!title && !titleNode && floatingClose && (
          <button
            data-overlay-close
            onClick={onClose}
            aria-label="Kapat"
            className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-surface text-ink shadow-pop transition-transform duration-150 hover:bg-surface-muted active:scale-95"
          >
            <X size={17} strokeWidth={2} />
          </button>
        )}

        {(title || titleNode) && (
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
            <div className="min-w-0">
              {titleNode ?? (
                <h2 id={titleId} className="truncate text-[15px] font-semibold tracking-tight text-ink">
                  {title}
                </h2>
              )}
              {hint && <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{hint}</p>}
            </div>
            <button
              data-overlay-close
              onClick={onClose}
              aria-label="Kapat"
              className="tap-target -mr-2 -mt-1 grid size-9 shrink-0 place-items-center rounded-control text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
            >
              <X size={17} strokeWidth={2} />
            </button>
          </div>
        )}

        {/* Gövde tek kaydırılan yer — alt eylem çubuğu hep görünür kalır.
            Eskiden uzun formlarda "Kaydet" ekranın altına düşüyordu. */}
        <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4", bodyClassName)}>{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-muted/60 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
