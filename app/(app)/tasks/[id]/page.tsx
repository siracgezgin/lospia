import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { TaskDetail } from "@/components/task/TaskDetail";
import type { Task, TaskActivity, TimeEntry, CustomFieldDefinition, Profile, WorkspaceContact } from "@/types";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;

  // Fetch task first to get workspace_id
  const taskResult = await supabase.from("tasks").select("*").eq("id", id).single();
  if (!taskResult.data) notFound();
  const task: Task = taskResult.data;

  const [activityResult, activeTimerResult, customFieldsResult, profilesResult, contactsResult] =
    await Promise.all([
      supabase
        .from("task_activity")
        .select("*")
        .eq("task_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("time_entries")
        .select("*")
        .eq("task_id", id)
        .eq("user_id", user.id)
        .is("stopped_at", null)
        .maybeSingle(),
      supabase
        .from("custom_field_definitions")
        .select("*")
        .order("position"),
      supabase.from("profiles").select("id, full_name, email, avatar_url"),
      supabase
        .from("workspace_contacts")
        .select("*")
        .eq("workspace_id", task.workspace_id)
        .order("created_at"),
    ]);

  const activity: TaskActivity[] = activityResult.data ?? [];
  const activeTimer: TimeEntry | null = activeTimerResult.data ?? null;
  const customFields: CustomFieldDefinition[] = customFieldsResult.data ?? [];
  const profiles: Pick<Profile, "id" | "full_name" | "email" | "avatar_url">[] =
    profilesResult.data ?? [];
  const contacts: WorkspaceContact[] = (contactsResult.data ?? []) as WorkspaceContact[];

  return (
    <TaskDetail
      task={task}
      activity={activity}
      activeTimer={activeTimer}
      customFields={customFields}
      profiles={profiles}
      contacts={contacts}
      userId={user.id}
    />
  );
}
