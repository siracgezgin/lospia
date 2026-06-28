"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logTaskActivity, ACTIVITY_ACTIONS } from "@/lib/activity/log-task-activity";
import type { AppRole } from "@/lib/auth/permissions";

const PERM = "Bu işlem için yetkiniz yok.";
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
    const rows = (admins ?? [])
      .map((a) => a.user_id as string)
      .filter((u) => u && u !== actorId)
      .map((u) => ({
        workspace_id: workspaceId, user_id: u, type: "task_status_changed",
        title: "Görev kontrol bekliyor", body: task.title as string, task_id: taskId,
      }));
    if (rows.length) await sb.from("notifications").insert(rows as Record<string, unknown>[]);
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

  // Only a responsible participant may mark their own work done. A participant
  // row always exists (created when someone is added as responsible), so its
  // absence means this user is NOT on the task — never create one here.
  const { data: existing } = await sb
    .from("task_member_completions")
    .select("id, completed_at")
    .eq("task_id", taskId)
    .eq("member_id", c.memberId)
    .maybeSingle();
  if (!existing) return { error: "Bu görevde sorumlu kişi değilsiniz." };

  const nowDone = !existing.completed_at;
  const stamp = nowDone ? new Date().toISOString() : null;
  await sb.from("task_member_completions").update({ completed_at: stamp }).eq("id", existing.id);
  await logTaskActivity(sb, {
    workspaceId: c.workspaceId, taskId, actorId: c.user.id,
    action: nowDone ? ACTIVITY_ACTIONS.PARTICIPANT_COMPLETED : ACTIVITY_ACTIONS.PARTICIPANT_UNCOMPLETED,
  });
  await recomputeReview(sb, taskId, c.workspaceId, c.user.id);
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/board");
  return { ok: true };
}

/** Set the member-participant list for a task (admin or any editor; not viewers). */
export async function setTaskParticipants(
  taskId: string, memberIds: string[],
): Promise<{ ok: true } | { error: string }> {
  const sb = await createClient();
  const c = await getCtx(sb);
  if (!c) return { error: "Kimlik doğrulama gerekli." };
  if (c.role === "viewer") return { error: PERM };

  const { data: existing } = await sb
    .from("task_member_completions")
    .select("id, member_id")
    .eq("task_id", taskId);
  const have = new Set((existing ?? []).map((r) => r.member_id as string));
  const want = new Set(memberIds);

  const addedIds = memberIds.filter((id) => !have.has(id));
  const toAdd = addedIds.map((id) => ({ workspace_id: c.workspaceId, task_id: taskId, member_id: id }));
  if (toAdd.length) await sb.from("task_member_completions").insert(toAdd);

  const toRemove = (existing ?? []).filter((r) => !want.has(r.member_id as string)).map((r) => r.id as string);
  if (toRemove.length) await sb.from("task_member_completions").delete().in("id", toRemove);

  // Notify newly-added participants (resolve member_id → user_id).
  if (addedIds.length) {
    const { data: task } = await sb.from("tasks").select("title").eq("id", taskId).maybeSingle();
    const { data: wm } = await sb
      .from("workspace_members")
      .select("id, user_id")
      .in("id", addedIds);
    const rows = (wm ?? [])
      .map((m) => m.user_id as string)
      .filter((uid) => uid && uid !== c.user.id)
      .map((uid) => ({
        workspace_id: c.workspaceId, user_id: uid, type: "task_assigned",
        title: "Bir göreve dahil edildiniz", body: task?.title ?? null, task_id: taskId,
      }));
    if (rows.length) await sb.from("notifications").insert(rows as Record<string, unknown>[]);
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
