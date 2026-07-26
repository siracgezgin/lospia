"use client";

import { Fragment } from "react";
import type { LucideIcon } from "lucide-react";
import {
  LayoutList,
  UserCheck,
  CalendarDays,
  Clock,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

// ── Shared task-view vocabulary ──────────────────────────────────────────────
// A single source of truth for the six operational views so Board and List speak
// the SAME language (label + icon) and read identically. This file is purely
// PRESENTATIONAL: it renders the segmented tab strip and owns the label/icon
// mapping. All data/filter semantics stay in each surface (KanbanBoard's
// applyViewFilter, TaskListView's applyListView) — nothing here filters tasks.

export type ViewSlug =
  | "all"
  | "mine"
  | "this-week"
  | "overdue"
  | "done"
  | "waiting-approval";

export const VIEW_META: Record<ViewSlug, { label: string; icon: LucideIcon }> = {
  "all":              { label: "Tüm işler",        icon: LayoutList },
  "mine":             { label: "Bana atananlar",   icon: UserCheck },
  "this-week":        { label: "Bu hafta",         icon: CalendarDays },
  "overdue":          { label: "Gecikenler",       icon: Clock },
  "done":             { label: "Tamamlananlar",    icon: CheckCircle2 },
  "waiting-approval": { label: "Onay bekleyenler", icon: ShieldCheck },
};

// The canonical ordering used when a surface builds the full strip itself.
export const VIEW_ORDER: ViewSlug[] = [
  "all",
  "mine",
  "this-week",
  "overdue",
  "done",
  "waiting-approval",
];

export type ViewTabItem = {
  slug: string;
  label: string;
  icon?: LucideIcon;
  active: boolean;
  /** Draw a slim divider before this tab (used to set "Bu hafta" apart). */
  dividerBefore?: boolean;
};

interface Props {
  items: ViewTabItem[];
  /** Link mode — renders <a href>. Used by the Board (full navigation). */
  getHref?: (_slug: string) => string;
  /** Button mode — client-side selection. Used by the List (keeps other filters). */
  onSelect?: (_slug: string) => void;
  className?: string;
  /** Show the leading icon on every tab (default: only the divided "Bu hafta"). */
  iconsEverywhere?: boolean;
}

const BASE_TAB =
  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 min-h-10 md:min-h-0 text-[13px] font-medium whitespace-nowrap border " +
  "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-standard active:scale-[0.98]";
const ACTIVE_TAB = "bg-brand-soft text-brand-strong border-brand-ring shadow-xs";
const INACTIVE_TAB =
  "text-muted border-transparent hover:bg-surface-hover hover:text-ink";

/**
 * ViewTabs — segmented, Monday-style toolbar of the six task views, shared by
 * Board and List so the two surfaces are visually and semantically identical.
 */
export function ViewTabs({ items, getHref, onSelect, className, iconsEverywhere }: Props) {
  return (
    <div className={cn("flex items-center gap-1 overflow-x-auto no-scrollbar", className)}>
      {items.map((item) => {
        const Icon = item.icon;
        const showIcon = Icon && (iconsEverywhere || item.dividerBefore);
        const cls = cn(BASE_TAB, item.active ? ACTIVE_TAB : INACTIVE_TAB);
        const inner = (
          <>
            {showIcon && Icon && <Icon size={14} className="shrink-0" />}
            {item.label}
          </>
        );
        return (
          <Fragment key={item.slug}>
            {item.dividerBefore && (
              <span aria-hidden className="mx-1 h-5 w-px bg-line shrink-0" />
            )}
            {getHref ? (
              <a
                href={getHref(item.slug)}
                className={cls}
                aria-current={item.active ? "page" : undefined}
              >
                {inner}
              </a>
            ) : (
              <button
                type="button"
                onClick={() => onSelect?.(item.slug)}
                className={cls}
                aria-current={item.active ? "page" : undefined}
              >
                {inner}
              </button>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
