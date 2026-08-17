import { redirect } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { startOfWeek, addDays, format, parseISO, isValid } from "date-fns";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { maybeDatabaseSetupRequired } from "@/lib/utils/supabase-errors";
import { PlanningBoard } from "@/components/planning/PlanningBoard";
import type {
  PlanningMeeting, PlanningTopic, PlanningMeetingWithTopics, PlanningTemplate,
  PlanningOpenItem, PlanningWeekMatrixRow, PlanningProcessStep,
} from "@/types";

export const dynamic = "force-dynamic";

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirect("/login");
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;

  const sp = await searchParams;
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
        <ModulePageHeader
          title="Planlama"
          description="Haftalık toplantı takvimi — günlere ve saatlere göre toplantılar ve konular."
          icon={CalendarRange}
          secondaryBackHref="/board"
        />
        <SetupRequiredNotice
          variant="block"
          title="Planlama tabloları henüz oluşturulmadı"
          message={setup.message ?? "Planlama için veritabanı güncellemesi bekleniyor."}
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

  // Sistemdeki üyeler — "Kim" seçimi + baş-harf gösterimi için.
  const membersRes = await supabase
    .from("workspace_members")
    .select("user_id, profiles(id, full_name, email)")
    .eq("workspace_id", workspaceId);
  const members: { id: string; name: string }[] = [];
  const memberNames: Record<string, string> = {};
  for (const m of membersRes.data ?? []) {
    const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as
      | { id: string; full_name: string | null; email: string | null }
      | null;
    if (p) {
      const name = p.full_name || p.email || "—";
      members.push({ id: m.user_id as string, name });
      memberNames[m.user_id as string] = name;
    }
  }

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
