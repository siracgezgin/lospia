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
import { AlertTriangle, Clock, CalendarClock, CheckCircle2, ListTodo } from "lucide-react";
import type { TaskStatus, TaskPriority } from "@/types";
import { STATUS_LABELS } from "@/lib/utils/task-constants";
import { formatDateTR } from "@/lib/utils/format-date";
import { Badge } from "@/components/ui/Badge";

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
  if (h === 0 && m === 0) return "0d";
  if (h === 0) return `${m}dk`;
  return `${h}sa ${m}dk`;
}

// Token-aligned status colors (match lib/design/semantics.ts hues).
const STATUS_COLORS: Record<TaskStatus, string> = {
  backlog: "#98a0a8",
  ready: "#3b7bb5",
  in_progress: "#7c5cbf",
  blocked: "#b8851f",
  review: "#c77d2e",
  done: "#2e9367",
  archived: "#cdd2d8",
};

const PRIORITY_DOT: Record<TaskPriority, string> = {
  urgent: "bg-[#c0392b]",
  high: "bg-[#d4513f]",
  medium: "bg-[#c77d2e]",
  low: "bg-[#98a0a8]",
};

function StatCard({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone?: "neutral" | "danger" | "warning" | "success";
}) {
  const toneCls = {
    neutral: "text-ink",
    danger: "text-danger",
    warning: "text-warning",
    success: "text-success",
  }[tone];
  return (
    <div className="bg-surface rounded-xl border border-line shadow-card p-4">
      <div className="flex items-center gap-2 text-subtle">
        {icon}
        <span className="text-xs font-medium text-muted">{label}</span>
      </div>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${toneCls}`}>{value}</p>
    </div>
  );
}

export function DashboardView({ tasksByStatus, timeLoggedSeconds, dueSoonTasks }: Props) {
  const today = new Date().toISOString().slice(0, 10);

  const chartData = tasksByStatus
    .filter((r) => r.status !== "archived")
    .map((row) => ({
      status: STATUS_LABELS[row.status],
      count: row.count,
      color: STATUS_COLORS[row.status],
    }));

  const countOf = (s: TaskStatus) => tasksByStatus.find((r) => r.status === s)?.count ?? 0;
  const activeTotal = tasksByStatus
    .filter((r) => r.status !== "done" && r.status !== "archived")
    .reduce((sum, r) => sum + r.count, 0);
  const doneTotal = countOf("done");

  const overdue = dueSoonTasks.filter((t) => t.due_date < today);
  const upcoming = dueSoonTasks.filter((t) => t.due_date >= today);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Gösterge Paneli</h1>
        <p className="text-sm text-muted mt-0.5">Operasyonun anlık durumu ve risk göstergeleri</p>
      </div>

      {/* Headline KPIs — decision-support, not vanity */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<ListTodo size={15} />} label="Aktif görev" value={activeTotal} />
        <StatCard icon={<AlertTriangle size={15} />} label="Geciken" value={overdue.length} tone={overdue.length > 0 ? "danger" : "neutral"} />
        <StatCard icon={<CalendarClock size={15} />} label="7 gün içinde" value={upcoming.length} tone={upcoming.length > 0 ? "warning" : "neutral"} />
        <StatCard icon={<CheckCircle2 size={15} />} label="Tamamlanan" value={doneTotal} tone="success" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Status distribution */}
        <div className="bg-surface rounded-xl border border-line shadow-card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-ink mb-4">Duruma göre dağılım</h2>
          {chartData.length === 0 ? (
            <p className="text-sm text-subtle py-8 text-center">Henüz görev yok</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="status" tick={{ fontSize: 10, fill: "#98a0a8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#98a0a8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e6e8eb", boxShadow: "none" }}
                  cursor={{ fill: "#f6f7f9" }}
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

        {/* Time logged */}
        <div className="bg-surface rounded-xl border border-line shadow-card p-5 flex flex-col justify-center">
          <div className="flex items-center gap-2 text-subtle">
            <Clock size={15} />
            <h2 className="text-xs font-medium text-muted">Bu hafta geçen süre</h2>
          </div>
          <p className="text-4xl font-semibold text-brand mt-3 tabular-nums">{formatDuration(timeLoggedSeconds)}</p>
          <p className="text-xs text-subtle mt-2">
            {timeLoggedSeconds === 0 ? "Süre takibi için zamanlayıcı başlatın" : "sizin tarafınızdan kaydedildi"}
          </p>
        </div>
      </div>

      {/* Risk list — overdue first, then upcoming */}
      <div className="bg-surface rounded-xl border border-line shadow-card p-5">
        <h2 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
          Dikkat gerektirenler
          {dueSoonTasks.length > 0 && (
            <Badge size="xs" className="bg-[#fbeede] text-[#a05f1c]">{dueSoonTasks.length}</Badge>
          )}
        </h2>
        {dueSoonTasks.length === 0 ? (
          <p className="text-sm text-subtle py-6 text-center">Geciken veya yaklaşan görev yok 🎉</p>
        ) : (
          <div className="space-y-4">
            {overdue.length > 0 && (
              <RiskGroup title="Geciken" tone="danger" tasks={overdue} today={today} />
            )}
            {upcoming.length > 0 && (
              <RiskGroup title="Yaklaşan" tone="warning" tasks={upcoming} today={today} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RiskGroup({
  title,
  tone,
  tasks,
  today,
}: {
  title: string;
  tone: "danger" | "warning";
  tasks: Props["dueSoonTasks"];
  today: string;
}) {
  return (
    <div>
      <p className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${tone === "danger" ? "text-danger" : "text-warning"}`}>
        {title} · {tasks.length}
      </p>
      <div className="divide-y divide-hairline">
        {tasks.map((task) => {
          const isOverdue = task.due_date < today;
          return (
            <div key={task.id} className="py-2.5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`h-2 w-2 rounded-full shrink-0 ${PRIORITY_DOT[task.priority]}`} title={task.priority} />
                <Link href={`/tasks/${task.id}`} className="text-sm font-medium text-ink hover:text-brand truncate">
                  {task.title}
                </Link>
                <span className="text-[11px] text-subtle shrink-0">{STATUS_LABELS[task.status]}</span>
              </div>
              <span className={`text-xs font-medium shrink-0 ${isOverdue ? "text-danger" : "text-warning"}`}>
                {formatDateTR(task.due_date, { day: "numeric", month: "short" })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
