import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TaskListView } from "@/components/list/TaskListView";
import type { Task, SavedView, Profile, WorkspaceContact, WorkspaceDepartment } from "@/types";

export const metadata = { title: "Liste" };

export default async function ListPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string; view?: string }>;
}) {
  const params = await searchParams;
  const initialPerson = typeof params.person === "string" ? params.person : "";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1);
  const workspaceId = memberRows?.[0]?.workspace_id;
  if (!workspaceId) return <div className="p-8 text-gray-500">Çalışma alanı bulunamadı.</div>;
  const isAdmin = memberRows?.[0]?.role === "owner" || memberRows?.[0]?.role === "admin";

  // Non-admins never see admin_only tasks (RLS + explicit filter as backstop).
  const tasksQuery = supabase
    .from("tasks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .neq("status", "archived");
  if (!isAdmin) tasksQuery.eq("visibility", "workspace");

  const [tasksResult, viewsResult, membersResult, contactsResult, deptsResult, deptMembersResult] = await Promise.all([
    tasksQuery.order("created_at", { ascending: false }),
    supabase
      .from("saved_views")
      .select("*")
      .eq("workspace_id", workspaceId)
      .or(`is_shared.eq.true,owner_id.eq.${user.id}`)
      .order("position"),
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
    supabase
      .from("department_members")
      .select("department_id, member_id")
      .eq("workspace_id", workspaceId),
  ]);

  const tasks: Task[] = tasksResult.data ?? [];
  const savedViews: SavedView[] = viewsResult.data ?? [];
  type ProfileLite = Pick<Profile, "id" | "full_name" | "email">;
  type MemberRow = { id: string; user_id: string; role: string; profiles: ProfileLite | ProfileLite[] | null };
  const memberRowsData = (membersResult.data ?? []) as unknown as MemberRow[];
  const profiles: ProfileLite[] = memberRowsData
    .flatMap((m) => (Array.isArray(m.profiles) ? m.profiles : m.profiles ? [m.profiles] : []));
  const members = memberRowsData.map((m) => {
    const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return {
      memberId: m.id, userId: m.user_id, name: prof?.full_name ?? prof?.email ?? "—",
      isAdmin: m.role === "owner" || m.role === "admin",
    };
  });
  const deptMembers = (deptMembersResult.data ?? []) as { department_id: string; member_id: string }[];
  const contacts: WorkspaceContact[] = (contactsResult.data ?? []) as WorkspaceContact[];
  const departments = (deptsResult.data ?? []) as WorkspaceDepartment[];

  return (
    <TaskListView
      tasks={tasks}
      savedViews={savedViews}
      workspaceId={workspaceId}
      userId={user.id}
      profiles={profiles}
      contacts={contacts}
      departments={departments}
      members={members}
      deptMembers={deptMembers}
      isAdmin={isAdmin}
      initialPerson={initialPerson}
    />
  );
}
