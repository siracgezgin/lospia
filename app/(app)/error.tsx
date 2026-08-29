"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Route-level error boundary for the whole authenticated area.
 *
 * A thrown error in any page/Client Component (e.g. a bad date value on the
 * calendar) is caught here and rendered as a recoverable panel instead of
 * Safari's blank "This page couldn't load". `reset()` re-renders the segment.
 * Teknik hata metni kullanıcıya gösterilmez; yalnız konsola yazılır.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for diagnostics; never blocks the recovery UI.
    console.error("App route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-full items-center justify-center p-6 sm:p-8">
      <div className="anim-fade-up w-full max-w-md rounded-card border border-line bg-surface p-6 text-center shadow-card sm:p-8">
        <div className="mx-auto mb-4 grid h-10 w-10 place-items-center rounded-full bg-danger/10 text-danger">
          <AlertTriangle size={18} strokeWidth={1.75} aria-hidden />
        </div>
        <h2 className="text-[16px] font-semibold tracking-tight text-ink">Bu ekran açılamadı.</h2>
        <p className="mx-auto mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-muted">
          Beklenmeyen bir hata oluştu. Tekrar denemek genellikle çözer.
        </p>
        <Button onClick={() => reset()} className="mt-5">
          <RotateCcw size={14} aria-hidden />
          Tekrar dene
        </Button>
      </div>
    </div>
  );
}
