"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";

/**
 * Route-level error boundary for the whole authenticated area.
 *
 * A thrown error in any page/Client Component (e.g. a bad date value on the
 * calendar) is caught here and rendered as a recoverable panel instead of
 * Safari's blank "This page couldn't load". `reset()` re-renders the segment.
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
    <div className="min-h-full flex items-center justify-center p-8">
      <div className="max-w-md w-full bg-white border border-gray-200 rounded-xl p-8 text-center space-y-4 shadow-sm">
        <div className="text-3xl">😕</div>
        <h2 className="text-lg font-semibold text-gray-900">Bir şeyler ters gitti</h2>
        <p className="text-sm text-gray-500">
          Bu bölüm yüklenirken beklenmeyen bir hata oluştu. Tekrar denemek sorunu
          genellikle çözer.
        </p>
        <button
          onClick={() => reset()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <RotateCcw size={14} />
          Tekrar dene
        </button>
      </div>
    </div>
  );
}
