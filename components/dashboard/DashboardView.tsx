"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import Link from "next/link";
import type { TaskStatus, TaskPriority } from "@/types";
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
  if (h === 0 && m === 0) return "0m";
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  backlog: "#94a3b8",
  ready: "#60a5fa",
  in_progress: "#818cf8",
  blocked: "#f87171",
  review: "#fbbf24",
  done: "#34d399",
  archived: "#d1d5db",
};

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  urgent: "text-red-600",
  high: "text-orange-500",
  medium: "text-yellow-600",
  low: "text-gray-400",
};

export function DashboardView({ tasksByStatus, timeLoggedSeconds, dueSoonTasks }: Props) {
  const chartData = tasksByStatus.map((row) => ({
    status: STATUS_LABELS[row.status],
    count: row.count,
    color: STATUS_COLORS[row.status],
  }));

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Gösterge Paneli</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Tile 1: Tasks by status — Recharts bar chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Duruma göre görevler</h2>
          {chartData.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">Henüz görev yok</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="status"
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "none" }}
                  cursor={{ fill: "#f9fafb" }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Tile 2: Time logged this week */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col justify-center">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Bu hafta geçen süre</h2>
          <p className="text-4xl font-bold text-blue-600 mt-2">
            {formatDuration(timeLoggedSeconds)}
          </p>
          <p className="text-xs text-gray-400 mt-2">bu hafta sizin tarafınızdan kaydedildi</p>
          {timeLoggedSeconds === 0 && (
            <p className="text-xs text-gray-300 mt-1">Süre takibi için zamanlayıcı başlatın</p>
          )}
        </div>
      </div>

      {/* Tile 3: Due soon */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Geciken ve 7 gün içinde teslim edilecekler
          {dueSoonTasks.length > 0 && (
            <span className="ml-2 text-xs font-normal bg-orange-50 text-orange-600 rounded-full px-2 py-0.5">
              {dueSoonTasks.length}
            </span>
          )}
        </h2>
        {dueSoonTasks.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">Geciken veya yaklaşan görev yok 🎉</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {dueSoonTasks.map((task) => {
              const isOverdue = task.due_date < today;
              return (
                <div key={task.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/tasks/${task.id}`}
                      className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block"
                    >
                      {task.title}
                    </Link>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-gray-400 capitalize">{STATUS_LABELS[task.status]}</span>
                      <span className={`text-[10px] font-medium capitalize ${PRIORITY_COLORS[task.priority]}`}>
                        {task.priority}
                      </span>
                    </div>
                  </div>
                  <span className={`text-xs font-medium shrink-0 ${isOverdue ? "text-red-600" : "text-orange-500"}`}>
                    {new Date(task.due_date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
                    {isOverdue && <span className="ml-1 text-[10px] bg-red-50 text-red-500 rounded px-1 py-0.5">gecikmiş</span>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
