"use client";

import { useTransition, useOptimistic } from "react";
import Link from "next/link";
import { Archive, RotateCcw } from "lucide-react";
import { unarchiveTask } from "@/lib/actions/tasks";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTR } from "@/lib/utils/format-date";
import type { Task } from "@/types";

interface Props {
  manuallyArchived: Task[];
  oldCompleted: Task[];
  workspaceId: string;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return formatDateTR(iso, { day: "numeric", month: "short", year: "numeric" });
}

function TaskRow({ task, onUnarchive }: { task: Task; onUnarchive: (id: string) => void }) {
  const [_p, startTransition] = useTransition();
  return (
    <div className="flex items-center justify-between gap-3 py-3 px-4 sm:px-5 hover:bg-surface-hover transition-colors duration-150 group">
      <div className="flex-1 min-w-0">
        <Link
          href={`/tasks/${task.id}`}
          className="text-sm font-medium text-ink hover:text-brand transition-colors duration-150 truncate block"
        >
          {task.title}
        </Link>
        <p className="text-xs text-subtle mt-0.5 tabular-nums">
          {task.archived_at
            ? `Arşivlendi: ${formatDate(task.archived_at)}`
            : `Tamamlandı: ${formatDate(task.completed_at)}`}
        </p>
      </div>
      {task.archived_at && (
        <button
          onClick={() => startTransition(async () => { await unarchiveTask(task.id); onUnarchive(task.id); })}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all duration-150 flex items-center gap-1 text-xs font-medium text-muted hover:text-brand-strong px-2 py-1 rounded-md hover:bg-brand-soft active:scale-[0.98] shrink-0"
          title="Arşivden çıkar"
        >
          <RotateCcw size={13} /> Geri al
        </button>
      )}
    </div>
  );
}

export function ArchiveView({ manuallyArchived, oldCompleted }: Props) {
  const [archived, setArchived] = useOptimistic(manuallyArchived, (state, id: string) =>
    state.filter((t) => t.id !== id),
  );
  const [_p, startTransition] = useTransition();

  function handleUnarchive(id: string) {
    startTransition(() => { setArchived(id); });
  }

  const totalCount = archived.length + oldCompleted.length;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 sm:px-6 lg:px-8 py-4 border-b border-line bg-surface shrink-0">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-surface-sunken text-muted shrink-0">
            <Archive size={18} strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-ink">Arşiv</h1>
              <span className="text-sm text-subtle tabular-nums">({totalCount} görev)</span>
            </div>
            <p className="text-[13px] text-muted">Manuel arşivlenenler ve önceki haftalarda tamamlananlar</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {archived.length > 0 && (
          <section className="anim-fade-up">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-subtle mb-2 tabular-nums">
              Manuel arşivlenenler ({archived.length})
            </h2>
            <div className="bg-surface border border-line rounded-card shadow-card divide-y divide-hairline overflow-hidden">
              {archived.map((task) => (
                <TaskRow key={task.id} task={task} onUnarchive={handleUnarchive} />
              ))}
            </div>
          </section>
        )}

        {oldCompleted.length > 0 && (
          <section className="anim-fade-up">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-subtle mb-2 tabular-nums">
              Önceki haftalarda tamamlananlar ({oldCompleted.length})
            </h2>
            <div className="bg-surface border border-line rounded-card shadow-card divide-y divide-hairline overflow-hidden">
              {oldCompleted.map((task) => (
                <TaskRow key={task.id} task={task} onUnarchive={() => {}} />
              ))}
            </div>
          </section>
        )}

        {totalCount === 0 && (
          <EmptyState icon={Archive} title="Arşiv boş" className="py-20" />
        )}
      </div>
    </div>
  );
}
