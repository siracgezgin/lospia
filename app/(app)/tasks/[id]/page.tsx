import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { TaskDetail } from "@/components/task/TaskDetail";
import type { Task, TaskActivity, TaskActivityLogWithActor, TimeEntry, CustomFieldDefinition, Profile, WorkspaceContact, WorkspaceDepartment, TaskNoteWithAuthor } from "@/types";
import { TaskNotesPanel } from "@/components/task/TaskNotesPanel";
import { TaskParticipantsPanel, type PanelMember, type PanelParticipant } from "@/components/task/TaskParticipantsPanel";
import { TaskEffortPanel } from "@/components/task/TaskEffortPanel";
import { isEffortSize } from "@/lib/points/effort";

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

  const [activityResult, activityLogsResult, activeTimerResult, customFieldsResult, profilesResult, contactsResult, deptsResult, notesResult, membersResult, completionsResult, deptMembersResult, deptTreeResult] =
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
      // Workspace members (for the participant picker)
      supabase
        .from("workspace_members")
        .select("id, user_id, profiles(id, full_name, email)")
        .eq("workspace_id", task.workspace_id),
      // Current participant completions for this task
      supabase
        .from("task_member_completions")
        .select("member_id, completed_at")
        .eq("task_id", id),
      // Department member assignments (for the dept-filtered responsible picker)
      supabase
        .from("department_members")
        .select("department_id, member_id")
        .eq("workspace_id", task.workspace_id),
      // Departments (to resolve parent/child relationships for filtering)
      supabase
        .from("workspace_departments")
        .select("id, parent_id")
        .eq("workspace_id", task.workspace_id),
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

  // Determine current user's workspace role + member id
  const { data: myMember } = await supabase
    .from("workspace_members")
    .select("id, role")
    .eq("workspace_id", task.workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();
  const isViewer = myMember?.role === "viewer";
  const canComplete = myMember?.role === "owner" || myMember?.role === "admin";
  const currentMemberId = (myMember?.id as string | undefined) ?? null;

  // Puan & Motivasyon is admin-only: members never see point values, pending
  // points, effort changes or who earned what — so we strip those audit rows
  // for non-admins and only fetch the task's earned ledger for admins.
  const POINTS_PRIVATE_ACTIONS = new Set([
    "points_finalized", "points_revoked", "points_self_approval_skipped", "effort_changed",
  ]);
  const visibleActivityLogs = canComplete
    ? activityLogs
    : activityLogs.filter((l) => !POINTS_PRIVATE_ACTIONS.has(l.action));

  let earnedRows: { name: string; points: number }[] = [];
  if (canComplete) {
    const { data: ledger } = await supabase
      .from("points_ledger")
      .select("user_id, points_amount")
      .eq("task_id", id)
      .eq("transaction_type", "earned");
    const nameOf = (uid: string) => {
      const p = profiles.find((x) => x.id === uid);
      return p?.full_name ?? p?.email ?? "—";
    };
    earnedRows = ((ledger ?? []) as { user_id: string; points_amount: number }[])
      .map((r) => ({ name: nameOf(r.user_id), points: r.points_amount }));
  }
  const effortSize = isEffortSize((task as unknown as Record<string, unknown>).effort_size)
    ? ((task as unknown as Record<string, unknown>).effort_size as "small" | "medium" | "large")
    : "medium";

  // Participant panel data
  type MemberRow = { id: string; user_id: string; profiles: Pick<Profile, "id" | "full_name" | "email"> | Pick<Profile, "id" | "full_name" | "email">[] | null };
  const panelMembers: PanelMember[] = ((membersResult.data ?? []) as unknown as MemberRow[])
    .map((m) => {
      const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      return { memberId: m.id, userId: m.user_id, name: prof?.full_name ?? prof?.email ?? "—" };
    });
  const panelParticipants: PanelParticipant[] = ((completionsResult.data ?? []) as { member_id: string; completed_at: string | null }[])
    .map((c) => ({ memberId: c.member_id, completed: c.completed_at != null, completedAt: c.completed_at }));

  // Canonical responsibility = participants, with the legacy assignee as a
  // fallback when there are no participant rows. Surfacing the assignee here
  // keeps "Sorumlu kişiler" consistent with the board card (which shows the
  // assignee avatar in the same situation). The fallback is flagged so the panel
  // can convert it into a real completion row on first interaction.
  if (panelParticipants.length === 0 && task.assignee_id) {
    const assigneeMember = panelMembers.find((m) => m.userId === task.assignee_id);
    if (assigneeMember) {
      panelParticipants.push({
        memberId: assigneeMember.memberId,
        completed: false,
        completedAt: null,
        isAssigneeFallback: true,
      });
    }
  }

  // Eligible members for the responsible picker = members assigned to the task's
  // department, plus its parent and direct children. null when no department.
  let eligibleMemberIds: string[] | null = null;
  if (task.department_id) {
    const deptTree = (deptTreeResult.data ?? []) as { id: string; parent_id: string | null }[];
    const self = deptTree.find((d) => d.id === task.department_id);
    const relatedDeptIds = new Set<string>([task.department_id]);
    if (self?.parent_id) relatedDeptIds.add(self.parent_id);
    for (const d of deptTree) if (d.parent_id === task.department_id) relatedDeptIds.add(d.id);
    const dm = (deptMembersResult.data ?? []) as { department_id: string; member_id: string }[];
    eligibleMemberIds = [...new Set(dm.filter((r) => relatedDeptIds.has(r.department_id)).map((r) => r.member_id))];
  }

  return (
    <>
      <TaskDetail
        task={task}
        activity={activity}
        activityLogs={visibleActivityLogs}
        activeTimer={activeTimer}
        customFields={customFields}
        profiles={profiles}
        contacts={contacts}
        departments={departments}
        userId={user.id}
        canComplete={canComplete}
      />
      <div className="max-w-3xl mx-auto px-4 pb-6 space-y-5">
        {canComplete && (
          <TaskEffortPanel
            taskId={task.id}
            effortSize={effortSize}
            status={task.status}
            participantCount={panelParticipants.length}
            earned={earnedRows}
          />
        )}
        <TaskParticipantsPanel
          taskId={task.id}
          members={panelMembers}
          participants={panelParticipants}
          currentMemberId={currentMemberId}
          isAdmin={canComplete}
          isViewer={isViewer}
          eligibleMemberIds={eligibleMemberIds}
        />
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
