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
      <div className="anim-fade-up w-full rounded-card border border-line bg-surface p-6 text-center shadow-card sm:p-8">
        <div className="mx-auto mb-4 grid h-10 w-10 place-items-center rounded-full bg-surface-sunken text-muted">
          <ShieldAlert size={18} strokeWidth={1.75} aria-hidden />
        </div>
        <h1 className="text-[16px] font-semibold tracking-tight text-ink">Bu alan yalnızca yöneticilere açık.</h1>
        <p className="mx-auto mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-muted">
          Günlük işlerinize Ana Sayfa&apos;dan devam edebilirsiniz.
        </p>
        <Link
          href="/home"
          className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-control bg-brand px-3.5 text-[13.5px] font-medium text-white shadow-xs transition-[background-color,transform] duration-150 ease-standard hover:bg-brand-strong active:scale-[0.98]"
        >
          <ArrowLeft size={15} aria-hidden />
          Ana Sayfa&apos;ya dön
        </Link>
      </div>
    </div>
  );
}
