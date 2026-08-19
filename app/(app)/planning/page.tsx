import { redirect } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { startOfWeek, addDays, format, parseISO, isValid, startOfYear, endOfYear } from "date-fns";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { maybeDatabaseSetupRequired } from "@/lib/utils/supabase-errors";
import { PlanningBoard } from "@/components/planning/PlanningBoard";
import { CalendarViewSwitch } from "@/components/planning/CalendarViewSwitch";
import { asCalendarScale } from "@/lib/planning/calendar-scale";
import { CalendarYearView, type YearDayLoad } from "@/components/planning/CalendarYearView";
import { CalendarView } from "@/components/calendar/CalendarView";
import type {
  PlanningMeeting, PlanningTopic, PlanningMeetingWithTopics, PlanningTemplate,
  PlanningOpenItem, PlanningWeekMatrixRow, PlanningProcessStep,
  Task, Profile, WorkspaceContact, WorkspaceDepartment,
} from "@/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calendar" };

/**
 * Calendar — TEK takvim.
 *
 * Aslı Hanım (2026-08-19): "Bu takvimi ben buraya entegre edeyim bence. Bence
 * tek takvim yap. Buradan görebilelim." Eskiden ayrı iki ekran vardı
 * (Planlama = haftalık toplantı ızgarası, Görev Takvimi = aylık görev grid'i);
 * artık aynı sayfanın üç ölçeği: Hafta · Ay · Yıl.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; v?: string; d?: string }>;
}) {
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirect("/login");
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;

  const sp = await searchParams;
  const scale = asCalendarScale(sp.v);

  // Sistemdeki üyeler — her ölçekte lazım (Kim rozetleri, kişi seçimi).
  const membersRes = await supabase
    .from("workspace_members")
    .select("id, user_id, role, profiles(id, full_name, email, avatar_url)")
    .eq("workspace_id", workspaceId);
  type ProfileLite = Pick<Profile, "id" | "full_name" | "email" | "avatar_url">;
  type MemberRow = { id: string; user_id: string; role: string; profiles: ProfileLite | ProfileLite[] | null };
  const memberRowsData = (membersRes.data ?? []) as unknown as MemberRow[];
  const members: { id: string; name: string }[] = [];
  const memberNames: Record<string, string> = {};
  for (const m of memberRowsData) {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    if (p) {
      const name = p.full_name || p.email || "—";
      members.push({ id: m.user_id, name });
      memberNames[m.user_id] = name;
    }
  }

  const header = (
    <ModulePageHeader
      title="Calendar"
      description={
        scale === "hafta"
          ? (isAdmin
            ? "Haftalık toplantı ızgarası — gün, saat, konu ve sorumlular."
            : "Haftalık toplantı ızgarası — takvimi yöneticiler düzenler; size atanan işler Board’da görünür.")
          : scale === "ay"
            ? "Ay görünümü — görevler teslim tarihine göre."
            : "Yıl görünümü — 12 ay bir arada; bir güne tıklayınca o gün açılır."
      }
      icon={CalendarRange}
      secondaryBackHref="/board"
      rightSlot={<CalendarViewSwitch scale={scale} />}
    />
  );

  // ── Ay ve Yıl: görev verisi ────────────────────────────────────────────────
  if (scale === "ay" || scale === "yil") {
    const tasksQuery = supabase
      .from("tasks")
      .select("id, title, status, priority, due_date, start_date, department_id, visibility")
      .eq("workspace_id", workspaceId)
      .neq("status", "archived")
      .is("archived_at", null)
      .is("deleted_at", null);
    if (!isAdmin) tasksQuery.eq("visibility", "workspace");

    const [tasksResult, contactsResult, deptsResult, deptMembersResult] = await Promise.all([
      tasksQuery.or("due_date.not.is.null,start_date.not.is.null"),
      supabase.from("workspace_contacts").select("*").eq("workspace_id", workspaceId).order("created_at"),
      supabase.from("workspace_departments").select("id, parent_id, name, color_key").eq("workspace_id", workspaceId).order("position"),
      supabase.from("department_members").select("department_id, member_id").eq("workspace_id", workspaceId),
    ]);

    const tasks = (tasksResult.data ?? []) as Pick<
      Task, "id" | "title" | "status" | "priority" | "due_date" | "start_date" | "department_id" | "visibility"
    >[];
    const profiles: ProfileLite[] = memberRowsData.flatMap((m) =>
      Array.isArray(m.profiles) ? m.profiles : m.profiles ? [m.profiles] : []);
    const calMembers = memberRowsData.map((m) => {
      const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      return { memberId: m.id, userId: m.user_id, name: prof?.full_name ?? prof?.email ?? "—" };
    });
    const contacts = (contactsResult.data ?? []) as WorkspaceContact[];
    const departments = (deptsResult.data ?? []) as WorkspaceDepartment[];
    const deptMembers = (deptMembersResult.data ?? []) as { department_id: string; member_id: string }[];

    if (scale === "ay") {
      return (
        <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
          {header}
          <CalendarView
            embedded
            initialDate={sp.d ?? null}
            tasks={tasks}
            workspaceId={workspaceId}
            profiles={profiles}
            contacts={contacts}
            departments={departments}
            members={calMembers}
            deptMembers={deptMembers}
            isAdmin={isAdmin}
          />
        </div>
      );
    }

    // Yıl — gün yoğunluğu haritası (görev + toplantı). Toplantı tablosu henüz
    // migrate edilmediyse yalnız görevler sayılır; sayfa çalışmaya devam eder.
    const focusYear = sp.d && isValid(parseISO(sp.d)) ? parseISO(sp.d).getFullYear() : new Date().getFullYear();
    const yearStart = format(startOfYear(new Date(focusYear, 0, 1)), "yyyy-MM-dd");
    const yearEnd = format(endOfYear(new Date(focusYear, 0, 1)), "yyyy-MM-dd");
    const meetingDaysRes = await supabase
      .from("planning_meetings")
      .select("meeting_date")
      .eq("workspace_id", workspaceId)
      .gte("meeting_date", yearStart)
      .lte("meeting_date", yearEnd);

    const loadByDay: Record<string, YearDayLoad> = {};
    const bump = (iso: string, key: keyof YearDayLoad) => {
      (loadByDay[iso] ??= { tasks: 0, meetings: 0 })[key]++;
    };
    for (const t of tasks) {
      const iso = (t.due_date ?? t.start_date)?.slice(0, 10);
      if (iso) bump(iso, "tasks");
    }
    for (const m of (meetingDaysRes.data ?? []) as { meeting_date: string }[]) {
      bump(String(m.meeting_date).slice(0, 10), "meetings");
    }

    return (
      <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
        {header}
        <CalendarYearView loadByDay={loadByDay} initialYear={focusYear} />
      </div>
    );
  }

  // ── Hafta (varsayılan) — haftalık toplantı ızgarası ────────────────────────
  const ref = sp.week && isValid(parseISO(sp.week)) ? parseISO(sp.week) : new Date();
  const monday = startOfWeek(ref, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const isoDays = days.map((d) => format(d, "yyyy-MM-dd"));
  const weekStart = isoDays[0];
  const weekEnd = isoDays[6];

  const meetingsRes = await supabase
    .from("planning_meetings")
    .select("*")
    .eq("workspace_id", workspaceId)
    .gte("meeting_date", weekStart)
    .lte("meeting_date", weekEnd)
    .order("time_slot", { ascending: true })
    .order("position", { ascending: true });

  const setup = maybeDatabaseSetupRequired(meetingsRes.error);
  if (setup.setupRequired) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        {header}
        <SetupRequiredNotice
          variant="block"
          title="Takvim tabloları henüz oluşturulmadı"
          message={setup.message ?? "Calendar için veritabanı güncellemesi bekleniyor."}
        />
      </div>
    );
  }

  const meetings = (meetingsRes.data ?? []) as unknown as PlanningMeeting[];
  const ids = meetings.map((m) => m.id);
  let topics: PlanningTopic[] = [];
  if (ids.length) {
    const topicsRes = await supabase
      .from("planning_topics")
      .select("*")
      .in("meeting_id", ids)
      .order("position", { ascending: true });
    topics = (topicsRes.data ?? []) as unknown as PlanningTopic[];
  }

  const byMeeting = new Map<string, PlanningTopic[]>();
  for (const t of topics) {
    if (!byMeeting.has(t.meeting_id)) byMeeting.set(t.meeting_id, []);
    byMeeting.get(t.meeting_id)!.push(t);
  }
  const withTopics: PlanningMeetingWithTopics[] = meetings.map((m) => ({
    ...m,
    topics: byMeeting.get(m.id) ?? [],
  }));

  // Hafta şablonları — "Haftayı kur" + Şablonlar yöneticisi için. Tablo henüz
  // migrate edilmediyse boş liste (sayfa çalışmaya devam eder).
  const templatesRes = await supabase
    .from("planning_templates")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("weekday", { ascending: true })
    .order("time_slot", { ascending: true })
    .order("position", { ascending: true });
  const templates = (templatesRes.data ?? []) as unknown as PlanningTemplate[];

  // "Tamamlanmamış Eksik Konular" — haftadan bağımsız açık konu defteri. Tablo
  // henüz migrate edilmediyse bölüm kendi içinde bilgi notu gösterir, sayfa
  // çalışmaya devam eder.
  const openItemsRes = await supabase
    .from("planning_open_items")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("done", { ascending: true })
    .order("position", { ascending: true });
  const openItems = (openItemsRes.data ?? []) as unknown as PlanningOpenItem[];

  // Takvimin altındaki "Tarih/Saat × departman" matrisi — haftaya bağlı.
  const matrixRes = await supabase
    .from("planning_week_matrix")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("week_start", weekStart)
    .order("weekday", { ascending: true })
    .order("position", { ascending: true });
  const matrix = (matrixRes.data ?? []) as unknown as PlanningWeekMatrixRow[];

  // "Adımlar / Operasyon Kurgusu" — haftadan bağımsız sabit akış.
  const stepsRes = await supabase
    .from("planning_process_steps")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("position", { ascending: true });
  const processSteps = (stepsRes.data ?? []) as unknown as PlanningProcessStep[];

  return (
    <PlanningBoard
      meetings={withTopics}
      weekDays={isoDays}
      weekStart={weekStart}
      members={members}
      memberNames={memberNames}
      templates={templates}
      isAdmin={isAdmin}
      currentUserId={user.id}
      openItems={openItems}
      openItemsAvailable={!openItemsRes.error}
      matrix={matrix}
      matrixAvailable={!matrixRes.error}
      processSteps={processSteps}
      processStepsAvailable={!stepsRes.error}
    />
  );
}
