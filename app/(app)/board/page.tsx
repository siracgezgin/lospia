import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { KanbanBoard } from "@/components/board/KanbanBoard";
import type { Task, SavedView, Profile, WorkspaceContact, WorkspaceNote, WorkspaceRole, WorkspaceDepartment, TaskParticipant } from "@/types";

export type BoardRule = { id: string; title: string; category: string | null; updated_at: string };
export type BoardMember = { memberId: string; userId: string; name: string; isAdmin?: boolean };

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

  // Admin_only tasks are hidden from non-admins at the RLS layer; we also filter
  // explicitly here as defense-in-depth (and so counts/columns never include them).
  const isAdmin = userRole === "owner" || userRole === "admin";
  const tasksQuery = supabase
    .from("tasks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .is("deleted_at", null);
  if (!isAdmin) tasksQuery.eq("visibility", "workspace");

  const [tasksResult, viewsResult, profilesResult, contactsResult, notesResult, rulesResult, deptsResult, completionsResult, deptMembersResult] = await Promise.all([
    tasksQuery.order("fractional_index"),
    supabase
      .from("saved_views")
      .select("*")
      .eq("workspace_id", workspaceId)
      .or(`is_shared.eq.true,owner_id.eq.${user.id}`)
      .order("position"),
    // Member profiles via a single join (no sequential sub-query). Includes the
    // workspace_members row id so we can build the dept-filtered responsible picker.
    supabase
      .from("workspace_members")
      .select("id, user_id, role, profiles(id, full_name, email)")
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
    // Departments — drive card colours and the Departman filter
    supabase
      .from("workspace_departments")
      .select("id, parent_id, name, color_key")
      .eq("workspace_id", workspaceId)
      .order("position"),
    // Per-person completions → participant chips on cards
    supabase
      .from("task_member_completions")
      .select("task_id, member_id, completed_at, workspace_members(id, profiles(id, full_name, email))")
      .eq("workspace_id", workspaceId),
    // Department assignments → drive the create-task responsible picker filter
    supabase
      .from("department_members")
      .select("department_id, member_id")
      .eq("workspace_id", workspaceId),
  ]);

  const tasks: Task[] = tasksResult.data ?? [];
  const savedViews: SavedView[] = viewsResult.data ?? [];
  type ProfileLite = Pick<Profile, "id" | "full_name" | "email">;
  type MemberRow = { id: string; user_id: string; role: string; profiles: ProfileLite | ProfileLite[] | null };
  const memberRowsData = (profilesResult.data ?? []) as unknown as MemberRow[];
  const profiles: ProfileLite[] = memberRowsData
    .flatMap((m) => (Array.isArray(m.profiles) ? m.profiles : m.profiles ? [m.profiles] : []));
  // Workspace members keyed by workspace_members.id — the unit task participants use.
  const members: BoardMember[] = memberRowsData.map((m) => {
    const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return {
      memberId: m.id, userId: m.user_id, name: prof?.full_name ?? prof?.email ?? "—",
      isAdmin: m.role === "owner" || m.role === "admin",
    };
  });
  const deptMembers = (deptMembersResult.data ?? []) as { department_id: string; member_id: string }[];
  const contacts: WorkspaceContact[] = (contactsResult.data ?? []) as WorkspaceContact[];
  const notes: WorkspaceNote[] = (notesResult.data ?? []) as WorkspaceNote[];
  const activeRules = (rulesResult.data ?? []) as BoardRule[];
  const newRulesCount = lastRulesSeen
    ? activeRules.filter((r) => r.updated_at > lastRulesSeen).length
    : activeRules.length;
  const departments = (deptsResult.data ?? []) as WorkspaceDepartment[];

  // Build participants-by-task map for card chips.
  type CompRow = {
    task_id: string;
    member_id: string;
    completed_at: string | null;
    workspace_members:
      | { id: string; profiles: ProfileLite | ProfileLite[] | null }
      | { id: string; profiles: ProfileLite | ProfileLite[] | null }[]
      | null;
  };
  const participantsByTask: Record<string, TaskParticipant[]> = {};
  for (const row of (completionsResult.data ?? []) as unknown as CompRow[]) {
    const wm = Array.isArray(row.workspace_members) ? row.workspace_members[0] : row.workspace_members;
    const prof = wm && (Array.isArray(wm.profiles) ? wm.profiles[0] : wm.profiles);
    if (!prof) continue;
    (participantsByTask[row.task_id] ??= []).push({
      memberId: row.member_id,
      userId: prof.id,
      name: prof.full_name ?? prof.email ?? "—",
      completed: row.completed_at != null,
    });
  }

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
      departments={departments}
      participantsByTask={participantsByTask}
      members={members}
      deptMembers={deptMembers}
      userRole={userRole}
    />
  );
}
