import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatDateTR } from "@/lib/utils/format-date";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { TaskStatus, TaskPriority } from "@/types";
import type { AdminPointsData, MemberPointsSummary } from "@/lib/points/queries";

export interface DueSoonTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string;
  assignee_id: string | null;
}

export interface ReportPerson {
  id: string;
  name: string;
}

interface Props {
  dueSoonTasks: DueSoonTask[];
  /** profiles.id → görünen ad; satırdaki "kim" sütunu buradan gelir. */
  nameOf: Record<string, string>;
  /** "Kişiye göre" bölümündeki kişiler (tek sayfalık kişi raporuna kapı). */
  people: ReportPerson[];
  isAdmin: boolean;
  adminPoints?: AdminPointsData | null;
  memberPoints?: MemberPointsSummary;
}

/**
 * Reports — yönetici görünümü.
 *
 * Sayfa bir zamanlar bir gösterge paneliydi: beş KPI karosu, duruma göre
 * çubuk grafik, "bu hafta geçen süre" sayacı, departman dağılımı çubukları,
 * son hareketler akışı ve puan bölümü. Aslı Hanım (2026-08-24):
 *   "Boş laf istemiyorum. Boş hesap istemiyorum. Kimseyi orada puanlamak
 *    istemiyorum. MÜHENDİS GİBİ HİSSETMEK İSTEMİYORUM."
 *   "İsmi, işi, tarihi bu kadar."
 *
 * Rapor artık tek bir soruya cevap verir: KİM, NEYİ, NE ZAMAN teslim edecek?
 * Geciken önce, sonra yaklaşan. Kişi bazlı detay tek sayfalık kişi raporunda
 * (/reports/[id]) — Aslı Hanım'ın 2026-08-19'daki "tek sayfada kendisiyle
 * ilgili detayları okusun" isteği orada karşılanıyor.
 */
export function DashboardView({ dueSoonTasks, nameOf, people }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = dueSoonTasks.filter((t) => t.due_date < today);
  const upcoming = dueSoonTasks.filter((t) => t.due_date >= today);

  return (
    <div className="w-full space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink">Reports</h1>
        <p className="mt-0.5 text-sm text-muted">Kim, neyi, ne zaman teslim edecek.</p>
      </div>

      {dueSoonTasks.length === 0 ? (
        <Card className="p-5">
          <EmptyState
            icon={Sparkles}
            title="Geciken veya yaklaşan iş yok"
            description="Takvim temiz."
            className="py-8"
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:items-start">
          {overdue.length > 0 && (
            <TaskGroup title="Geciken" tone="danger" tasks={overdue} nameOf={nameOf} overdue />
          )}
          {upcoming.length > 0 && (
            <TaskGroup title="Yaklaşan" tone="muted" tasks={upcoming} nameOf={nameOf} />
          )}
        </div>
      )}

      {/* Kişiye göre — tek sayfalık kişi raporuna kapı. Kart üzerinde rakam
          YOK: kişiyi seçmek, onun işini açmak demektir (Pano'daki kişi
          ızgarasıyla aynı dil). */}
      {people.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink">Kişiye göre</h2>
          <div className="flex flex-wrap gap-2">
            {people.map((p) => (
              <Link
                key={p.id}
                href={`/reports/${p.id}`}
                className="group inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-muted transition-[background-color,border-color,color,transform] duration-150 ease-standard hover:border-line-strong hover:bg-surface-hover hover:text-ink active:scale-[0.98]"
              >
                {p.name}
                <ArrowRight
                  size={12}
                  className="transition-transform duration-150 ease-standard group-hover:translate-x-0.5"
                />
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function TaskGroup({
  title, tone, tasks, nameOf, overdue = false,
}: {
  title: string;
  tone: "danger" | "muted";
  tasks: DueSoonTask[];
  nameOf: Record<string, string>;
  overdue?: boolean;
}) {
  return (
    <Card className="p-5">
      {/* Başlıkta adet YOK — "Geciken · 7" bir puan tablosu gibi okunuyordu.
          Kaç tane olduğu zaten satırları sayarak görülüyor. */}
      <h2 className={cn("mb-3 text-sm font-semibold", tone === "danger" ? "text-danger" : "text-ink")}>
        {title}
      </h2>
      <div className="divide-y divide-hairline">
        {tasks.map((t) => {
          const who = t.assignee_id ? nameOf[t.assignee_id] : null;
          return (
            <Link
              key={t.id}
              prefetch={false}
              href={`/tasks/${t.id}`}
              className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors duration-150 ease-standard hover:bg-surface-hover"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink transition-colors duration-150 group-hover:text-brand">
                {t.title}
              </span>
              {who && (
                <span className="hidden max-w-32 shrink-0 truncate text-xs text-muted sm:inline">
                  {who}
                </span>
              )}
              <span
                className={cn(
                  "w-16 shrink-0 text-right text-xs font-medium tabular-nums",
                  overdue ? "text-danger" : "text-muted",
                )}
              >
                {formatDateTR(t.due_date, { day: "numeric", month: "short" })}
              </span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
