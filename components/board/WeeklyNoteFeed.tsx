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
import type { BoardNoteFeedItem, TaskNoteType } from "@/types";
import { NOTE_TYPE_LABELS } from "@/lib/notes/note-types";
import { acknowledgeTaskNote } from "@/lib/actions/notes";
import { formatDateTR } from "@/lib/utils/format-date";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ClampedText } from "@/components/ui/ClampedText";
import type { DeptMeta } from "@/lib/utils/departments";

const VISIBLE_LIMIT = 6;

/* Not türü rozeti — tasarım token'larından. lib/notes/note-types.ts'teki
   NOTE_TYPE_BADGE ham Tailwind paleti (blue-50, amber-700…) taşıyor; lib bu
   pasın kapsamı dışında olduğu için eşleme burada yapıldı. Kartın TEK rozeti
   budur; departman rozeti kalktı, adı meta satırında düz metin olarak yazar
   ("başlık · tür · departman" kuralı). */
const NOTE_TYPE_TONE: Record<TaskNoteType, string> = {
  info:             "bg-info/10 text-info border border-info/30",
  action_required:  "bg-hold/10 text-hold border border-hold/30",
  handoff:          "bg-brand-soft text-brand-strong border border-brand-ring/50",
  approval_waiting: "bg-approval/10 text-approval border border-approval/30",
};

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
    // Hover'da yalnız gölge; kart yerinden oynamaz (translate yok).
    <div className="space-y-1.5 rounded-card border border-line bg-surface p-3 shadow-card transition-shadow duration-150 ease-standard hover:shadow-card-hover">
      {/* Tek rozet: not türü */}
      <Badge size="xs" className={NOTE_TYPE_TONE[item.noteType]}>
        {NOTE_TYPE_LABELS[item.noteType]}
      </Badge>

      {/* Task link (title) */}
      <Link
        prefetch={false}
        href={`/tasks/${item.taskId}`}
        className="group/task flex items-start gap-1 text-[13.5px] font-semibold leading-snug tracking-tight text-ink transition-colors duration-150 hover:text-brand"
        title={item.taskTitle}
      >
        {/* Başlık KESİLMEZ: not akışı sütunu zaten kaydırılabilir, kesilen
            başlık kartı okunmaz kılıyordu. */}
        <span className="min-w-0 flex-1 break-words">{item.taskTitle}</span>
        <ArrowUpRight
          size={12}
          aria-hidden
          className="mt-0.5 shrink-0 text-subtle transition-colors duration-150 group-hover/task:text-brand"
        />
      </Link>

      {/* Not metni — uzunsa kesilir, devamı kartın içinde açılır. */}
      <ClampedText text={item.content} lines={3} className="text-[13px] leading-relaxed text-muted" />

      {/* Meta: yazar · departman · teslim · muhatap — hepsi düz metin */}
      <p className="text-[12px] leading-snug text-subtle">
        <span className="font-medium text-muted">{item.authorName}</span>
        {dept && <span> · {dept.name}</span>}
        {item.taskDueDate && <span> · Teslim: {shortDate(item.taskDueDate)}</span>}
        {item.notifiedNames.length > 0 && (
          <span> · Muhatap: <span className="text-muted">{item.notifiedNames.join(", ")}</span></span>
        )}
      </p>

      {/* Actions — only on actionable note types */}
      {actionable && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {isClaimed ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-brand-ring/50 bg-brand-soft px-1.5 py-0.5 text-[12px] font-medium text-brand-strong">
              <Check size={11} aria-hidden /> Üzerine alındı{item.claimedByName ? ` · ${item.claimedByName}` : claimedByMe ? " · siz" : ""}
            </span>
          ) : (
            !isViewer && item.authorId !== currentUserId && (
              <Button
                variant="secondary"
                size="sm"
                className="text-brand hover:text-brand-strong"
                onClick={() => handleAck("claimed")}
                disabled={pending}
              >
                <HandHelping size={13} aria-hidden /> Üzerime aldım
              </Button>
            )
          )}
          {seenByMe ? (
            <span className="inline-flex items-center gap-1 text-[12px] text-subtle">
              <Eye size={11} aria-hidden /> Görüldü
            </span>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => handleAck("seen")} disabled={pending}>
              <Eye size={13} aria-hidden /> Gördüm
            </Button>
          )}
          {error && <span className="text-[12px] text-danger">{error}</span>}
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
    // Dar sütunda küçük, sakin boş durum: tek satır.
    return (
      <p className="anim-fade rounded-card border border-dashed border-line bg-surface/60 px-3 py-3 text-center text-[12.5px] text-subtle">
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
        <Button
          variant="ghost"
          size="sm"
          className={cn("self-start text-brand hover:text-brand-strong")}
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? "Daha az göster" : `Tüm notları gör (${items.length})`}
        </Button>
      )}
    </div>
  );
}
