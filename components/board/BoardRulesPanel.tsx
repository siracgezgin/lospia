"use client";

import { useState } from "react";
import Link from "next/link";
import { ScrollText, ChevronRight, ArrowRight } from "lucide-react";
import type { BoardRule } from "@/app/(app)/board/page";
import { cn } from "@/lib/utils/cn";

// The board panel is a *summary*, not the full list: only the 3 most recent
// rules are shown so a workspace with dozens of rules doesn't flood the board.
const PREVIEW_COUNT = 3;

/**
 * Compact, collapsible "Kurallar" summary for the board. Shows the workspace
 * rule count + a badge for unseen updates, and previews only the latest 3 rules;
 * everything else lives on the dedicated /rules page. Collapsed by default unless
 * there are unseen updates (newCount > 0).
 *
 * Renkler token'dan (eskiden on ayrı ham hex "parşömen" tonuydu — panonun
 * geri kalanıyla konuşmuyordu). "Tümünü yönet" bağlantısı artık düğmenin
 * KARDEŞİ: <button> içinde <a> geçersiz HTML'di ve tıklamayı yutabiliyordu.
 */
export function BoardRulesPanel({
  rules,
  newCount,
}: {
  rules: BoardRule[];
  newCount: number;
}) {
  const [open, setOpen] = useState(newCount > 0);
  if (rules.length === 0) return null;

  // Most-recent-first, then keep only the preview slice for the board.
  const latest = [...rules]
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0))
    .slice(0, PREVIEW_COUNT);
  const hasMore = rules.length > PREVIEW_COUNT;

  return (
    <div className="shrink-0 border-b border-hairline bg-surface-muted">
      <div className="flex items-center gap-2 px-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left transition-colors duration-150 hover:text-ink"
        >
          <ChevronRight
            size={14}
            aria-hidden
            className={cn(
              "shrink-0 text-subtle transition-transform duration-200 ease-standard",
              open && "rotate-90",
            )}
          />
          <ScrollText size={14} className="shrink-0 text-subtle" aria-hidden />
          <span className="text-sm font-semibold tracking-tight text-ink">Kurallar</span>
          {/* Listeyi tarif eden sayılar (kural adedi, yeni güncelleme adedi). */}
          <span className="text-[12px] text-subtle tabular-nums">({rules.length})</span>
          {newCount > 0 && (
            <span className="ml-1 rounded-full bg-brand-soft px-1.5 py-0.5 text-[12px] font-semibold leading-none text-brand-strong tabular-nums">
              {newCount} yeni
            </span>
          )}
        </button>
        <Link
          href="/rules"
          className="shrink-0 text-[13px] font-medium text-brand underline-offset-2 transition-colors duration-150 hover:text-brand-strong hover:underline"
        >
          Tümünü yönet →
        </Link>
      </div>

      {open && (
        <div className="px-4 pb-2.5 anim-fade-down">
          <ul className="space-y-1">
            {latest.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-sm leading-snug text-muted">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-ring" aria-hidden />
                <span className="truncate">{r.title}</span>
                {r.category && (
                  <span className="shrink-0 rounded-full bg-surface-sunken px-1.5 py-0.5 text-[12px] leading-none text-subtle">
                    {r.category}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {hasMore && (
            <Link
              href="/rules"
              className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-brand underline-offset-2 transition-colors duration-150 hover:text-brand-strong hover:underline"
            >
              Tüm kuralları gör ({rules.length})
              <ArrowRight size={12} aria-hidden />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
