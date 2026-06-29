import Link from "next/link";
import {
  AlertTriangle, CalendarClock, CheckCircle2, ListTodo,
  ClipboardCheck, Sparkles, Clock3,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { STATUS_LABELS } from "@/lib/utils/task-constants";
import { STATUS_CHIP_TONE } from "@/lib/design/semantics";
import { formatDateTR } from "@/lib/utils/format-date";
import type { TaskStatus, TaskPriority } from "@/types";
import type { MemberDashboardData, MemberPointsSummary } from "@/lib/points/queries";

interface Props {
  data: MemberDashboardData;
  points: MemberPointsSummary;
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: "bg-[#c0392b]",
  high: "bg-[#d4513f]",
  medium: "bg-[#c77d2e]",
  low: "bg-[#98a0a8]",
};

function StatCard({
  icon, label, value, tone = "neutral", href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone?: "neutral" | "danger" | "warning" | "success" | "review" | "brand";
  href?: string;
}) {
  const toneCls = {
    neutral: "text-ink",
    danger: "text-danger",
    warning: "text-warning",
    success: "text-[#1c7a52]",
    review: "text-[#2f9e63]",
    brand: "text-brand",
  }[tone];
  const inner = (
    <>
      <div className="flex items-center gap-2 text-subtle">
        {icon}
        <span className="text-xs font-medium text-muted">{label}</span>
      </div>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${toneCls}`}>{value}</p>
    </>
  );
  const base = "bg-surface rounded-xl border border-line shadow-card p-4 transition-colors";
  return href ? (
    <Link href={href} className={cn(base, "hover:border-gray-300 hover:bg-gray-50/60")}>
      {inner}
    </Link>
  ) : (
    <div className={base}>{inner}</div>
  );
}

// A strictly personal dashboard: only the signed-in member's own work and their
// own (provisional) points. No team totals, no other members, no ranking.
export function MemberDashboardView({ data, points }: Props) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Gösterge Paneli</h1>
        <p className="text-sm text-muted mt-0.5">Size atanan işlerin anlık durumu ve kişisel özetiniz</p>
      </div>

      {/* Personal KPIs — only the member's responsible tasks */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard icon={<ListTodo size={15} />} label="Aktif görevlerim" value={data.active} href="/board?view=mine" />
        <StatCard icon={<AlertTriangle size={15} />} label="Geciken işlerim" value={data.overdue} tone={data.overdue > 0 ? "danger" : "neutral"} href="/board?view=overdue" />
        <StatCard icon={<CalendarClock size={15} />} label="Bu hafta teslim işlerim" value={data.dueThisWeek} tone={data.dueThisWeek > 0 ? "warning" : "neutral"} href="/board?view=this-week" />
        <StatCard icon={<ClipboardCheck size={15} />} label="Kontrol bekleyen işlerim" value={data.review} tone={data.review > 0 ? "review" : "neutral"} href="/board?view=waiting-approval" />
        <StatCard icon={<CheckCircle2 size={15} />} label="Tamamladığım işler" value={data.done} tone="success" />
      </div>

      {/* Puan & Motivasyon — personal only. No other members, no team totals. */}
      <section id="puan-motivasyon" className="space-y-4 scroll-mt-6">
        <div>
          <h2 className="text-base font-semibold text-ink flex items-center gap-2">
            <Sparkles size={16} className="text-brand" />
            Puan &amp; Motivasyon
          </h2>
          <p className="text-sm text-muted mt-0.5">
            Kişisel katkı özetiniz. Puan yalnızca yönetici onayından sonra kesinleşir.
          </p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={<Sparkles size={15} />} label="Bu ay kazandığım" value={`${points.monthPoints} puan`} tone="brand" />
          <div title="Görev yönetici tarafından tamamlandığında kesinleşir.">
            <StatCard icon={<Clock3 size={15} />} label="Onay bekleyen puanım" value={`${points.pending} puan`} tone="warning" />
          </div>
          <StatCard icon={<CheckCircle2 size={15} />} label="Tamamladığım işler" value={points.doneCount} tone="success" />
          <StatCard icon={<ClipboardCheck size={15} />} label="Kontrol bekleyen işlerim" value={points.reviewCount} tone="review" />
        </div>
      </section>

      {/* Personal risk list — the member's own overdue + upcoming tasks */}
      <div className="bg-surface rounded-xl border border-line shadow-card p-5">
        <h2 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
          İşlerim — dikkat gerektirenler
        </h2>
        {data.dueSoon.length === 0 ? (
          <p className="text-sm text-subtle py-6 text-center flex items-center justify-center gap-2">
            <Sparkles size={15} className="text-[#2f9e63]" />
            Geciken veya yaklaşan işiniz yok
          </p>
        ) : (
          <div className="divide-y divide-hairline">
            {data.dueSoon.map((t) => {
              const isOverdue = t.due_date < today;
              return (
                <div key={t.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn("h-2 w-2 rounded-full shrink-0", PRIORITY_DOT[t.priority as TaskPriority] ?? "bg-[#98a0a8]")} />
                    <Link prefetch={false} href={`/tasks/${t.id}`} className="text-sm font-medium text-ink hover:text-brand truncate">
                      {t.title}
                    </Link>
                    <span className={cn("text-[10px] font-medium rounded-full px-1.5 py-0.5 whitespace-nowrap shrink-0", STATUS_CHIP_TONE[t.status as TaskStatus] ?? "bg-gray-100 text-gray-600")}>
                      {STATUS_LABELS[t.status as TaskStatus] ?? t.status}
                    </span>
                  </div>
                  <span className={cn("text-xs font-medium shrink-0", isOverdue ? "text-danger" : "text-warning")}>
                    {formatDateTR(t.due_date, { day: "numeric", month: "short" })}
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
