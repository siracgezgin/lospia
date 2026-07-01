import Link from "next/link";
import { ArrowUpRight, Clock } from "lucide-react";
import { getDepartmentCardStyle } from "@/lib/design/semantics";
import { cn } from "@/lib/utils/cn";
import type { DepartmentModule } from "@/lib/modules/registry";

interface Props {
  department: DepartmentModule;
  /** Live counts (0 when the department has no tasks yet). */
  activeCount: number;
  overdueCount: number;
  isAdmin: boolean;
}

/**
 * A department tile for the Operasyon Modülleri hub. Colour comes from the AF
 * department family (a left colour strip, not a border-l — avoids the
 * tailwind-merge accent bug and keeps the corners clean). Light summary chips
 * show active/overdue work; module links jump into the relevant area.
 */
export function DepartmentCard({ department, activeCount, overdueCount, isAdmin }: Props) {
  const style = getDepartmentCardStyle(department.colorKey);
  const links = department.links.filter((l) => !l.adminOnly || isAdmin);

  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      {/* Left department colour strip (dot bg applied directly — no cn merge). */}
      <span className={`absolute left-0 top-0 h-full w-1.5 ${style.dot}`} aria-hidden />

      <div className="flex flex-col gap-3 p-5 pl-6">
        {/* Header */}
        <div className="space-y-1">
          <h3 className="text-[15px] font-semibold text-ink leading-snug">{department.title}</h3>
          <p className="text-[12.5px] leading-relaxed text-muted">{department.description}</p>
        </div>

        {/* Light summaries */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium", style.chip)}>
            {activeCount} aktif iş
          </span>
          {overdueCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-[#fbe6e2] px-2 py-0.5 text-[11px] font-medium text-[#a83a2c]">
              <Clock size={11} />
              {overdueCount} geciken
            </span>
          )}
        </div>

        {/* Module links */}
        <ul className="mt-1 space-y-0.5 border-t border-hairline pt-2.5">
          {links.map((link) => (
            <li key={`${department.key}-${link.label}`}>
              <Link
                href={link.href}
                className="group flex items-center justify-between rounded-lg px-2 py-1.5 -mx-1 text-[13px] text-muted transition-colors hover:bg-surface-muted hover:text-ink"
              >
                <span className="flex items-center gap-2 truncate">
                  <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", style.dot)} />
                  <span className="truncate">{link.label}</span>
                  {link.readiness === "prep" && (
                    <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wide text-subtle">
                      Hazırlık
                    </span>
                  )}
                </span>
                <ArrowUpRight size={14} className="shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
