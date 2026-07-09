"use client";

// Haftanın Not Akışı — the board's left "Notlar" column feed. Shows the task
// notes of the SELECTED board week as compact cards (author, task, snippet,
// type, department, due date, targets) with "Gördüm / Üzerime aldım" actions.
// Info notes belong to their creation week only; open action/handoff/approval
// notes carry over week-to-week until claimed/closed (filtering happens in
// KanbanBoard so the feed follows the same week the task columns follow).

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Eye, HandHelping, ArrowUpRight } from "lucide-react";
import type { BoardNoteFeedItem } from "@/types";
import { NOTE_TYPE_LABELS, NOTE_TYPE_BADGE } from "@/lib/notes/note-types";
import { acknowledgeTaskNote } from "@/lib/actions/notes";
import { getDepartmentCardStyle } from "@/lib/design/semantics";
import { formatDateTR } from "@/lib/utils/format-date";
import { cn } from "@/lib/utils/cn";
import type { DeptMeta } from "@/lib/utils/departments";

const VISIBLE_LIMIT = 6;

type AckRow = { note_id: string; user_id: string; action: string };

function shortDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return formatDateTR(iso.slice(0, 10), { day: "numeric", month: "short" });
  } catch {
    return iso;
  }
}

function FeedCard({
  item,
  deptMeta,
  currentUserId,
  isViewer,
  acks,
}: {
  item: BoardNoteFeedItem;
  deptMeta: Record<string, DeptMeta>;
  currentUserId: string;
  isViewer: boolean;
  acks: AckRow[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dept = item.departmentId ? deptMeta[item.departmentId] : undefined;
  const deptStyle = getDepartmentCardStyle(dept?.color);
  const actionable = item.noteType !== "info";
  const seenByMe = acks.some((a) => a.note_id === item.id && a.user_id === currentUserId && a.action === "seen");
  const claimedByMe = acks.some((a) => a.note_id === item.id && a.user_id === currentUserId && a.action === "claimed");
  const isClaimed = item.actionStatus === "claimed" || !!item.claimedByName || claimedByMe;

  function handleAck(action: "seen" | "claimed") {
    setError(null);
    startTransition(async () => {
      const res = await acknowledgeTaskNote(item.id, action);
      if ("error" in res) setError(res.error);
    });
  }

  return (
    <div className="rounded-card border border-line bg-surface p-2.5 shadow-card transition-shadow hover:shadow-card-hover space-y-1.5">
      {/* Type + department chips */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className={cn("text-[10px] rounded px-1.5 py-0.5 leading-none font-medium", NOTE_TYPE_BADGE[item.noteType])}>
          {NOTE_TYPE_LABELS[item.noteType]}
        </span>
        {dept && (
          <span className={cn("text-[10px] rounded px-1.5 py-0.5 leading-none truncate max-w-28", deptStyle.chip)}>
            {dept.name}
          </span>
        )}
      </div>

      {/* Task link (title) */}
      <Link
        prefetch={false}
        href={`/tasks/${item.taskId}`}
        className="group/task flex items-start gap-1 text-[12px] font-semibold text-ink hover:text-brand leading-snug"
        title={item.taskTitle}
      >
        <span className="line-clamp-2 break-words flex-1 min-w-0">{item.taskTitle}</span>
        <ArrowUpRight size={11} className="shrink-0 mt-0.5 text-subtle group-hover/task:text-brand" />
      </Link>

      {/* Note snippet */}
      <p className="text-[11px] text-muted leading-relaxed line-clamp-3 break-words whitespace-pre-wrap">
        {item.content}
      </p>

      {/* Meta: author · due date · targets */}
      <p className="text-[10px] text-subtle leading-snug">
        <span className="font-medium text-muted">{item.authorName}</span>
        {item.taskDueDate && <span> · Teslim: {shortDate(item.taskDueDate)}</span>}
        {item.notifiedNames.length > 0 && (
          <span> · Muhatap: <span className="text-muted">{item.notifiedNames.join(", ")}</span></span>
        )}
      </p>

      {/* Actions — only on actionable note types */}
      {actionable && (
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          {isClaimed ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-teal-700 bg-teal-50 border border-teal-200 rounded px-1.5 py-0.5 font-medium">
              <Check size={10} /> Üzerine alındı{item.claimedByName ? ` · ${item.claimedByName}` : claimedByMe ? " · siz" : ""}
            </span>
          ) : (
            !isViewer && item.authorId !== currentUserId && (
              <button
                onClick={() => handleAck("claimed")}
                disabled={pending}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-teal-700 border border-teal-200 bg-white hover:bg-teal-50 rounded px-1.5 py-0.5 transition-colors disabled:opacity-50"
              >
                <HandHelping size={10} /> Üzerime aldım
              </button>
            )
          )}
          {seenByMe ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-subtle">
              <Eye size={10} /> Görüldü
            </span>
          ) : (
            <button
              onClick={() => handleAck("seen")}
              disabled={pending}
              className="inline-flex items-center gap-1 text-[10px] font-medium text-muted border border-line bg-surface hover:bg-surface-muted rounded px-1.5 py-0.5 transition-colors disabled:opacity-50"
            >
              <Eye size={10} /> Gördüm
            </button>
          )}
          {error && <span className="text-[10px] text-danger">{error}</span>}
        </div>
      )}
    </div>
  );
}

export function WeeklyNoteFeed({
  items,
  deptMeta,
  currentUserId,
  isViewer,
  acks,
}: {
  items: BoardNoteFeedItem[];
  deptMeta: Record<string, DeptMeta>;
  currentUserId: string;
  isViewer: boolean;
  acks: AckRow[];
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = useMemo(
    () => (showAll ? items : items.slice(0, VISIBLE_LIMIT)),
    [items, showAll],
  );

  if (items.length === 0) {
    return (
      <p className="text-[11px] text-subtle rounded-card border border-dashed border-line bg-surface/60 px-3 py-4 text-center">
        Bu hafta yeni görev notu yok.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {visible.map((item) => (
        <FeedCard
          key={item.id}
          item={item}
          deptMeta={deptMeta}
          currentUserId={currentUserId}
          isViewer={isViewer}
          acks={acks}
        />
      ))}
      {items.length > VISIBLE_LIMIT && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-[11px] text-brand hover:underline text-left px-1"
        >
          {showAll ? "Daha az göster" : `Tüm notları gör (${items.length})`}
        </button>
      )}
    </div>
  );
}
