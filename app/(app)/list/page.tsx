import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TaskListView } from "@/components/list/TaskListView";
import type { Task, SavedView, Profile, WorkspaceContact, WorkspaceDepartment } from "@/types";

export default async function ListPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1);
  const workspaceId = memberRows?.[0]?.workspace_id;
  if (!workspaceId) return <div className="p-8 text-gray-500">Çalışma alanı bulunamadı.</div>;

  const [tasksResult, viewsResult, membersResult, contactsResult, deptsResult] = await Promise.all([
    supabase
      .from("tasks")
      .select("*")
      .eq("workspace_id", workspaceId)
      .neq("status", "archived")
      .order("created_at", { ascending: false }),
    supabase
      .from("saved_views")
      .select("*")
      .eq("workspace_id", workspaceId)
      .or(`is_shared.eq.true,owner_id.eq.${user.id}`)
      .order("position"),
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
      .from("workspace_departments")
      .select("id, parent_id, name, color_key")
      .eq("workspace_id", workspaceId)
      .order("position"),
  ]);

  const tasks: Task[] = tasksResult.data ?? [];
  const savedViews: SavedView[] = viewsResult.data ?? [];
  type ProfileLite = Pick<Profile, "id" | "full_name" | "email">;
  const profiles: ProfileLite[] = (
    (membersResult.data ?? []) as unknown as { profiles: ProfileLite | ProfileLite[] | null }[]
  ).flatMap((m) => (Array.isArray(m.profiles) ? m.profiles : m.profiles ? [m.profiles] : []));
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
    />
  );
}
