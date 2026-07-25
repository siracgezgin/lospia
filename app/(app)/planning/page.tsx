import { redirect } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { startOfWeek, addDays, format, parseISO, isValid } from "date-fns";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { SetupRequiredNotice } from "@/components/modules/SetupRequiredNotice";
import { maybeDatabaseSetupRequired } from "@/lib/utils/supabase-errors";
import { PlanningBoard } from "@/components/planning/PlanningBoard";
import type { PlanningMeeting, PlanningTopic, PlanningMeetingWithTopics } from "@/types";

export const dynamic = "force-dynamic";

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { supabase, user, workspaceId, gate } = await requireModuleMember();
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

  return (
    <PlanningBoard
      meetings={withTopics}
      weekDays={isoDays}
      weekStart={weekStart}
    />
  );
}
