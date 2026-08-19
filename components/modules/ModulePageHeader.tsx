import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Props {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Optional small pill next to the title (e.g. "Yönetici alanı"). */
  badge?: string;
  /** Primary back target — defaults to Home Page (her role açık, çıkmaz yok). */
  backHref?: string;
  backLabel?: string;
  /** Optional secondary back link (e.g. "Panoya dön"). */
  secondaryBackHref?: string;
  secondaryBackLabel?: string;
  /** Optional right-aligned actions (buttons, filters). */
  rightSlot?: React.ReactNode;
}

/**
 * Shared header for the Operasyon Modülleri screens. Gives every module a
 * consistent, professional shell: a small "← geri dön" row on top, then the
 * icon + title + description, with an optional right-hand action slot. Keeps the
 * AF design language (soft brand chip, muted text) and never lets a module page
 * dead-end.
 */
export function ModulePageHeader({
  title,
  description,
  icon: Icon,
  badge,
  backHref = "/home",
  backLabel = "Home Page’e dön",
  secondaryBackHref,
  secondaryBackLabel = "Panoya dön",
  rightSlot,
}: Props) {
  return (
    <div className="mb-5">
      {/* Back navigation row */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        <Link
          href={backHref}
          className="group inline-flex items-center gap-1.5 text-muted transition-colors duration-150 hover:text-ink"
        >
          <ArrowLeft size={14} className="shrink-0 transition-transform duration-150 ease-standard group-hover:-translate-x-0.5" />
          {backLabel}
        </Link>
        {secondaryBackHref && (
          <>
            <span className="text-subtle">·</span>
            <Link
              href={secondaryBackHref}
              className="text-subtle transition-colors duration-150 hover:text-ink"
            >
              {secondaryBackLabel}
            </Link>
          </>
        )}
      </div>

      {/* Title row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
              <Icon size={18} />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
              {badge && (
                <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-strong">
                  {badge}
                </span>
              )}
            </div>
            {description && (
              <p className="mt-0.5 text-sm text-muted">{description}</p>
            )}
          </div>
        </div>
        {rightSlot && <div className="flex shrink-0 items-center gap-2">{rightSlot}</div>}
      </div>
    </div>
  );
}
