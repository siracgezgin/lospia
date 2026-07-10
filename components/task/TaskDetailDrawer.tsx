"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

/**
 * TaskDetailDrawer — right-side sheet used by the intercepting route
 * (@modal/(.)tasks/[id]). The Board/List stays mounted behind a dim backdrop;
 * the task detail slides in from the right. Closing = router.back(), which pops
 * the intercepted /tasks/[id] URL and unmounts this slot (so browser Back closes
 * it too). A direct hit on /tasks/[id] never reaches here — it renders the full
 * page instead.
 *
 * No new dependency: pure Tailwind + a CSS transform transition.
 */
export function TaskDetailDrawer({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Enter animation: mount closed (off-screen), then flip to open on the next
  // frame so the transform transition runs.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Close = animate out briefly, then pop the intercepted route.
  const close = useCallback(() => {
    setOpen(false);
    // Match the CSS duration so the panel finishes sliding before we unmount.
    setTimeout(() => router.back(), 200);
  }, [router]);

  // Escape closes (native, no dependency).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Görev detayı">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Kapat"
        onClick={close}
        className={`absolute inset-0 bg-ink/25 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Right panel — full width on mobile, a fixed-max sheet on desktop. */}
      <div
        className={`absolute inset-y-0 right-0 flex w-full flex-col bg-surface border-l border-line shadow-[var(--shadow-drawer)] transition-transform duration-200 ease-out will-change-transform sm:w-[min(720px,100vw)] lg:w-[min(760px,calc(100vw-260px))] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Close affordance — pinned; TaskDetail keeps its own "Panoya dön" link. */}
        <button
          type="button"
          onClick={close}
          aria-label="Kapat"
          className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-surface/90 backdrop-blur text-muted hover:text-ink hover:bg-surface-muted border border-line shadow-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring/60"
        >
          <X size={16} />
        </button>

        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
