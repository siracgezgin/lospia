"use client";
// Phase 10 — Dashboard with Recharts (full implementation)
// Placeholder: renders basic stats until Phase 10 is built.

import type { TaskStatus, TaskPriority } from "@/types/database";
import { STATUS_LABELS } from "@/lib/utils/task-constants";

interface Props {
  tasksByStatus: { status: TaskStatus; count: number }[];
  timeLoggedSeconds: number;
  dueSoonTasks: {
    id: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    due_date: string;
    assignee_id: string | null;
  }[];
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function DashboardView({ tasksByStatus, timeLoggedSeconds, dueSoonTasks }: Props) {
  const totalTasks = tasksByStatus.reduce((s, r) => s + r.count, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Tile 1: Tasks by status */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 md:col-span-2">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Tasks by status</h2>
          {tasksByStatus.length === 0 ? (
            <p className="text-sm text-gray-400">No tasks yet</p>
          ) : (
            <div className="space-y-2">
              {tasksByStatus.map(({ status, count }) => (
                <div key={status} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-24 shrink-0">{STATUS_LABELS[status]}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-blue-500 h-2 rounded-full"
                      style={{ width: `${Math.round((count / Math.max(totalTasks, 1)) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-6 text-right">{count}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-4">Full Recharts bar chart in Phase 10</p>
        </div>

        {/* Tile 2: Time logged */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Time this week</h2>
          <p className="text-3xl font-bold text-blue-600">
            {formatDuration(timeLoggedSeconds)}
          </p>
          <p className="text-xs text-gray-400 mt-1">logged so far this week</p>
        </div>
      </div>

      {/* Tile 3: Due soon */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Overdue & due within 7 days ({dueSoonTasks.length})
        </h2>
        {dueSoonTasks.length === 0 ? (
          <p className="text-sm text-gray-400">No overdue or upcoming tasks 🎉</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {dueSoonTasks.map((task) => {
              const isOverdue = task.due_date < new Date().toISOString().slice(0, 10);
              return (
                <li key={task.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <a href={`/tasks/${task.id}`} className="text-sm font-medium text-gray-900 hover:text-blue-600">
                      {task.title}
                    </a>
                    <p className="text-xs text-gray-400 capitalize">{STATUS_LABELS[task.status]}</p>
                  </div>
                  <span className={`text-xs font-medium ${isOverdue ? "text-red-600" : "text-orange-500"}`}>
                    {new Date(task.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    {isOverdue && " (overdue)"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
