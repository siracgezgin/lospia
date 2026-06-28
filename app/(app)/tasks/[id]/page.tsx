import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { TaskDetail } from "@/components/task/TaskDetail";
import type { Task, TaskActivity, TaskActivityLogWithActor, TimeEntry, CustomFieldDefinition, Profile, WorkspaceContact, WorkspaceDepartment, TaskNoteWithAuthor } from "@/types";
import { TaskNotesPanel } from "@/components/task/TaskNotesPanel";

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

  const [activityResult, activityLogsResult, activeTimerResult, customFieldsResult, profilesResult, contactsResult, deptsResult, notesResult] =
    await Promise.all([
      supabase
        .from("task_activity")
        .select("*")
        .eq("task_id", id)
        .order("created_at", { ascending: true }),
      // Audit trail — newest first, latest 50, with the actor's profile
      supabase
        .from("task_activity_logs")
        .select("*, actor:profiles!task_activity_logs_actor_id_fkey(id, full_name, email)")
        .eq("task_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
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
      supabase
        .from("workspace_departments")
        .select("*")
        .eq("workspace_id", task.workspace_id)
        .order("position"),
      supabase
        .from("task_notes")
        .select("*, author:profiles!task_notes_author_id_fkey(id, full_name, email)")
        .eq("task_id", id)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

  const activity: TaskActivity[] = activityResult.data ?? [];
  const activityLogs: TaskActivityLogWithActor[] =
    (activityLogsResult.data ?? []) as unknown as TaskActivityLogWithActor[];
  const activeTimer: TimeEntry | null = activeTimerResult.data ?? null;
  const customFields: CustomFieldDefinition[] = customFieldsResult.data ?? [];
  const profiles: Pick<Profile, "id" | "full_name" | "email" | "avatar_url">[] =
    profilesResult.data ?? [];
  const contacts: WorkspaceContact[] = (contactsResult.data ?? []) as WorkspaceContact[];
  const departments: WorkspaceDepartment[] = (deptsResult.data ?? []) as WorkspaceDepartment[];
  const taskNotes: TaskNoteWithAuthor[] = (notesResult.data ?? []) as unknown as TaskNoteWithAuthor[];

  // Determine current user's workspace role (needed for viewer-mode restrictions)
  const { data: myMember } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", task.workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();
  const isViewer = myMember?.role === "viewer";
  const canComplete = myMember?.role === "owner" || myMember?.role === "admin";

  return (
    <>
      <TaskDetail
        task={task}
        activity={activity}
        activityLogs={activityLogs}
        activeTimer={activeTimer}
        customFields={customFields}
        profiles={profiles}
        contacts={contacts}
        departments={departments}
        userId={user.id}
        canComplete={canComplete}
      />
      <div className="max-w-3xl mx-auto px-4 pb-6">
        <TaskNotesPanel
          taskId={task.id}
          initialNotes={taskNotes}
          currentUserId={user.id}
          isViewer={isViewer}
        />
      </div>
    </>
  );
}
