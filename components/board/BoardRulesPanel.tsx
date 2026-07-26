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
    <div className="border-b border-[#e7e2c9] bg-[#fdfaf0] shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-2 text-left transition-colors duration-150 hover:bg-[#faf5df]"
      >
        <ChevronRight
          size={14}
          className={cn(
            "text-[#9a915f] shrink-0 transition-transform duration-200 ease-standard",
            open && "rotate-90",
          )}
        />
        <ScrollText size={14} className="text-[#9a915f] shrink-0" />
        <span className="text-sm font-semibold tracking-tight text-[#6b6748]">Kurallar</span>
        <span className="text-xs text-[#9a915f] tabular-nums">({rules.length})</span>
        {newCount > 0 && (
          <span className="ml-1 text-[10px] font-semibold bg-[#d4cf9e] text-[#5b5733] px-1.5 py-0.5 rounded-full tabular-nums">
            {newCount} yeni
          </span>
        )}
        <Link
          href="/rules"
          onClick={(e) => e.stopPropagation()}
          className="ml-auto text-xs font-medium text-[#406775] hover:text-[#2f5d6b] hover:underline underline-offset-2 transition-colors duration-150"
        >
          Tümünü yönet →
        </Link>
      </button>

      {open && (
        <div className="px-4 pb-2.5 anim-fade-down">
          <ul className="space-y-1">
            {latest.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-sm text-[#6b6748] leading-snug">
                <span className="h-1.5 w-1.5 rounded-full bg-[#bdb678] shrink-0" />
                <span className={cn("truncate")}>{r.title}</span>
                {r.category && (
                  <span className="text-[10px] text-[#9a915f] bg-[#f0ead0] px-1.5 py-0.5 rounded-full shrink-0">
                    {r.category}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {hasMore && (
            <Link
              href="/rules"
              className="group mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#406775] hover:text-[#2f5d6b] hover:underline underline-offset-2 transition-colors duration-150"
            >
              Tüm kuralları gör ({rules.length})
              <ArrowRight size={12} className="transition-transform duration-150 ease-standard group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
