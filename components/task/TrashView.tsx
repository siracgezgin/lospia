"use client";

import { useState, useTransition, useOptimistic } from "react";
import Link from "next/link";
import { Trash2, RotateCcw, X } from "lucide-react";
import { restoreTask, permanentDeleteTask } from "@/lib/actions/tasks";
import { cn } from "@/lib/utils/cn";
import type { Task } from "@/types";

interface Props {
  tasks: Task[];
  workspaceId: string;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
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
    <div className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 group">
      <div className="flex-1 min-w-0">
        <Link href={`/tasks/${task.id}`} className="text-sm font-medium text-gray-500 hover:text-blue-600 truncate block line-through decoration-gray-300">
          {task.title}
        </Link>
        <p className="text-xs text-gray-400 mt-0.5">
          Silindi: {formatDate(task.deleted_at)}
        </p>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => startTransition(async () => { await restoreTask(task.id); onRemove(task.id); })}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50"
          title="Geri yükle"
        >
          <RotateCcw size={12} /> Geri yükle
        </button>

        {confirming ? (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-red-600">Kalıcı silinsin mi?</span>
            <button
              onClick={() => startTransition(async () => { await permanentDeleteTask(task.id); onRemove(task.id); })}
              className="text-[10px] bg-red-600 text-white rounded px-1.5 py-0.5 hover:bg-red-700"
            >
              Evet
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="text-[10px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 hover:bg-gray-200"
            >
              İptal
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
            title="Kalıcı olarak sil"
          >
            <X size={12} /> Kalıcı sil
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
      <div className="px-6 py-4 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-2">
          <Trash2 size={18} className="text-gray-400" />
          <h1 className="text-lg font-semibold text-gray-900">Çöp Kutusu</h1>
          <span className="text-sm text-gray-400">({tasks.length} görev)</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">Silinen görevler burada tutulur. Geri yükleyebilir veya kalıcı olarak silebilirsiniz.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {tasks.length > 0 ? (
          <div className={cn("bg-white border border-gray-200 rounded-lg divide-y divide-gray-100")}>
            {tasks.map((task) => (
              <TrashRow key={task.id} task={task} onRemove={handleRemove} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Trash2 size={32} className="text-gray-200 mb-3" />
            <p className="text-gray-400 text-sm">Çöp kutusu boş</p>
          </div>
        )}
      </div>
    </div>
  );
}
