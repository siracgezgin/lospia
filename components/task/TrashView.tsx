"use client";

import { useState, useTransition, useOptimistic } from "react";
import Link from "next/link";
import { Trash2, RotateCcw, X } from "lucide-react";
import { restoreTask, permanentDeleteTask } from "@/lib/actions/tasks";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTR } from "@/lib/utils/format-date";
import type { Task } from "@/types";

interface Props {
  tasks: Task[];
  workspaceId: string;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return formatDateTR(iso, { day: "numeric", month: "short", year: "numeric" });
}

function TrashRow({
  task,
  onRemove,
}: {
  task: Task;
  onRemove: (id: string) => void;
}) {
  const [_p, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex items-center justify-between gap-3 py-3 px-4 sm:px-5 hover:bg-surface-hover transition-colors duration-150 group">
      <div className="flex-1 min-w-0">
        <Link
          href={`/tasks/${task.id}`}
          className="text-sm font-medium text-muted hover:text-ink transition-colors duration-150 truncate block line-through decoration-line-strong"
        >
          {task.title}
        </Link>
        <p className="text-xs text-subtle mt-0.5 tabular-nums">
          Silindi: {formatDate(task.deleted_at)}
        </p>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150 shrink-0">
        <button
          onClick={() => startTransition(async () => { await restoreTask(task.id); onRemove(task.id); })}
          className="flex items-center gap-1 text-xs font-medium text-muted hover:text-brand-strong px-2 py-1 rounded-md hover:bg-brand-soft active:scale-[0.98] transition-colors duration-150"
          title="Geri yükle"
        >
          <RotateCcw size={13} /> Geri yükle
        </button>

        {confirming ? (
          <div className="anim-fade flex items-center gap-1.5">
            <span className="text-xs font-medium text-danger">Kalıcı silinsin mi?</span>
            <button
              onClick={() => startTransition(async () => { await permanentDeleteTask(task.id); onRemove(task.id); })}
              className="text-xs font-medium bg-danger text-white rounded-md px-2 py-0.5 hover:bg-danger-strong active:scale-[0.98] transition-colors duration-150"
            >
              Evet
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="text-xs font-medium bg-surface-sunken text-muted rounded-md px-2 py-0.5 hover:bg-surface-hover hover:text-ink active:scale-[0.98] transition-colors duration-150"
            >
              İptal
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="flex items-center gap-1 text-xs font-medium text-danger hover:text-danger-strong px-2 py-1 rounded-md hover:bg-danger/10 active:scale-[0.98] transition-colors duration-150"
            title="Kalıcı olarak sil"
          >
            <X size={13} /> Kalıcı sil
          </button>
        )}
      </div>
    </div>
  );
}

export function TrashView({ tasks: initialTasks }: Props) {
  const [tasks, setTasks] = useOptimistic(initialTasks, (state, id: string) =>
    state.filter((t) => t.id !== id),
  );
  const [_p, startTransition] = useTransition();

  function handleRemove(id: string) {
    startTransition(() => { setTasks(id); });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 sm:px-6 lg:px-8 py-4 border-b border-line bg-surface shrink-0">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-surface-sunken text-muted shrink-0">
            <Trash2 size={18} strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-ink">Trash</h1>
              <span className="text-sm text-subtle tabular-nums">({tasks.length} görev)</span>
            </div>
            <p className="text-[13px] text-muted">Silinen görevler burada tutulur. Geri yükleyebilir veya kalıcı olarak silebilirsiniz.</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        {tasks.length > 0 ? (
          <div className="anim-fade-up bg-surface border border-line rounded-card shadow-card divide-y divide-hairline overflow-hidden">
            {tasks.map((task) => (
              <TrashRow key={task.id} task={task} onRemove={handleRemove} />
            ))}
          </div>
        ) : (
          <EmptyState icon={Trash2} title="Çöp kutusu boş" className="py-20" />
        )}
      </div>
    </div>
  );
}
