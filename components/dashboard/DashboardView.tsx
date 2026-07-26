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
import {
  AlertTriangle, Clock, CalendarClock, CheckCircle2, ListTodo,
  ClipboardCheck, ArrowRight, History, Building2, CalendarDays, Sparkles,
} from "lucide-react";
import type { TaskStatus, TaskPriority } from "@/types";
import { STATUS_LABELS } from "@/lib/utils/task-constants";
import { formatDateTR } from "@/lib/utils/format-date";
import {
  STATUS_CHART_FILL, STATUS_CHIP_TONE, getDepartmentBadge,
} from "@/lib/design/semantics";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { DashboardMetricCard } from "@/components/dashboard/DashboardMetricCard";
import { PointsMotivationSection } from "@/components/dashboard/PointsMotivationSection";
import type { AdminPointsData, MemberPointsSummary } from "@/lib/points/queries";

interface DepartmentStat {
  name: string;
  color: string | null;
  active: number;
  overdue: number;
}

interface RecentTask {
  id: string;
  title: string;
  status: TaskStatus;
  deptName: string | null;
  deptColor: string | null;
  updated_at: string;
}

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
  departmentStats: DepartmentStat[];
  recentTasks: RecentTask[];
  isAdmin: boolean;
  adminPoints: AdminPointsData | null;
  memberPoints: MemberPointsSummary;
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0 && m === 0) return "0d";
  if (h === 0) return `${m}dk`;
  return `${h}sa ${m}dk`;
}

const PRIORITY_DOT: Record<TaskPriority, string> = {
  urgent: "bg-[#c0392b]",
  high: "bg-[#d4513f]",
  medium: "bg-[#c77d2e]",
  low: "bg-[#98a0a8]",
};

// End of the current week (Sunday) as YYYY-MM-DD, for the "this week" focus.
function endOfThisWeekISO(): string {
  const d = new Date();
  const dow = d.getDay(); // 0 = Sunday
  const add = dow === 0 ? 0 : 7 - dow;
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0, 10);
}

export function DashboardView({
  tasksByStatus,
  timeLoggedSeconds,
  dueSoonTasks,
  departmentStats,
  recentTasks,
  isAdmin,
  adminPoints,
  memberPoints,
}: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = endOfThisWeekISO();

  const chartData = tasksByStatus
    .filter((r) => r.status !== "archived")
    .map((row) => ({
      status: STATUS_LABELS[row.status],
      count: row.count,
      color: STATUS_CHART_FILL[row.status],
    }));

  const countOf = (s: TaskStatus) => tasksByStatus.find((r) => r.status === s)?.count ?? 0;
  const activeTotal = tasksByStatus
    .filter((r) => r.status !== "done" && r.status !== "archived")
    .reduce((sum, r) => sum + r.count, 0);
  const doneTotal = countOf("done");
  const reviewTotal = countOf("review");

  const overdue = dueSoonTasks.filter((t) => t.due_date < today);
  const upcoming = dueSoonTasks.filter((t) => t.due_date >= today);
  const dueToday = dueSoonTasks.filter((t) => t.due_date === today);
  const dueThisWeek = dueSoonTasks.filter((t) => t.due_date >= today && t.due_date <= weekEnd);

  const maxDeptActive = Math.max(1, ...departmentStats.map((d) => d.active));

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Raporlar</h1>
        <p className="text-sm text-muted mt-0.5">Ekip operasyonunun anlık durumu, riskler ve haftanın odağı</p>
      </div>

      {/* Headline KPIs — decision-support, not vanity */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <DashboardMetricCard icon={<ListTodo size={15} />} label="Aktif görev" value={activeTotal} />
        <DashboardMetricCard icon={<AlertTriangle size={15} />} label="Geciken" value={overdue.length} tone={overdue.length > 0 ? "danger" : "neutral"} href="/board?view=overdue" />
        <DashboardMetricCard icon={<CalendarClock size={15} />} label="Bu hafta teslim" value={dueThisWeek.length} tone={dueThisWeek.length > 0 ? "warning" : "neutral"} />
        <DashboardMetricCard icon={<ClipboardCheck size={15} />} label="Kontrol / Onay" value={reviewTotal} tone={reviewTotal > 0 ? "review" : "neutral"} href="/board?view=waiting-approval" />
        <DashboardMetricCard icon={<CheckCircle2 size={15} />} label="Tamamlanan" value={doneTotal} tone="success" />
      </div>

      {/* Focus + quick actions strip */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <CalendarDays size={15} className="text-brand" />
            Bugün &amp; bu hafta odağı
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <QuickAction href="/calendar" label="Takvim" />
            <QuickAction href="/board?view=overdue" label="Gecikenleri gör" tone="danger" />
            <QuickAction href="/board?view=waiting-approval" label="Onay bekleyenler" tone="review" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <FocusTile label="Bugün teslim" value={dueToday.length} tone="warning" />
          <FocusTile label="Bu hafta teslim" value={dueThisWeek.length} tone="warning" />
          <FocusTile label="Onay kuyruğu" value={reviewTotal} tone="review" />
          <FocusTile label="Geciken kritik" value={overdue.length} tone="danger" />
        </div>
      </Card>

      {/* Puan & Motivasyon — geri bildirimle şimdilik gizlendi (bileşen/veri
          korunur, tek satırla geri açılır). */}
      {false && <PointsMotivationSection isAdmin={isAdmin} admin={adminPoints} member={memberPoints} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Status distribution */}
        <Card className="p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-ink mb-4">Duruma göre dağılım</h2>
          {chartData.length === 0 ? (
            <EmptyState title="Henüz görev yok" className="py-8" />
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
        </Card>

        {/* Time logged */}
        <Card className="p-5 flex flex-col justify-center">
          <div className="flex items-center gap-2 text-subtle">
            <Clock size={15} />
            <h2 className="text-xs font-medium text-muted">Bu hafta geçen süre</h2>
          </div>
          <p className="text-4xl font-semibold text-brand mt-3 tabular-nums">{formatDuration(timeLoggedSeconds)}</p>
          <p className="text-xs text-subtle mt-2">
            {timeLoggedSeconds === 0 ? "Süre takibi için zamanlayıcı başlatın" : "sizin tarafınızdan kaydedildi"}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Department breakdown */}
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
            <Building2 size={15} className="text-subtle" />
            Departman dağılımı
          </h2>
          {departmentStats.length === 0 ? (
            <EmptyState icon={Building2} title="Departmana atanmış aktif görev yok" className="py-6" />
          ) : (
            <div className="space-y-3">
              {departmentStats.map((d) => {
                const badge = getDepartmentBadge(d.color);
                return (
                  <div key={d.name}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className={cn("h-2 w-2 rounded-full shrink-0", badge.dot)} />
                        <span className="text-xs text-ink truncate" title={d.name}>{d.name}</span>
                      </span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        {d.overdue > 0 && (
                          <span className="text-[10px] font-medium text-danger bg-[#fbe6e2] rounded-full px-1.5 py-0.5">
                            {d.overdue} geciken
                          </span>
                        )}
                        <span className="text-xs font-semibold text-muted tabular-nums">{d.active}</span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-sunken overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", badge.dot)}
                        style={{ width: `${Math.max(6, (d.active / maxDeptActive) * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Recent activity */}
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
            <History size={15} className="text-subtle" />
            Son hareketler
          </h2>
          {recentTasks.length === 0 ? (
            <EmptyState icon={History} title="Henüz hareket yok" className="py-6" />
          ) : (
            <div className="divide-y divide-hairline">
              {recentTasks.map((t) => (
                <Link
                  key={t.id}
                  prefetch={false}
                  href={`/tasks/${t.id}`}
                  className="flex items-center justify-between gap-3 py-2.5 group rounded-md transition-colors duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring/40"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm text-ink group-hover:text-brand truncate">{t.title}</span>
                    {t.deptName && (
                      <span className="text-[10px] text-subtle shrink-0 truncate max-w-28">{t.deptName}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn("text-[10px] font-medium rounded-full px-1.5 py-0.5 whitespace-nowrap", STATUS_CHIP_TONE[t.status])}>
                      {STATUS_LABELS[t.status]}
                    </span>
                    <span className="text-[11px] text-subtle tabular-nums">
                      {formatDateTR(t.updated_at, { day: "numeric", month: "short" })}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Risk list — overdue first, then upcoming */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
          Dikkat gerektirenler
          {dueSoonTasks.length > 0 && (
            <Badge size="xs" className="bg-[#fbeede] text-[#a05f1c]">{dueSoonTasks.length}</Badge>
          )}
        </h2>
        {dueSoonTasks.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Geciken veya yaklaşan görev yok"
            description="Takvim temiz — haftanın odağına dönebilirsiniz."
            className="py-6"
          />
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
      </Card>
    </div>
  );
}

function QuickAction({ href, label, tone = "neutral" }: { href: string; label: string; tone?: "neutral" | "danger" | "review" }) {
  const toneCls = {
    neutral: "border-line text-muted hover:bg-surface-hover hover:text-ink",
    danger: "border-[#f0c5bd] text-danger hover:bg-[#fbe6e2]",
    review: "border-[#bfe3cd] text-[#3a8f63] hover:bg-[#e4f5ea]",
  }[tone];
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium rounded-lg border px-2.5 py-1.5",
        "transition-colors duration-[var(--duration-fast)] ease-standard",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring/40 focus-visible:ring-offset-1",
        toneCls,
      )}
    >
      {label}
      <ArrowRight size={12} />
    </Link>
  );
}

function FocusTile({ label, value, tone }: { label: string; value: number; tone: "warning" | "review" | "danger" }) {
  const active = value > 0;
  const valueCls = active
    ? { warning: "text-warning", review: "text-[#3a8f63]", danger: "text-danger" }[tone]
    : "text-muted";
  return (
    <div className="rounded-lg border border-hairline bg-surface-muted px-3 py-2.5">
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", valueCls)}>{value}</p>
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
                <Link prefetch={false} href={`/tasks/${task.id}`} className="text-sm font-medium text-ink hover:text-brand truncate rounded-sm transition-colors duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring/40">
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
