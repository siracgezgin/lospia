"use client";
// Phase 5 — Kanban Board (dnd-kit implementation)
// Placeholder: renders static columns until Phase 5 is built.

import { TASK_STATUSES, STATUS_LABELS } from "@/lib/utils/task-constants";
import type { Task, SavedView } from "@/types/database";

interface Props {
  tasks: Task[];
  savedViews: SavedView[];
  activeViewId: string | null;
  workspaceId: string;
  userId: string;
}

export function KanbanBoard({ tasks, savedViews, activeViewId, workspaceId }: Props) {
  const tasksByStatus = TASK_STATUSES.reduce<Record<string, Task[]>>((acc, status) => {
    acc[status] = tasks.filter((t) => t.status === status);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full">
      {/* Saved views tab strip */}
      {savedViews.length > 0 && (
        <div className="flex gap-1 px-4 pt-3 border-b border-gray-200 bg-white overflow-x-auto shrink-0">
          {savedViews.map((view) => (
            <a
              key={view.id}
              href={`/board?view=${view.id}`}
              className={`px-3 py-1.5 text-sm rounded-t-md border-b-2 whitespace-nowrap transition-colors ${
                activeViewId === view.id
                  ? "border-blue-600 text-blue-700 font-medium"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {view.name}
            </a>
          ))}
        </div>
      )}

      {/* Columns */}
      <div className="flex gap-3 p-4 overflow-x-auto flex-1 items-start">
        {TASK_STATUSES.map((status) => (
          <div
            key={status}
            className="flex flex-col gap-2 w-64 shrink-0"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {STATUS_LABELS[status]}
              </h3>
              <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5">
                {tasksByStatus[status]?.length ?? 0}
              </span>
            </div>
            <div className="space-y-2 min-h-12">
              {(tasksByStatus[status] ?? []).map((task) => (
                <a
                  key={task.id}
                  href={`/tasks/${task.id}`}
                  className="block bg-white rounded-lg border border-gray-200 p-3 shadow-sm hover:shadow-md hover:border-blue-300 transition-all text-sm"
                >
                  <p className="font-medium text-gray-900 line-clamp-2">{task.title}</p>
                  {task.tags.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {task.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] bg-blue-50 text-blue-600 rounded px-1.5 py-0.5"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <span className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${PRIORITY_COLORS[task.priority]}`}>
                      {task.priority}
                    </span>
                    {task.due_date && (
                      <span className="text-[10px] text-gray-400">
                        {new Date(task.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </span>
                    )}
                  </div>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-gray-400 py-2">
        Drag-and-drop wired in Phase 5 · workspace: {workspaceId.slice(0, 8)}…
      </p>
    </div>
  );
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-500",
  medium: "bg-yellow-50 text-yellow-700",
  high: "bg-orange-50 text-orange-700",
  urgent: "bg-red-50 text-red-600",
};
