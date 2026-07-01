"use client";

import { useState } from "react";
import Link from "next/link";
import { ScrollText, ChevronDown, ChevronRight, ArrowRight } from "lucide-react";
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
        className="w-full flex items-center gap-2 px-4 py-2 text-left"
      >
        {open ? <ChevronDown size={14} className="text-[#9a915f]" /> : <ChevronRight size={14} className="text-[#9a915f]" />}
        <ScrollText size={14} className="text-[#9a915f]" />
        <span className="text-sm font-medium text-[#6b6748]">Kurallar</span>
        <span className="text-xs text-[#9a915f]">({rules.length})</span>
        {newCount > 0 && (
          <span className="ml-1 text-[10px] font-semibold bg-[#d4cf9e] text-[#5b5733] px-1.5 py-0.5 rounded-full">
            {newCount} yeni
          </span>
        )}
        <Link
          href="/rules"
          onClick={(e) => e.stopPropagation()}
          className="ml-auto text-xs font-medium text-[#406775] hover:underline"
        >
          Tümünü yönet →
        </Link>
      </button>

      {open && (
        <div className="px-4 pb-2.5">
          <ul className="space-y-1">
            {latest.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-sm text-[#6b6748]">
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
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#406775] hover:underline"
            >
              Tüm kuralları gör ({rules.length}) <ArrowRight size={12} />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
