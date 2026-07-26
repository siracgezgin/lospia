import Link from "next/link";
import {
  AlertTriangle, CalendarClock, CheckCircle2, ListTodo,
  ClipboardCheck, Sparkles, Clock3,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { STATUS_LABELS } from "@/lib/utils/task-constants";
import { STATUS_CHIP_TONE } from "@/lib/design/semantics";
import { formatDateTR } from "@/lib/utils/format-date";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { DashboardMetricCard } from "@/components/dashboard/DashboardMetricCard";
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

// A strictly personal dashboard: only the signed-in member's own work and their
// own (provisional) points. No team totals, no other members, no ranking.
export function MemberDashboardView({ data, points }: Props) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Raporlar</h1>
        <p className="text-sm text-muted mt-0.5">Size atanan işlerin anlık durumu ve kişisel özetiniz</p>
      </div>

      {/* Personal KPIs — only the member's responsible tasks */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <DashboardMetricCard icon={<ListTodo size={15} />} label="Aktif görevlerim" value={data.active} href="/board?view=mine" />
        <DashboardMetricCard icon={<AlertTriangle size={15} />} label="Geciken işlerim" value={data.overdue} tone={data.overdue > 0 ? "danger" : "neutral"} href="/board?view=overdue" />
        <DashboardMetricCard icon={<CalendarClock size={15} />} label="Bu hafta teslim işlerim" value={data.dueThisWeek} tone={data.dueThisWeek > 0 ? "warning" : "neutral"} href="/board?view=this-week" />
        <DashboardMetricCard icon={<ClipboardCheck size={15} />} label="Kontrol bekleyen işlerim" value={data.review} tone={data.review > 0 ? "review" : "neutral"} href="/board?view=waiting-approval" />
        <DashboardMetricCard icon={<CheckCircle2 size={15} />} label="Tamamladığım işler" value={data.done} tone="success" />
      </div>

      {/* Puan & Motivasyon — geri bildirimle şimdilik gizlendi (geri alınabilir). */}
      {false && (
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
          <DashboardMetricCard icon={<Sparkles size={15} />} label="Bu ay kazandığım" value={`${points.monthPoints} puan`} tone="brand" />
          <DashboardMetricCard
            icon={<Clock3 size={15} />}
            label="Onay bekleyen puanım"
            value={`${points.pending} puan`}
            tone="warning"
            title="Görev yönetici tarafından tamamlandığında kesinleşir."
          />
          <DashboardMetricCard icon={<CheckCircle2 size={15} />} label="Tamamladığım işler" value={points.doneCount} tone="success" />
          <DashboardMetricCard icon={<ClipboardCheck size={15} />} label="Kontrol bekleyen işlerim" value={points.reviewCount} tone="review" />
        </div>
      </section>
      )}

      {/* Personal risk list — the member's own overdue + upcoming tasks */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
          İşlerim — dikkat gerektirenler
        </h2>
        {data.dueSoon.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Geciken veya yaklaşan işiniz yok"
            description="Takviminiz temiz — aktif görevlerinize dönebilirsiniz."
            className="py-6"
          />
        ) : (
          <div className="divide-y divide-hairline">
            {data.dueSoon.map((t) => {
              const isOverdue = t.due_date < today;
              return (
                <div key={t.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn("h-2 w-2 rounded-full shrink-0", PRIORITY_DOT[t.priority as TaskPriority] ?? "bg-[#98a0a8]")} />
                    <Link prefetch={false} href={`/tasks/${t.id}`} className="text-sm font-medium text-ink hover:text-brand truncate rounded-sm transition-colors duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring/40">
                      {t.title}
                    </Link>
                    <span className={cn("text-[10px] font-medium rounded-full px-1.5 py-0.5 whitespace-nowrap shrink-0", STATUS_CHIP_TONE[t.status as TaskStatus] ?? "bg-surface-sunken text-muted")}>
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
      </Card>
    </div>
  );
}
