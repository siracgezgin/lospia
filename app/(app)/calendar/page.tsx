import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CalendarView } from "@/components/calendar/CalendarView";
import type { Task, Profile, WorkspaceContact, WorkspaceDepartment } from "@/types";

export default async function CalendarPage() {
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

  const [tasksResult, membersResult, contactsResult, deptsResult] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, status, priority, due_date, start_date, department_id")
      .eq("workspace_id", workspaceId)
      .neq("status", "archived")
      .or("due_date.not.is.null,start_date.not.is.null"),
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

  const tasks = (tasksResult.data ?? []) as Pick<Task, "id" | "title" | "status" | "priority" | "due_date" | "start_date" | "department_id">[];
  type ProfileLite = Pick<Profile, "id" | "full_name" | "email">;
  const profiles: ProfileLite[] = (
    (membersResult.data ?? []) as unknown as { profiles: ProfileLite | ProfileLite[] | null }[]
  ).flatMap((m) => (Array.isArray(m.profiles) ? m.profiles : m.profiles ? [m.profiles] : []));
  const contacts: WorkspaceContact[] = (contactsResult.data ?? []) as WorkspaceContact[];
  const departments = (deptsResult.data ?? []) as WorkspaceDepartment[];

  return (
    <CalendarView
      tasks={tasks}
      workspaceId={workspaceId}
      profiles={profiles}
      contacts={contacts}
      departments={departments}
    />
  );
}
