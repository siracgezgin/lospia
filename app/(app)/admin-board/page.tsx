import { createClient, getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { KanbanBoard, type ManagerOption } from "@/components/board/KanbanBoard";
import { asVisibility, type TaskVisibility } from "@/lib/utils/visibility";
import type { Task, Profile, WorkspaceContact, WorkspaceDepartment, WorkspaceRole, TaskParticipant } from "@/types";
import type { BoardMember } from "@/app/(app)/board/page";

export default async function AdminBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ visibility?: string; manager?: string }>;
}) {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1);
  const workspaceId = memberRows?.[0]?.workspace_id;
  const userRole = (memberRows?.[0]?.role ?? "member") as WorkspaceRole;
  const isAdmin = userRole === "owner" || userRole === "admin";

  // Server-side guard: Yönetici Pano is owner/admin only. A member who guesses
  // the URL is sent back to the normal board (its existence isn't advertised).
  if (!workspaceId || !isAdmin) redirect("/board");

  const params = await searchParams;
  const visibility: TaskVisibility = asVisibility(params.visibility);
  const manager = params.manager ?? "all";

  const [tasksResult, profilesResult, contactsResult, deptsResult, completionsResult, deptMembersResult] =
    await Promise.all([
      // Admin sees every task via RLS; we still drop archived/deleted here.
      supabase
        .from("tasks")
        .select("*")
        .eq("workspace_id", workspaceId)
        .is("archived_at", null)
        .is("deleted_at", null)
        .order("fractional_index"),
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
        .from("workspace_departments")
        .select("id, parent_id, name, color_key")
        .eq("workspace_id", workspaceId)
        .order("position"),
      // Participants → both the card chips and the canonical responsibility map.
      supabase
        .from("task_member_completions")
        .select("task_id, member_id, completed_at, workspace_members(id, user_id, profiles(id, full_name, email))")
        .eq("workspace_id", workspaceId),
      supabase
        .from("department_members")
        .select("department_id, member_id")
        .eq("workspace_id", workspaceId),
    ]);

  const allTasks: Task[] = tasksResult.data ?? [];

  type ProfileLite = Pick<Profile, "id" | "full_name" | "email">;
  type MemberRow = { id: string; user_id: string; role: string; profiles: ProfileLite | ProfileLite[] | null };
  const memberRowsData = (profilesResult.data ?? []) as unknown as MemberRow[];

  const profiles: ProfileLite[] = memberRowsData.flatMap((m) =>
    Array.isArray(m.profiles) ? m.profiles : m.profiles ? [m.profiles] : [],
  );
  const members: BoardMember[] = memberRowsData.map((m) => {
    const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return {
      memberId: m.id,
      userId: m.user_id,
      name: prof?.full_name ?? prof?.email ?? "—",
      isAdmin: m.role === "owner" || m.role === "admin",
    };
  });

  // Manager (owner/admin) people only — drive the person filter and the canonical
  // "manager responsible" set.
  const managerUserIds = members.filter((m) => m.isAdmin && m.userId).map((m) => m.userId);
  const managerUserIdSet = new Set(managerUserIds);
  const managers: ManagerOption[] = members
    .filter((m) => m.isAdmin && m.userId)
    .map((m) => ({ userId: m.userId, name: m.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));

  // Card participant chips + canonical responsible user_ids, from one query.
  type CompRow = {
    task_id: string;
    member_id: string;
    completed_at: string | null;
    workspace_members:
      | { id: string; user_id: string | null; profiles: ProfileLite | ProfileLite[] | null }
      | { id: string; user_id: string | null; profiles: ProfileLite | ProfileLite[] | null }[]
      | null;
  };
  const participantsByTask: Record<string, TaskParticipant[]> = {};
  const participantUsersByTask: Record<string, string[]> = {};
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
    if (wm?.user_id) (participantUsersByTask[row.task_id] ??= []).push(wm.user_id);
  }

  const responsibleByTask: Record<string, string[]> = {};
  for (const t of allTasks) {
    const participants = participantUsersByTask[t.id];
    if (participants && participants.length > 0) {
      responsibleByTask[t.id] = Array.from(new Set(participants));
    } else if (t.assignee_id) {
      responsibleByTask[t.id] = [t.assignee_id];
    } else {
      responsibleByTask[t.id] = [];
    }
  }

  // Candidate set passed to the board (both visibilities; the tab is a client
  // filter). admin_only is managers-only by construction; workspace tasks must
  // have at least one manager responsible to belong on the manager board.
  const tasks = allTasks.filter((t) => {
    if (asVisibility(t.visibility) === "admin_only") return true;
    return (responsibleByTask[t.id] ?? []).some((uid) => managerUserIdSet.has(uid));
  });

  const contacts: WorkspaceContact[] = (contactsResult.data ?? []) as WorkspaceContact[];
  const departments = (deptsResult.data ?? []) as WorkspaceDepartment[];
  const deptMembers = (deptMembersResult.data ?? []) as { department_id: string; member_id: string }[];

  return (
    <KanbanBoard
      tasks={tasks}
      savedViews={[]}
      viewSlug={null}
      workspaceId={workspaceId}
      userId={user.id}
      profiles={profiles}
      contacts={contacts}
      notes={[]}
      departments={departments}
      participantsByTask={participantsByTask}
      members={members}
      deptMembers={deptMembers}
      userRole={userRole}
      adminBoard={{
        visibility,
        manager,
        managers,
        managerUserIds,
        responsibleByTask,
      }}
    />
  );
}
