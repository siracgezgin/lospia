"use client";

import { createContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

/**
 * Present only while the task detail renders INSIDE the drawer. Content can use
 * it to close the sheet instead of navigating: a plain <Link href="/board">
 * would change the URL underneath while Next keeps the (unmatched) @modal slot
 * mounted on soft navigation — the panel would stay open over the board.
 */
export const TaskDrawerContext = createContext<{ close: () => void } | null>(null);

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

  // Close = animate out briefly, then pop the intercepted route.
  const close = useCallback(() => {
    setClosing(true);
    // Match the exit transition so the panel finishes sliding before unmount.
    setTimeout(() => router.back(), 240);
  }, [router]);

  // Escape closes (native, no dependency) + sayfa kaydırma kilidi: çekmece
  // açıkken tekerlek arkadaki panoyu kaydırıyordu; kapatınca kullanıcı bambaşka
  // bir yerde buluyordu kendini.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    document.addEventListener("keydown", onKey);
    const body = document.body;
    const prev = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      body.style.overflow = prev;
    };
  }, [close]);

  // Açılınca odağı panele al — Tab tuşu arkadaki panoda dolaşmasın.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const ctx = useMemo(() => ({ close }), [close]);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Görev detayı">
      {/* Backdrop — fades in via anim-fade, transitions out on close. */}
      <button
        type="button"
        aria-label="Kapat"
        onClick={close}
        className={`absolute inset-0 bg-ink/40 ${
          closing
            ? "opacity-0 transition-opacity duration-200 ease-standard"
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
    </div>
  );
}
