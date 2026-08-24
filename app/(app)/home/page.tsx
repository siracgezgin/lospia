import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CalendarRange,
  CheckSquare,
  CircleDot,
} from "lucide-react";
import { startOfWeek, addDays, format } from "date-fns";
import { requireModuleMember } from "@/lib/modules/context";
import { getProfile } from "@/lib/supabase/server";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ShortcutCard } from "@/components/home/ShortcutCard";
import {
  MODULE_GROUP_TITLES,
  modulesForRole,
  type ModuleGroup,
} from "@/lib/modules/registry";
import { categoryMeta } from "@/lib/planning/categories";
import { PRIORITY_LABELS } from "@/lib/utils/task-constants";
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
  /* Hafta penceresi BUGÜNDEN türer, `new Date()`ten değil.
     todayIso İstanbul saatiyle, startOfWeek(new Date()) ise SUNUCU saatiyle
     hesaplanıyordu. Vercel UTC'de olduğu için gece yarısı–03:00 arasında ikisi
     farklı güne düşüyor: hafta bir önceki haftaya kayıyor ve "bugünkü toplantı"
     hep 0 çıkıyordu (Aslı Hanım, 2026-08-24 00:32'de bunu gördü). */
  const monday = startOfWeek(new Date(`${todayIso}T12:00:00`), { weekStartsOn: 1 });
  const weekStart = format(monday, "yyyy-MM-dd");
  const weekEnd = format(addDays(monday, 6), "yyyy-MM-dd");

  // Bana atanan açık görevler — Liste/Pano'daki "Bana atananlar" merceğiyle
  // aynı sözleşme (assignee bazlı, silinmiş/arşivlenmiş hariç).
  /* SORUMLULUK KURALI panonunkiyle AYNI olmalı: atanan VEYA katılımcı
     (applyPersonFilter). Burada yalnız assignee_id'ye bakılıyordu; katılımcı
     olarak yürüttüğü işler sayılmıyor, bu yüzden Ana Sayfa ile Pano farklı
     rakam gösteriyordu (Aslı Hanım, 2026-08-24: "bu kısımlar doğru
     çalışmıyor"). custom_fields->collaborators bir jsonb dizi; `cs` (contains)
     ile aranır. */
  const myTasksQuery = supabase
    .from("tasks")
    .select("id, title, status, priority, due_date")
    .eq("workspace_id", workspaceId)
    .or(`assignee_id.eq.${user.id},custom_fields->collaborators.cs.["${user.id}"]`)
    .not("status", "in", "(done,archived)")
    .is("deleted_at", null)
    .is("archived_at", null)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(50);
  if (!isAdmin) myTasksQuery.eq("visibility", "workspace");

  const [myTasksRes, meetingsRes, profile] = await Promise.all([
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
    // Kabuk aynı satırı zaten çekti — getProfile react/cache'li, ikinci
    // istek gitmez.
    getProfile(user.id),
  ]);

  const myTasks = (myTasksRes.data ?? []) as MyTask[];
  const visibleTasks = myTasks.slice(0, 8);

  // Takvim tablosu migrate edilmemişse sessizce boş kalır — Ana Sayfa çökmez.
  const weekMeetings = (meetingsRes.error ? [] : (meetingsRes.data ?? [])) as HomeMeeting[];
  const todayMeetings = weekMeetings.filter((m) => m.meeting_date === todayIso);

  const fullName = profile?.full_name ?? null;
  const firstName = fullName?.trim().split(/\s+/)[0] ?? null;

  /* DURUM ŞERİDİ KALDIRILDI.
     Sayfanın ilk satırında beş sayaç karosu duruyordu: "Açık işim · Geciken ·
     Bugünkü toplantı · Onay bekleyen · Bekleyen ödeme". Aslı Hanım
     (2026-08-24): "Boş laf istemiyorum. Boş hesap istemiyorum… Mühendis gibi
     hissetmek istemiyorum. İsmi, işi, tarihi bu kadar."
     Karolar zaten hemen altındaki iki listenin sayımıydı — rakam işin
     kendisinin önünde duruyordu. Yöneticinin iki sayacı (onay/ödeme) da
     buradan kalktı; ikisi de kendi modülünde yaşıyor. Yan fayda: sayfa iki
     sorgu daha az atıyor. */

  const shortcuts = modulesForRole(isAdmin);
  const groups: ModuleGroup[] = ["calisma", "urun", "yonetim"];

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

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3 lg:gap-5 2xl:gap-6">
        {/* Bana atanan görevler */}
        <section className="lg:col-span-2 rounded-2xl border border-line bg-surface p-5 shadow-card lg:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckSquare size={16} className="text-brand" />
              <h2 className="text-[15px] font-semibold tracking-tight text-ink">
                Bana atanan görevler
              </h2>
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
                const urgent = t.priority === "urgent";
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
                      {/* Durum etiketi satırdan KALKTI — "iş ve tarih" yeter.
                          Yalnız Acil kalıyor; o bir durum değil, bir uyarı. */}
                      {urgent && t.priority && (
                        <span className="hidden shrink-0 rounded-md bg-amber-50 px-1.5 py-0.5 text-[12px] font-medium text-amber-800 sm:inline">
                          {PRIORITY_LABELS[t.priority]}
                        </span>
                      )}
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

        </div>
      </div>

      {/* Kısayollar — modül dizininden, role göre; isimler sidebar ile birebir. */}
      <div className="mt-8 lg:mt-10">
        <h2 className="mb-1 text-base font-semibold tracking-tight text-ink">Kısayollar</h2>
        <p className="mb-4 text-[13px] text-muted">
          Sol menüyle aynı adlar.
        </p>
        {groups.map((group) => {
          const items = shortcuts.filter((m) => m.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="mb-5">
              <h3 className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">
                {MODULE_GROUP_TITLES[group]}
              </h3>
              <div className="flex flex-wrap gap-2">
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
