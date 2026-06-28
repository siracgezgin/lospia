import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { KanbanBoard } from "@/components/board/KanbanBoard";
import type { Task, SavedView, Profile, WorkspaceContact, WorkspaceNote, WorkspaceRole } from "@/types";

export type BoardRule = { id: string; title: string; category: string | null; updated_at: string };

function parseWeekParam(weekStr?: string): string | null {
  if (!weekStr) return null;
  const d = new Date(weekStr + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  return weekStr.slice(0, 10);
}

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; week?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const weekIso = parseWeekParam(params.week);

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, last_rules_seen_at")
    .eq("user_id", user.id)
    .limit(1);
  const workspaceId = memberRows?.[0]?.workspace_id;
  const lastRulesSeen = memberRows?.[0]?.last_rules_seen_at ?? null;
  const userRole = (memberRows?.[0]?.role ?? "member") as WorkspaceRole;

  if (!workspaceId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <h2 className="text-base font-semibold text-gray-800 mb-2">Çalışma alanı bulunamadı</h2>
          <p className="text-sm text-gray-500 mb-4">
            Çalışma alanınız yüklenemedi. Bu genellikle geçici bir sorundur.
          </p>
          <a href="/board" className="inline-block text-sm text-blue-600 hover:underline">
            Yenile
          </a>
        </div>
      </div>
    );
  }

  const [tasksResult, viewsResult, profilesResult, contactsResult, notesResult, rulesResult] = await Promise.all([
    supabase
      .from("tasks")
      .select("*")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .is("deleted_at", null)
      .order("fractional_index"),
    supabase
      .from("saved_views")
      .select("*")
      .eq("workspace_id", workspaceId)
      .or(`is_shared.eq.true,owner_id.eq.${user.id}`)
      .order("position"),
    // Member profiles via a single join (no sequential sub-query)
    supabase
      .from("workspace_members")
      .select("profiles(id, full_name, email)")
      .eq("workspace_id", workspaceId),
    supabase
      .from("workspace_contacts")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at"),
    supabase
      .from("workspace_notes")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("position")
      .order("created_at"),
    // Active rules (compact list for the board panel + "new since last seen" count)
    supabase
      .from("workspace_rules")
      .select("id, title, category, updated_at")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .order("position"),
  ]);

  const tasks: Task[] = tasksResult.data ?? [];
  const savedViews: SavedView[] = viewsResult.data ?? [];
  type ProfileLite = Pick<Profile, "id" | "full_name" | "email">;
  const profiles: ProfileLite[] = (
    (profilesResult.data ?? []) as unknown as { profiles: ProfileLite | ProfileLite[] | null }[]
  )
    .flatMap((m) => (Array.isArray(m.profiles) ? m.profiles : m.profiles ? [m.profiles] : []));
  const contacts: WorkspaceContact[] = (contactsResult.data ?? []) as WorkspaceContact[];
  const notes: WorkspaceNote[] = (notesResult.data ?? []) as WorkspaceNote[];
  const activeRules = (rulesResult.data ?? []) as BoardRule[];
  const newRulesCount = lastRulesSeen
    ? activeRules.filter((r) => r.updated_at > lastRulesSeen).length
    : activeRules.length;
  const viewSlug = params.view ?? null;

  return (
    <KanbanBoard
      tasks={tasks}
      savedViews={savedViews}
      viewSlug={viewSlug}
      weekIso={weekIso}
      workspaceId={workspaceId}
      userId={user.id}
      profiles={profiles}
      contacts={contacts}
      notes={notes}
      rules={activeRules}
      newRulesCount={newRulesCount}
      userRole={userRole}
    />
  );
}
