"use client";

import { createContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useConfirm } from "@/components/ui/useConfirm";
import { lockBodyScroll } from "@/components/ui/Overlay";

/**
 * Present only while the task detail renders INSIDE the drawer. Content can use
 * it to close the sheet instead of navigating: a plain <Link href="/board">
 * would change the URL underneath while Next keeps the (unmatched) @modal slot
 * mounted on soft navigation — the panel would stay open over the board.
 *
 * `setDirty` — içerik kaydedilmemiş bir düzenleme taşıdığını bildirir; çekmece
 * kapanmadan önce onay sorar. Kaydedilmemiş başlık/açıklama, Esc'e ya da arka
 * plana dokunulduğunda uyarısız gidiyordu.
 */
export const TaskDrawerContext = createContext<{
  close: () => void;
  setDirty: (_dirty: boolean) => void;
} | null>(null);

/** En son sökülen çekmecenin kimliği ve zamanı — iskelet→içerik geçişini
 *  ayırt etmek için (aynı commit, aradaki fark ~0ms). Kimlik de gerekir:
 *  geliştirme kipindeki StrictMode aynı bileşeni bir kez söküp yeniden kurar,
 *  o durumda "geçiş" yoktur ve açılış animasyonu oynamalıdır. */
let drawerHandoffAt = 0;
let drawerHandoffFrom: object | null = null;

/* Sunucuda layout effect çalışmaz; uyarıyı da doğurmasın diye ortam başına
   tek seferlik seçim (yaygın "isomorphic layout effect" deseni). */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Odak tuzağında gezilebilir öğeler. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * TaskDetailDrawer — right-side sheet used by the intercepting route
 * (@modal/(.)tasks/[id]). The Board/List stays mounted behind a dim backdrop;
 * the task detail slides in from the right. Closing = router.back(), which pops
 * the intercepted /tasks/[id] URL and unmounts this slot (so browser Back closes
 * it too). A direct hit on /tasks/[id] never reaches here — it renders the full
 * page instead.
 *
 * Neden Overlay değil: Overlay ortalanmış diyalog / mobil alt yaprak çizer;
 * bu yüzey SAĞDAN açılan, panoyu arkada bırakan bir çekmecedir ve kendi
 * geometrisi var (anim-drawer-in, 720–760px). Katman elle kurulur ama Overlay'in
 * sağladığı üç şey burada da var: Esc, odak içeri, sayfa kaydırma kilidi.
 *
 * Motion: entry uses the shared anim-drawer-in / anim-fade utilities; exit swaps
 * to a CSS transition (animation classes removed → transform transitions out).
 * No new dependency: pure Tailwind + CSS.
 */
export function TaskDetailDrawer({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const { ask, dialog } = useConfirm();

  /* Kaydedilmemiş düzenleme bayrağı — içerik (TaskDetail) tazeler. Ref, çünkü
     her tuş vuruşunda çekmeceyi yeniden çizmesinin anlamı yok. */
  const dirtyRef = useRef(false);
  const askingRef = useRef(false);
  const setDirty = useCallback((dirty: boolean) => { dirtyRef.current = dirty; }, []);

  /* KAPANIŞ TEK SEFERLİKTİR.
     Çıkış animasyonu sürerken (240ms) Esc, arka plan ve kapatma düğmesi hâlâ
     etkindi: iki hızlı Esc ya da arka plana çift tıklama İKİ `router.back()`
     çalıştırıyor, kullanıcı panodan da geri atılıp bambaşka bir sayfada
     buluyordu kendini. */
  const closingRef = useRef(false);
  /* Bu çekmece örneğinin değişmez kimliği (bkz. drawerHandoffFrom). */
  const instanceRef = useRef({});
  /* Bekleyen `router.back()` zamanlayıcısı. Bileşen sökülürken ORTADA
     BIRAKILMAZ: iskelet çekmecesi (loading.tsx) gerçek içerik akınca sökülür ve
     ölü bir zamanlayıcı 240ms sonra, artık bambaşka bir gezinmenin üstüne
     "geri" basabiliyordu. Sökülürken bekleyen kapatma İSTEĞİ kaybolmasın diye
     hemen yürütülür (Esc'e iskelet dururken basan kullanıcı yine kapanır),
     ama gecikmeli/sahipsiz bir geri adım kalmaz. */
  const backTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routerRef = useRef(router);
  useEffect(() => { routerRef.current = router; }, [router]);

  // Close = animate out briefly, then pop the intercepted route.
  const finishClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    // Match the exit transition so the panel finishes sliding before unmount.
    backTimer.current = setTimeout(() => {
      backTimer.current = null;
      router.back();
    }, 240);
  }, [router]);

  useEffect(() => () => {
    const pending = backTimer.current;
    if (!pending) return;
    clearTimeout(pending);
    backTimer.current = null;
    routerRef.current.back();
  }, []);

  const close = useCallback(() => {
    if (closingRef.current || askingRef.current) return;
    if (!dirtyRef.current) { finishClose(); return; }
    askingRef.current = true;
    void (async () => {
      const ok = await ask({
        title: "Kaydedilmemiş değişiklikler",
        message: "Bu görevde kaydetmediğiniz değişiklikler var. Kapatırsanız kaybolur.",
        confirmLabel: "Kaydetmeden kapat",
        cancelLabel: "Düzenlemeye dön",
        tone: "danger",
      });
      askingRef.current = false;
      if (ok) { dirtyRef.current = false; finishClose(); }
    })();
  }, [ask, finishClose]);

  /* Başka bir pop-up (onay penceresi, görsel büyütme…) açıkken Esc onu
     kapatmalı, çekmeceyi değil. Overlay <body>'ye portal ile çizildiği için
     kendi kökümüzün DIŞINDA bir aria-modal aramak yeterli. */
  const nestedDialogOpen = useCallback(() => {
    const root = rootRef.current;
    if (!root) return false;
    return Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]'))
      .some((el) => el !== root && !root.contains(el));
  }, []);

  // Escape closes (native, no dependency) + ODAK TUZAĞI (Tab panelden çıkmaz)
  // + sayfa kaydırma kilidi: çekmece açıkken tekerlek arkadaki panoyu
  // kaydırıyordu; kapatınca kullanıcı bambaşka bir yerde buluyordu kendini.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // İçerideki bir açılır kutu ya da düzenleme alanı Esc'i zaten
        // kullandıysa (preventDefault) çekmece kapanmaz.
        if (e.defaultPrevented || nestedDialogOpen()) return;
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel || nestedDialogOpen()) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !panel.contains(active)) {
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
    document.addEventListener("keydown", onKey);
    /* KAYDIRMA KİLİDİ TEK SAYAÇTAN geçer (ortak pop-up katmanıyla aynı).
       Çekmece kendi sayacını tutarken iki mekanizma aynı `body.overflow`
       değerini yazıyordu: çekmeceden ÖNCE açılmış bir pop-up kapanınca kilit
       düşüyor, çekmece kapanınca da body kalıcı olarak "hidden" kalıyor,
       sayfa yenilenmeden bir daha kaydırılamıyordu. Sayaç tek olduğu için
       iskelet→içerik geçişinde de (iki çekmece bir an iç içe) kilit düşmez. */
    const releaseScroll = lockBodyScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      releaseScroll();
    };
  }, [close, nestedDialogOpen]);

  /* İSKELETTEN GERÇEK İÇERİĞE GEÇİŞ TEK BİR AÇILIŞTIR.
     `loading.tsx` kendi çekmecesini çiziyor; sunucu içeriği akınca o ağaç
     sökülüp bu ağaç kuruluyor. Aynı commit'te olduğu için "az önce bir çekmece
     söküldü mü?" sorusu geçişi ayırt etmeye yeter: öyleyse giriş animasyonu
     İKİNCİ KEZ oynamaz (çekmece bir daha sağdan içeri kaymaz) ve odak yeniden
     çalınmaz. Sınıf DOM'dan tek seferde alınır; React className'i yalnız değer
     değiştiğinde yazdığı için sonraki çizimlerde geri gelmez. */
  useIsomorphicLayoutEffect(() => {
    const self = instanceRef.current;
    const handoff =
      drawerHandoffFrom !== null && drawerHandoffFrom !== self && Date.now() - drawerHandoffAt < 150;
    if (handoff) {
      panelRef.current?.classList.remove("anim-drawer-in");
      backdropRef.current?.classList.remove("anim-fade");
    } else {
      // Açılınca odağı panele al — Tab tuşu arkadaki panoda dolaşmasın.
      panelRef.current?.focus();
    }
    return () => {
      drawerHandoffAt = Date.now();
      drawerHandoffFrom = self;
    };
  }, []);

  const ctx = useMemo(() => ({ close, setDirty }), [close, setDirty]);

  return (
    <div ref={rootRef} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Görev detayı">
      {/* Backdrop — fades in via anim-fade, transitions out on close. */}
      <button
        ref={backdropRef}
        type="button"
        aria-label="Kapat"
        onClick={close}
        disabled={closing}
        className={`absolute inset-0 bg-ink/40 ${
          closing
            ? "pointer-events-none opacity-0 transition-opacity duration-200 ease-standard"
            : "anim-fade"
        }`}
      />

      {/* Right panel — full width on mobile, a fixed-max sheet on desktop. */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`absolute inset-y-0 right-0 flex w-full flex-col bg-surface border-l border-line shadow-drawer outline-none will-change-transform sm:w-[min(720px,100vw)] lg:w-[min(760px,calc(100vw-260px))] ${
          closing
            ? "translate-x-full transition-transform duration-[240ms] ease-emphasized"
            : "anim-drawer-in"
        }`}
      >
        {/* Close affordance — pinned. Must sit ABOVE the content's own sticky
            action bar (z-20), which otherwise paints over it; the bar reserves
            room on its right (pr-12) so the two never overlap. Düz yüzey:
            arkasını bulanıklaştıran katman kaldırıldı (backdrop-filter yasak). */}
        <button
          type="button"
          onClick={close}
          disabled={closing}
          aria-label="Kapat"
          className="tap-target absolute right-3 top-3 z-40 grid size-9 place-items-center rounded-full bg-surface text-muted border border-line shadow-card transition-[background-color,border-color,color] duration-150 ease-standard hover:text-ink hover:bg-surface-muted hover:border-line-strong active:scale-95"
        >
          <X size={16} />
        </button>

        <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
          <TaskDrawerContext.Provider value={ctx}>
            {children}
          </TaskDrawerContext.Provider>
        </div>
      </div>

      {/* Kaydedilmemiş değişiklik onayı — ortak pop-up. */}
      {dialog}
    </div>
  );
}
