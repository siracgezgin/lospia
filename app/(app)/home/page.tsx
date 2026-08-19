import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CalendarRange,
  CheckSquare,
  CircleDot,
  Wallet,
} from "lucide-react";
import { startOfWeek, addDays, format } from "date-fns";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ShortcutCard } from "@/components/home/ShortcutCard";
import {
  MODULE_GROUP_TITLES,
  modulesForRole,
  type ModuleGroup,
} from "@/lib/modules/registry";
import { categoryMeta } from "@/lib/planning/categories";
import { STATUS_LABELS, PRIORITY_LABELS } from "@/lib/utils/task-constants";
import { cn } from "@/lib/utils/cn";
import type { TaskPriority, TaskStatus } from "@/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home Page" };

// Operasyon İstanbul saatiyle yaşar; sunucu (Vercel) UTC'dir — selamlama ve
// "bugün" hesabı bu yüzden Europe/Istanbul üzerinden yapılır.
const TZ = "Europe/Istanbul";

function istanbulNowParts(): { hour: number; todayIso: string; longDate: string } {
  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat("tr-TR", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(now),
  );
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
  const longDate = new Intl.DateTimeFormat("tr-TR", {
    day: "numeric", month: "long", year: "numeric", weekday: "long", timeZone: TZ,
  }).format(now);
  return { hour, todayIso, longDate };
}

function greetingFor(hour: number): string {
  if (hour < 6) return "İyi geceler";
  if (hour < 12) return "Günaydın";
  if (hour < 18) return "İyi günler";
  return "İyi akşamlar";
}

/** "2026-07-28" → "28 Tem" — kompakt satır içi tarih. */
function shortTrDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(d);
}

type MyTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority | null;
  due_date: string | null;
};

type HomeMeeting = {
  id: string;
  meeting_date: string;
  time_slot: string;
  category: string | null;
  title: string | null;
};

export default async function HomePage() {
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirect("/login");
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;

  const { hour, todayIso, longDate } = istanbulNowParts();
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekStart = format(monday, "yyyy-MM-dd");
  const weekEnd = format(addDays(monday, 6), "yyyy-MM-dd");

  // Bana atanan açık görevler — Liste/Pano'daki "Bana atananlar" merceğiyle
  // aynı sözleşme (assignee bazlı, silinmiş/arşivlenmiş hariç).
  const myTasksQuery = supabase
    .from("tasks")
    .select("id, title, status, priority, due_date")
    .eq("workspace_id", workspaceId)
    .eq("assignee_id", user.id)
    .not("status", "in", "(done,archived)")
    .is("deleted_at", null)
    .is("archived_at", null)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(50);
  if (!isAdmin) myTasksQuery.eq("visibility", "workspace");

  const [myTasksRes, meetingsRes, profileRes, reviewCountRes, paymentCountRes] = await Promise.all([
    myTasksQuery,
    supabase
      .from("planning_meetings")
      .select("id, meeting_date, time_slot, category, title")
      .eq("workspace_id", workspaceId)
      .gte("meeting_date", weekStart)
      .lte("meeting_date", weekEnd)
      .order("meeting_date", { ascending: true })
      .order("time_slot", { ascending: true })
      .order("position", { ascending: true }),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    isAdmin
      ? supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .eq("status", "review")
          .is("deleted_at", null)
          .is("archived_at", null)
      : Promise.resolve({ count: null }),
    isAdmin
      ? supabase
          .from("finance_payments")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .eq("status", "bekliyor")
      : Promise.resolve({ count: null, error: null }),
  ]);

  const myTasks = (myTasksRes.data ?? []) as MyTask[];
  const overdueCount = myTasks.filter((t) => t.due_date && t.due_date.slice(0, 10) < todayIso).length;
  const visibleTasks = myTasks.slice(0, 8);

  // Takvim tablosu migrate edilmemişse sessizce boş kalır — Home Page çökmez.
  const weekMeetings = (meetingsRes.error ? [] : (meetingsRes.data ?? [])) as HomeMeeting[];
  const todayMeetings = weekMeetings.filter((m) => m.meeting_date === todayIso);

  const fullName = (profileRes.data?.full_name as string | null) ?? null;
  const firstName = fullName?.trim().split(/\s+/)[0] ?? null;

  const reviewCount = "count" in reviewCountRes ? (reviewCountRes.count ?? null) : null;
  const paymentCount =
    "error" in paymentCountRes && paymentCountRes.error
      ? null
      : ((paymentCountRes as { count: number | null }).count ?? null);

  const shortcuts = modulesForRole(isAdmin);
  const groups: ModuleGroup[] = ["calisma", "urun", "ofis", "yonetim"];

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      {/* Karşılama */}
      <div className="mb-6 lg:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {greetingFor(hour)}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted">{longDate}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5 2xl:gap-6">
        {/* Bana atanan görevler */}
        <section className="lg:col-span-2 rounded-2xl border border-line bg-surface p-5 shadow-card lg:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckSquare size={16} className="text-brand" />
              <h2 className="text-[15px] font-semibold tracking-tight text-ink">
                Bana atanan görevler
              </h2>
            </div>
            <div className="flex items-center gap-2 text-[12px]">
              <span className="rounded-md bg-brand-soft px-2 py-0.5 font-medium tabular-nums text-brand-strong">
                {myTasks.length} açık
              </span>
              {overdueCount > 0 && (
                <span className="rounded-md bg-red-50 px-2 py-0.5 font-medium tabular-nums text-red-700">
                  {overdueCount} geciken
                </span>
              )}
            </div>
          </div>

          {visibleTasks.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line bg-surface-muted px-4 py-8 text-center text-sm text-muted">
              Üzerinize atanmış açık görev yok.{" "}
              <Link
                href="/board"
                className="font-medium text-brand transition-colors duration-150 hover:text-brand-strong"
              >
                Pano&apos;yu açın
              </Link>
            </p>
          ) : (
            <ul className="divide-y divide-hairline stagger-children">
              {visibleTasks.map((t) => {
                const due = t.due_date ? t.due_date.slice(0, 10) : null;
                const isOverdue = due !== null && due < todayIso;
                const urgent = t.priority === "urgent" || t.priority === "high";
                return (
                  <li key={t.id}>
                    <Link
                      href={`/tasks/${t.id}`}
                      className="group flex items-center gap-3 py-2.5 transition-colors duration-150 hover:bg-surface-muted rounded-lg px-2 -mx-2"
                    >
                      <CircleDot size={13} className="shrink-0 text-subtle" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink transition-colors duration-150 group-hover:text-brand-strong">
                        {t.title}
                      </span>
                      {urgent && t.priority && (
                        <span className="hidden sm:inline rounded-md bg-amber-50 px-1.5 py-0.5 text-[12px] font-medium text-amber-800">
                          {PRIORITY_LABELS[t.priority]}
                        </span>
                      )}
                      <span className="hidden sm:inline text-[12px] text-subtle">
                        {STATUS_LABELS[t.status]}
                      </span>
                      <span
                        className={cn(
                          "w-16 text-right text-[12px] tabular-nums",
                          isOverdue ? "font-semibold text-red-600" : "text-muted",
                        )}
                      >
                        {due ? shortTrDate(due) : "—"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-3 border-t border-hairline pt-3">
            <Link
              href="/list?view=mine"
              className="group inline-flex items-center gap-1.5 text-sm font-medium text-brand transition-colors duration-150 hover:text-brand-strong"
            >
              Tümünü Liste&apos;de gör
              <ArrowRight
                size={13}
                className="transition-transform duration-150 ease-standard group-hover:translate-x-0.5"
              />
            </Link>
          </div>
        </section>

        {/* Sağ sütun: bugünün toplantıları + yönetici sayaçları */}
        <div className="space-y-4 lg:space-y-5">
          <section className="rounded-2xl border border-line bg-surface p-5 shadow-card lg:p-6">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CalendarRange size={16} className="text-brand" />
                <h2 className="text-[15px] font-semibold tracking-tight text-ink">Bugün</h2>
              </div>
              <span className="text-[12px] tabular-nums text-subtle">
                bu hafta {weekMeetings.length} toplantı
              </span>
            </div>
            {todayMeetings.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line bg-surface-muted px-4 py-5 text-center text-sm text-muted">
                Bugün planlı toplantı yok.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {todayMeetings.slice(0, 5).map((m) => {
                  const meta = categoryMeta(m.category);
                  return (
                    <li key={m.id} className="flex items-center gap-2.5 text-sm">
                      <span className="w-11 shrink-0 font-semibold tabular-nums text-ink">
                        {m.time_slot.slice(0, 5)}
                      </span>
                      <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} />
                      <span className="min-w-0 truncate text-ink">
                        {m.title?.trim() || meta.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-3 border-t border-hairline pt-3">
              <Link
                href="/planning"
                className="group inline-flex items-center gap-1.5 text-sm font-medium text-brand transition-colors duration-150 hover:text-brand-strong"
              >
                Calendar&apos;ı aç
                <ArrowRight
                  size={13}
                  className="transition-transform duration-150 ease-standard group-hover:translate-x-0.5"
                />
              </Link>
            </div>
          </section>

          {isAdmin && (
            <section className="rounded-2xl border border-line bg-surface p-5 shadow-card lg:p-6">
              <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">
                Yönetici özeti
              </h2>
              <div className="space-y-2">
                <Link
                  href="/board?view=waiting-approval"
                  className="group flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 -mx-2 transition-colors duration-150 hover:bg-surface-muted"
                >
                  <span className="flex items-center gap-2 text-sm text-ink">
                    <AlertTriangle size={14} className="text-amber-500" />
                    Onay bekleyen görev
                  </span>
                  <span className="rounded-md bg-brand-soft px-2 py-0.5 text-[12px] font-medium tabular-nums text-brand-strong">
                    {reviewCount ?? "—"}
                  </span>
                </Link>
                <Link
                  href="/finance"
                  className="group flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 -mx-2 transition-colors duration-150 hover:bg-surface-muted"
                >
                  <span className="flex items-center gap-2 text-sm text-ink">
                    <Wallet size={14} className="text-brand" />
                    Bekleyen ödeme
                  </span>
                  <span className="rounded-md bg-brand-soft px-2 py-0.5 text-[12px] font-medium tabular-nums text-brand-strong">
                    {paymentCount ?? "—"}
                  </span>
                </Link>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Kısayollar — modül dizininden, role göre; isimler sidebar ile birebir. */}
      <div className="mt-8 lg:mt-10">
        <h2 className="mb-1 text-base font-semibold tracking-tight text-ink">Kısayollar</h2>
        <p className="mb-4 text-[13px] text-muted">
          Her ekran sistemde tek isimle yaşar — buradaki adlar sol menüyle aynıdır.
        </p>
        {groups.map((group) => {
          const items = shortcuts.filter((m) => m.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="mb-6">
              <h3 className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">
                {MODULE_GROUP_TITLES[group]}
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 stagger-children">
                {items.map((entry) => (
                  <ShortcutCard key={entry.key} entry={entry} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
