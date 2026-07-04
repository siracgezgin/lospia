import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { TaskDetail } from "@/components/task/TaskDetail";
import type { Task, TaskActivity, TaskActivityLogWithActor, TimeEntry, CustomFieldDefinition, Profile, WorkspaceContact, WorkspaceDepartment, TaskNoteWithAuthor } from "@/types";
import { TaskNotesPanel, type NotePerson } from "@/components/task/TaskNotesPanel";
import { TaskParticipantsPanel, type PanelMember, type PanelContact, type PanelParticipant } from "@/components/task/TaskParticipantsPanel";
import { TaskEffortPanel } from "@/components/task/TaskEffortPanel";
import { isEffortSize } from "@/lib/points/effort";
import { buildAssignablePeople } from "@/lib/people/assignable";

export default async function TaskDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; visibility?: string; manager?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;

  // Back link follows the board the task was opened from (Yönetici Pano keeps its
  // visibility/manager tab); anything else falls back to the normal board.
  const sp = await searchParams;
  let backHref = "/board";
  let backLabel = "Panoya dön";
  if (sp.from === "admin-board") {
    const qs = new URLSearchParams();
    if (sp.visibility) qs.set("visibility", sp.visibility);
    if (sp.manager) qs.set("manager", sp.manager);
    backHref = qs.toString() ? `/admin-board?${qs.toString()}` : "/admin-board";
    backLabel = "Yönetici Pano’ya dön";
  }

  // Fetch task first to get workspace_id
  const taskResult = await supabase.from("tasks").select("*").eq("id", id).single();
  if (!taskResult.data) notFound();
  const task: Task = taskResult.data;
  // A soft-deleted task has no live detail/edit screen — a stale notification (or
  // bookmark) must never open it. Treat it as gone.
  if (task.deleted_at) notFound();

  const [activityResult, activityLogsResult, activeTimerResult, customFieldsResult, profilesResult, contactsResult, deptsResult, notesResult, membersResult, completionsResult] =
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
        .select("id, user_id, role, profiles(id, full_name, email)")
        .eq("workspace_id", task.workspace_id),
      // Current participant completions for this task
      supabase
        .from("task_member_completions")
        .select("member_id, completed_at")
        .eq("task_id", id),
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

  // Admin_only tasks are invisible to non-admins. RLS already blocks the SELECT
  // above for members (→ notFound), but we re-assert it explicitly so the title,
  // description and notes of a hidden task can never reach a member's client.
  if ((task as unknown as { visibility?: string }).visibility === "admin_only" && !canComplete) {
    notFound();
  }

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
  type MemberRow = { id: string; user_id: string; role: string; profiles: Pick<Profile, "id" | "full_name" | "email"> | Pick<Profile, "id" | "full_name" | "email">[] | null };
  const panelMembers: PanelMember[] = ((membersResult.data ?? []) as unknown as MemberRow[])
    .map((m) => {
      const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      return {
        memberId: m.id, userId: m.user_id, name: prof?.full_name ?? prof?.email ?? "—",
        isAdmin: m.role === "owner" || m.role === "admin",
      };
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

  // Single source of truth for assignable people: workspace members ∪ CRM
  // contacts with contact↔user duplicates collapsed — the same builder the
  // board picker uses, so both UIs always show the SAME people. Contacts that
  // did not merge into a member stay selectable as an external responsible.
  const assignablePeople = buildAssignablePeople({
    members: panelMembers,
    contacts: contacts.map((c) => ({ id: c.id, name: c.name, email: c.email, user_id: c.user_id })),
  });
  const panelContacts: PanelContact[] = assignablePeople
    .filter((p) => p.type === "contact")
    .map((p) => ({ contactId: p.contactId as string, name: p.name }));

  // The task's current responsible CRM contact (when it isn't represented by a
  // member row already) — shown in the panel and removable there.
  const respContactId = task.responsible_contact_id ?? null;
  const responsibleContact: PanelContact | null = respContactId
    ? panelContacts.find((c) => c.contactId === respContactId)
      ?? (() => {
        const raw = contacts.find((c) => c.id === respContactId);
        return raw ? { contactId: raw.id, name: raw.name } : null;
      })()
    : null;

  // Responsible display names for the header card (participants ∪ fallbacks —
  // legacy assignee first, then the responsible CRM contact, mirroring the
  // board card's avatar logic so the two never disagree).
  const responsiblePeople = panelParticipants
    .map((p) => panelMembers.find((m) => m.memberId === p.memberId)?.name)
    .filter((n): n is string => !!n);
  if (responsiblePeople.length === 0 && responsibleContact) {
    responsiblePeople.push(responsibleContact.name);
  }

  // Who may add/remove responsible people — mirrors the server rule in
  // setTaskParticipants: admins always; a member only on tasks they are on.
  const canManageParticipants = canComplete
    || task.assignee_id === user.id
    || (task.created_by ?? null) === user.id
    || (currentMemberId != null && panelParticipants.some((p) => p.memberId === currentMemberId));

  // Note-form inputs: due-date editing mirrors canEditTask (admin / assignee /
  // creator); the notify picker gets the SAME assignable people as every other
  // assignment UI; acknowledgements power "Gördüm / Üzerime aldım" states.
  const canEditDueDate = canComplete
    || task.assignee_id === user.id
    || (task.created_by ?? null) === user.id;
  const notePeople: NotePerson[] = assignablePeople.map((p) => ({
    id: p.id, name: p.name, type: p.type,
    userId: p.userId, memberId: p.memberId, contactId: p.contactId,
  }));
  // Pre-migration the table doesn't exist — fall back to an empty list, never crash.
  const noteIds = taskNotes.map((n) => n.id);
  let noteAcks: { note_id: string; user_id: string; action: string }[] = [];
  if (noteIds.length > 0) {
    const { data: ackRows } = await supabase
      .from("task_note_acknowledgements")
      .select("note_id, user_id, action")
      .in("note_id", noteIds);
    noteAcks = (ackRows ?? []) as { note_id: string; user_id: string; action: string }[];
  }

  return (
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
      isAdmin={canComplete}
      backHref={backHref}
      backLabel={backLabel}
      responsiblePeople={responsiblePeople}
      participantsSlot={
        <TaskParticipantsPanel
          taskId={task.id}
          members={panelMembers}
          participants={panelParticipants}
          contacts={panelContacts}
          responsibleContact={responsibleContact}
          currentMemberId={currentMemberId}
          isAdmin={canComplete}
          isViewer={isViewer}
          canManage={!isViewer && canManageParticipants}
          adminOnly={(task as unknown as { visibility?: string }).visibility === "admin_only"}
        />
      }
      notesSlot={
        <TaskNotesPanel
          taskId={task.id}
          initialNotes={taskNotes}
          currentUserId={user.id}
          isViewer={isViewer}
          isAdmin={canComplete}
          taskDueDate={task.due_date}
          canEditDueDate={canEditDueDate}
          canManageAssignment={!isViewer && canManageParticipants}
          people={notePeople}
          acks={noteAcks}
        />
      }
      effortSlot={
        canComplete ? (
          <TaskEffortPanel
            taskId={task.id}
            effortSize={effortSize}
            status={task.status}
            participantCount={panelParticipants.length}
            earned={earnedRows}
          />
        ) : undefined
      }
    />
  );
}
