import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CalendarView } from "@/components/calendar/CalendarView";
import type { Task, Profile, WorkspaceContact } from "@/types";

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

  const [tasksResult, profilesResult, contactsResult] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, status, priority, due_date, start_date")
      .eq("workspace_id", workspaceId)
      .neq("status", "archived")
      .or("due_date.not.is.null,start_date.not.is.null"),
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

  const tasks = (tasksResult.data ?? []) as Pick<Task, "id" | "title" | "status" | "priority" | "due_date" | "start_date">[];
  const profiles: Pick<Profile, "id" | "full_name" | "email">[] = profilesResult.data ?? [];
  const contacts: WorkspaceContact[] = (contactsResult.data ?? []) as WorkspaceContact[];

  return (
    <CalendarView
      tasks={tasks}
      workspaceId={workspaceId}
      profiles={profiles}
      contacts={contacts}
    />
  );
}
