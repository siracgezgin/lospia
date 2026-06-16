import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TaskListView } from "@/components/list/TaskListView";
import type { Task, SavedView, Profile, WorkspaceContact } from "@/types";

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

  const [tasksResult, viewsResult, profilesResult, contactsResult] = await Promise.all([
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
      .from("profiles")
      .select("id, full_name, email")
      .in(
        "id",
        (
          await supabase
            .from("workspace_members")
            .select("user_id")
            .eq("workspace_id", workspaceId)
        ).data?.map((m: { user_id: string }) => m.user_id) ?? []
      ),
    supabase
      .from("workspace_contacts")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at"),
  ]);

  const tasks: Task[] = tasksResult.data ?? [];
  const savedViews: SavedView[] = viewsResult.data ?? [];
  const profiles: Pick<Profile, "id" | "full_name" | "email">[] = profilesResult.data ?? [];
  const contacts: WorkspaceContact[] = (contactsResult.data ?? []) as WorkspaceContact[];

  return (
    <TaskListView
      tasks={tasks}
      savedViews={savedViews}
      workspaceId={workspaceId}
      userId={user.id}
      profiles={profiles}
      contacts={contacts}
    />
  );
}
