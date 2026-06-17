"use client";

import { useState, useTransition, useOptimistic } from "react";
import Link from "next/link";
import { Archive, RotateCcw } from "lucide-react";
import { unarchiveTask } from "@/lib/actions/tasks";
import { cn } from "@/lib/utils/cn";
import type { Task } from "@/types";

interface Props {
  manuallyArchived: Task[];
  oldCompleted: Task[];
  workspaceId: string;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

function TaskRow({ task, onUnarchive }: { task: Task; onUnarchive: (id: string) => void }) {
  const [_p, startTransition] = useTransition();
  return (
    <div className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 group">
      <div className="flex-1 min-w-0">
        <Link href={`/tasks/${task.id}`} className="text-sm font-medium text-gray-800 hover:text-blue-600 truncate block">
          {task.title}
        </Link>
        <p className="text-xs text-gray-400 mt-0.5">
          {task.archived_at
            ? `Arşivlendi: ${formatDate(task.archived_at)}`
            : `Tamamlandı: ${formatDate(task.completed_at)}`}
        </p>
      </div>
      {task.archived_at && (
        <button
          onClick={() => startTransition(async () => { await unarchiveTask(task.id); onUnarchive(task.id); })}
          className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50"
          title="Arşivden çıkar"
        >
          <RotateCcw size={12} /> Geri al
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
      <div className="px-6 py-4 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-2">
          <Archive size={18} className="text-gray-400" />
          <h1 className="text-lg font-semibold text-gray-900">Arşiv</h1>
          <span className="text-sm text-gray-400">({totalCount} görev)</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">Manuel arşivlenenler ve önceki haftalarda tamamlananlar</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {archived.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Manuel arşivlenenler ({archived.length})
            </h2>
            <div className={cn("bg-white border border-gray-200 rounded-lg divide-y divide-gray-100")}>
              {archived.map((task) => (
                <TaskRow key={task.id} task={task} onUnarchive={handleUnarchive} />
              ))}
            </div>
          </section>
        )}

        {oldCompleted.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Önceki haftalarda tamamlananlar ({oldCompleted.length})
            </h2>
            <div className={cn("bg-white border border-gray-200 rounded-lg divide-y divide-gray-100")}>
              {oldCompleted.map((task) => (
                <TaskRow key={task.id} task={task} onUnarchive={() => {}} />
              ))}
            </div>
          </section>
        )}

        {totalCount === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Archive size={32} className="text-gray-200 mb-3" />
            <p className="text-gray-400 text-sm">Arşiv boş</p>
          </div>
        )}
      </div>
    </div>
  );
}
