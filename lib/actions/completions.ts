"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logTaskActivity, logTaskActivities, ACTIVITY_ACTIONS } from "@/lib/activity/log-task-activity";
import { notifyTaskEvent } from "@/lib/notifications/notify";
import type { AppRole } from "@/lib/auth/permissions";

const PERM = "Bu işlem için yetkiniz yok.";
const ADMIN_ONLY_RESPONSIBLE =
  "Yöneticiye özel görevlerde yalnızca yönetici kişiler sorumlu olabilir.";
const ACTIVE_STATUSES = ["backlog", "ready", "in_progress", "blocked"];
const isAdmin = (r: AppRole) => r === "owner" || r === "admin";

type SB = Awaited<ReturnType<typeof createClient>>;

async function getCtx(sb: SB) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: m } = await sb
    .from("workspace_members")
    .select("id, workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!m) return null;
  return { user, memberId: m.id as string, workspaceId: m.workspace_id as string, role: m.role as AppRole };
}

/**
 * Recompute a task's review status from its participant completions:
 *  • all participants complete (and ≥1) → move active task to "review"
 *  • in review but no longer all complete → move back to "in_progress"
 * Auto-review notifies workspace admins. Done/approval stays admin-only elsewhere.
 */
async function recomputeReview(sb: SB, taskId: string, workspaceId: string, actorId: string) {
  const { data: task } = await sb
    .from("tasks")
    .select("status, title")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return;

  const { data: comps } = await sb
    .from("task_member_completions")
    .select("completed_at")
    .eq("task_id", taskId);
  const total = comps?.length ?? 0;
  const done = (comps ?? []).filter((c) => c.completed_at).length;

  if (total > 0 && done === total && ACTIVE_STATUSES.includes(task.status as string)) {
    await sb.from("tasks").update({ status: "review" }).eq("id", taskId);
    await logTaskActivity(sb, {
      workspaceId, taskId, actorId, action: ACTIVITY_ACTIONS.AUTO_MOVED_TO_REVIEW,
      oldValue: task.status as string, newValue: "review",
    });
    const { data: admins } = await sb
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .in("role", ["owner", "admin"]);
    await notifyTaskEvent(sb, {
      workspaceId, taskId, taskTitle: task.title as string, actorId,
      event: "task_review_requested",
      recipientUserIds: (admins ?? []).map((a) => a.user_id as string),
    });
  } else if (task.status === "review" && (total === 0 || done < total)) {
    await sb.from("tasks").update({ status: "in_progress" }).eq("id", taskId);
    await logTaskActivity(sb, {
      workspaceId, taskId, actorId, action: ACTIVITY_ACTIONS.STATUS_CHANGED,
      oldValue: "review", newValue: "in_progress",
    });
  }
}

/** Current user toggles their own completion for a task. */
export async function toggleMyCompletion(taskId: string): Promise<{ ok: true } | { error: string }> {
  const sb = await createClient();
  const c = await getCtx(sb);
  if (!c) return { error: "Kimlik doğrulama gerekli." };
  if (c.role === "viewer") return { error: PERM };

  // Only a responsible person may mark their own work done. A participant row
  // normally exists (created when someone is added as responsible). If it does
  // not, the only legitimate case is the legacy assignee: a task that was
  // assigned via tasks.assignee_id before the multi-participant model. We
  // materialise their completion row on first interaction so the assignee and
  // participant models converge. Anyone else is genuinely not on the task.
  const { data: existing } = await sb
    .from("task_member_completions")
    .select("id, completed_at")
    .eq("task_id", taskId)
    .eq("member_id", c.memberId)
    .maybeSingle();

  let rowId: string;
  let wasDone: boolean;
  if (existing) {
    rowId = existing.id as string;
    wasDone = existing.completed_at != null;
  } else {
    const { data: task } = await sb
      .from("tasks")
      .select("assignee_id")
      .eq("id", taskId)
      .maybeSingle();
    if (!task || task.assignee_id !== c.user.id) {
      return { error: "Bu görevde sorumlu kişi değilsiniz." };
    }
    const { data: created, error: createErr } = await sb
      .from("task_member_completions")
      .insert({ workspace_id: c.workspaceId, task_id: taskId, member_id: c.memberId })
      .select("id")
      .single();
    if (createErr || !created) return { error: "Sorumlu kaydı oluşturulamadı." };
    rowId = created.id as string;
    wasDone = false;
  }

  const nowDone = !wasDone;
  const stamp = nowDone ? new Date().toISOString() : null;
  await sb.from("task_member_completions").update({ completed_at: stamp }).eq("id", rowId);
  await logTaskActivity(sb, {
    workspaceId: c.workspaceId, taskId, actorId: c.user.id,
    action: nowDone ? ACTIVITY_ACTIONS.PARTICIPANT_COMPLETED : ACTIVITY_ACTIONS.PARTICIPANT_UNCOMPLETED,
  });
  await recomputeReview(sb, taskId, c.workspaceId, c.user.id);
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/board");
  return { ok: true };
}

/** Set the member-participant list for a task. Admin/owner manage any task; a
 *  member may only manage tasks they can already act on (own / created / are a
 *  responsible participant of). Viewers never. */
export async function setTaskParticipants(
  taskId: string, memberIds: string[],
): Promise<{ ok: true } | { error: string }> {
  const sb = await createClient();
  const c = await getCtx(sb);
  if (!c) return { error: "Kimlik doğrulama gerekli." };
  if (c.role === "viewer") return { error: PERM };

  const { data: vTask } = await sb
    .from("tasks")
    .select("title, visibility, assignee_id, created_by")
    .eq("id", taskId)
    .maybeSingle();
  if (!vTask) return { error: "Görev bulunamadı." };

  const { data: existing } = await sb
    .from("task_member_completions")
    .select("id, member_id")
    .eq("task_id", taskId);

  // Members may reassign only tasks they are already on (assignee, creator or
  // current responsible). UI hides the editor too, but the server is the boundary.
  if (!isAdmin(c.role)) {
    const isOnTask =
      vTask.assignee_id === c.user.id ||
      (vTask.created_by ?? null) === c.user.id ||
      (existing ?? []).some((r) => r.member_id === c.memberId);
    if (!isOnTask) return { error: PERM };
  }

  // Admin_only tasks: only owner/admin people may be responsible. Reject the
  // whole change rather than silently dropping people, so the caller is aware.
  if (vTask.visibility === "admin_only" && memberIds.length > 0) {
    const { data: roles } = await sb
      .from("workspace_members")
      .select("id, role")
      .in("id", memberIds);
    const allAdmin = (roles ?? []).length === memberIds.length
      && (roles ?? []).every((m) => m.role === "owner" || m.role === "admin");
    if (!allAdmin) return { error: ADMIN_ONLY_RESPONSIBLE };
  }

  const have = new Set((existing ?? []).map((r) => r.member_id as string));
  const want = new Set(memberIds);

  const addedIds = memberIds.filter((id) => !have.has(id));
  const toAdd = addedIds.map((id) => ({ workspace_id: c.workspaceId, task_id: taskId, member_id: id }));
  if (toAdd.length) await sb.from("task_member_completions").insert(toAdd);

  const removedRows = (existing ?? []).filter((r) => !want.has(r.member_id as string));
  const removedMemberIds = removedRows.map((r) => r.member_id as string);
  const toRemove = removedRows.map((r) => r.id as string);
  if (toRemove.length) await sb.from("task_member_completions").delete().in("id", toRemove);

  // Notify + audit-log the handoff (resolve member_id → user_id so the activity
  // trail can render "X sorumlu olarak eklendi / sorumluluktan çıkarıldı").
  if (addedIds.length || removedMemberIds.length) {
    const taskTitle = vTask.title ?? null;
    const { data: wm } = await sb
      .from("workspace_members")
      .select("id, user_id")
      .in("id", [...addedIds, ...removedMemberIds]);
    const userIdOf = new Map((wm ?? []).map((m) => [m.id as string, m.user_id as string]));

    await logTaskActivities(sb, [
      ...addedIds.map((id) => ({
        workspaceId: c.workspaceId, taskId, actorId: c.user.id,
        action: ACTIVITY_ACTIONS.RESPONSIBLE_ADDED, fieldName: "responsible",
        newValue: userIdOf.get(id) ?? null,
      })),
      ...removedMemberIds.map((id) => ({
        workspaceId: c.workspaceId, taskId, actorId: c.user.id,
        action: ACTIVITY_ACTIONS.RESPONSIBLE_REMOVED, fieldName: "responsible",
        oldValue: userIdOf.get(id) ?? null,
      })),
    ]);

    await notifyTaskEvent(sb, {
      workspaceId: c.workspaceId, taskId, taskTitle, actorId: c.user.id,
      event: "task_responsibility_added",
      recipientUserIds: addedIds.map((id) => userIdOf.get(id)),
    });
    await notifyTaskEvent(sb, {
      workspaceId: c.workspaceId, taskId, taskTitle, actorId: c.user.id,
      event: "task_responsibility_removed",
      recipientUserIds: removedMemberIds.map((id) => userIdOf.get(id)),
    });
  }

  await recomputeReview(sb, taskId, c.workspaceId, c.user.id);
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/board");
  return { ok: true };
}

/** Admin toggles a specific participant's completion. */
export async function setParticipantCompletion(
  taskId: string, memberId: string, done: boolean,
): Promise<{ ok: true } | { error: string }> {
  const sb = await createClient();
  const c = await getCtx(sb);
  if (!c) return { error: "Kimlik doğrulama gerekli." };
  if (!isAdmin(c.role)) return { error: PERM };
  const stamp = done ? new Date().toISOString() : null;

  const { data: existing } = await sb
    .from("task_member_completions")
    .select("id")
    .eq("task_id", taskId)
    .eq("member_id", memberId)
    .maybeSingle();
  if (existing) {
    await sb.from("task_member_completions").update({ completed_at: stamp }).eq("id", existing.id);
  } else {
    await sb.from("task_member_completions").insert({
      workspace_id: c.workspaceId, task_id: taskId, member_id: memberId, completed_at: stamp,
    });
  }
  await logTaskActivity(sb, {
    workspaceId: c.workspaceId, taskId, actorId: c.user.id,
    action: done ? ACTIVITY_ACTIONS.PARTICIPANT_COMPLETED : ACTIVITY_ACTIONS.PARTICIPANT_UNCOMPLETED,
  });
  await recomputeReview(sb, taskId, c.workspaceId, c.user.id);
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/board");
  return { ok: true };
}
