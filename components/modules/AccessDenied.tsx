import Link from "next/link";
import { ShieldAlert, ArrowLeft } from "lucide-react";

/**
 * Shown when a non-admin lands on an admin-only Operasyon Modülleri route
 * (directly by URL). We prefer a clear 403-style screen over a silent redirect
 * so a wrong permission is understandable, then point the user back to their
 * daily work.
 */
export function AccessDenied() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg items-center justify-center px-4 py-16">
      <div className="w-full rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand">
          <ShieldAlert size={22} />
        </div>
        <h1 className="text-lg font-semibold text-ink">Bu alan yalnızca yöneticilere açıktır.</h1>
        <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-muted">
          Günlük görevlerinize Pano veya Liste ekranından devam edebilirsiniz.
        </p>
        <Link
          href="/board"
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-strong"
        >
          <ArrowLeft size={15} />
          Panoya dön
        </Link>
      </div>
    </div>
  );
}
