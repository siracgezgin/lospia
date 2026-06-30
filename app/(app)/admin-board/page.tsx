import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdminBoardView, type ManagerOption } from "@/components/board/AdminBoardView";
import { asVisibility, type TaskVisibility } from "@/lib/utils/visibility";
import type { Task, Profile, WorkspaceContact, WorkspaceDepartment, WorkspaceRole } from "@/types";

type BoardMember = { memberId: string; userId: string; name: string; isAdmin?: boolean };

export default async function AdminBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ visibility?: string; manager?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
      // Participants drive canonical responsibility (their user_ids).
      supabase
        .from("task_member_completions")
        .select("task_id, member_id, workspace_members(id, user_id, role)")
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

  // Manager (owner/admin) people only — used for the person filter and as the
  // canonical "manager responsible" set.
  const managerUserIds = new Set(members.filter((m) => m.isAdmin && m.userId).map((m) => m.userId));
  const managers: ManagerOption[] = members
    .filter((m) => m.isAdmin && m.userId)
    .map((m) => ({ userId: m.userId, name: m.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));

  // Canonical responsible user_ids per task: participants' user_ids, falling
  // back to the task's assignee_id when there are no participant rows. Mirrors
  // the points / detail responsibility model used elsewhere.
  type CompRow = {
    task_id: string;
    member_id: string;
    workspace_members:
      | { id: string; user_id: string | null; role: string }
      | { id: string; user_id: string | null; role: string }[]
      | null;
  };
  const participantUsersByTask: Record<string, string[]> = {};
  for (const row of (completionsResult.data ?? []) as unknown as CompRow[]) {
    const wm = Array.isArray(row.workspace_members) ? row.workspace_members[0] : row.workspace_members;
    const uid = wm?.user_id;
    if (!uid) continue;
    (participantUsersByTask[row.task_id] ??= []).push(uid);
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

  // Candidate set sent to the client:
  //   • all admin_only tasks (managers-only by construction)
  //   • workspace tasks that have at least one manager responsible
  // Sundry workspace tasks owned only by members never reach the manager board.
  const tasks = allTasks.filter((t) => {
    const vis = asVisibility(t.visibility);
    if (vis === "admin_only") return true;
    return (responsibleByTask[t.id] ?? []).some((uid) => managerUserIds.has(uid));
  });

  // Prune the responsible map to the tasks we actually send.
  const responsibleForView: Record<string, string[]> = {};
  for (const t of tasks) responsibleForView[t.id] = responsibleByTask[t.id] ?? [];

  const contacts: WorkspaceContact[] = (contactsResult.data ?? []) as WorkspaceContact[];
  const departments = (deptsResult.data ?? []) as WorkspaceDepartment[];
  const deptMembers = (deptMembersResult.data ?? []) as { department_id: string; member_id: string }[];

  return (
    <AdminBoardView
      tasks={tasks}
      responsibleByTask={responsibleForView}
      managers={managers}
      workspaceId={workspaceId}
      userId={user.id}
      userRole={userRole}
      profiles={profiles}
      contacts={contacts}
      departments={departments}
      members={members}
      deptMembers={deptMembers}
      initialVisibility={visibility}
      initialManager={manager}
    />
  );
}
