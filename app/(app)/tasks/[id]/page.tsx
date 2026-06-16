import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { TaskDetail } from "@/components/task/TaskDetail";
import type { Task, TaskActivity, TimeEntry, CustomFieldDefinition, Profile } from "@/types";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;

  const [taskResult, activityResult, activeTimerResult, customFieldsResult, profilesResult] =
    await Promise.all([
      supabase.from("tasks").select("*").eq("id", id).single(),
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
    ]);

  if (!taskResult.data) notFound();

  const task: Task = taskResult.data;
  const activity: TaskActivity[] = activityResult.data ?? [];
  const activeTimer: TimeEntry | null = activeTimerResult.data ?? null;
  const customFields: CustomFieldDefinition[] = customFieldsResult.data ?? [];
  const profiles: Pick<Profile, "id" | "full_name" | "email" | "avatar_url">[] =
    profilesResult.data ?? [];

  return (
    <TaskDetail
      task={task}
      activity={activity}
      activeTimer={activeTimer}
      customFields={customFields}
      profiles={profiles}
      userId={user.id}
    />
  );
}
