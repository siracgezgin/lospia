import Link from "next/link";
import { cn } from "@/lib/utils/cn";

/**
 * DashboardMetricCard — the single KPI/metric card used across the admin
 * dashboard, member dashboard and the points section. Pure presentation:
 * data, tone and target are decided by the caller.
 *
 * Greens stay hex on purpose: #1c7a52 belongs to the reserved done-green
 * family and #3a8f63 to the review-mint family (see lib/design/semantics.ts).
 */

export type MetricTone = "neutral" | "brand" | "danger" | "warning" | "success" | "review";

const TONE_TEXT: Record<MetricTone, string> = {
  neutral: "text-ink",
  brand:   "text-brand",
  danger:  "text-danger",
  warning: "text-warning",
  success: "text-[#1c7a52]",
  review:  "text-[#3a8f63]",
};

export function DashboardMetricCard({
  icon,
  label,
  value,
  tone = "neutral",
  href,
  title,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number | string;
  tone?: MetricTone;
  href?: string;
  title?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center gap-2 text-subtle">
        {icon}
        <span className="text-xs font-medium text-muted">{label}</span>
      </div>
      <p className={cn("mt-2 text-3xl font-semibold tabular-nums", TONE_TEXT[tone])}>{value}</p>
    </>
  );
  const base = "block rounded-card border border-line bg-surface shadow-card p-4";
  return href ? (
    <Link
      href={href}
      title={title}
      className={cn(
        base,
        "transition-[border-color,background-color,box-shadow] duration-[var(--duration-fast)] ease-standard",
        "hover:border-line-strong hover:bg-surface-hover hover:shadow-card-hover",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring/40 focus-visible:ring-offset-1",
      )}
    >
      {inner}
    </Link>
  ) : (
    <div title={title} className={base}>
      {inner}
    </div>
  );
}
