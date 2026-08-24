"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { toActionErrorMessage } from "@/lib/utils/supabase-errors";
import { logTaskActivity, logTaskActivities, ACTIVITY_ACTIONS } from "@/lib/activity/log-task-activity";
import { notifyTaskEvent } from "@/lib/notifications/notify";
import type { AppRole } from "@/lib/auth/permissions";

const PERM = "Bu işlem için yetkiniz yok.";
const ASSIGN_DENIED = "Bu göreve sorumlu kişi atama yetkiniz yok.";
const ADMIN_ONLY_RESPONSIBLE =
  "Yöneticiye özel görevlerde yalnızca yönetici kişiler sorumlu olabilir.";
const NOT_IN_WORKSPACE =
  "Seçilen kişilerden bazıları bu çalışma alanına ait değil.";
const SAVE_FAILED =
  "Sorumlu kişiler kaydedilemedi. Lütfen tekrar deneyin; sorun sürerse yöneticinize bildirin.";
const REMOVE_FAILED =
  "Sorumlu kişi çıkarılamadı. Lütfen tekrar deneyin; sorun sürerse yöneticinize bildirin.";
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
  revalidatePath("/list");
  revalidatePath("/home");
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
  if (c.role === "viewer") return { error: ASSIGN_DENIED };

  // Dedupe defensively — a double-picked person must never become a double row.
  const wantIds = [...new Set(memberIds)];

  const { data: vTask } = await sb
    .from("tasks")
    .select("title, visibility, assignee_id, created_by, workspace_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!vTask) return { error: "Görev bulunamadı." };
  // The privileged write below bypasses RLS, so the workspace boundary has to
  // be enforced here: the task must live in the actor's own workspace.
  if ((vTask.workspace_id as string) !== c.workspaceId) return { error: ASSIGN_DENIED };

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
    if (!isOnTask) return { error: ASSIGN_DENIED };
  }

  // Every selected id must be a workspace_members row of THIS workspace. This
  // blocks cross-workspace injection and catches a userId/memberId mix-up (a
  // user id never matches a membership row id). Admin_only tasks additionally
  // require every responsible person to be owner/admin — the whole change is
  // rejected rather than silently dropping people, so the caller is aware.
  if (wantIds.length > 0) {
    const { data: picked } = await sb
      .from("workspace_members")
      .select("id, role")
      .eq("workspace_id", c.workspaceId)
      .in("id", wantIds);
    if ((picked ?? []).length !== wantIds.length) return { error: NOT_IN_WORKSPACE };
    if (vTask.visibility === "admin_only") {
      const allAdmin = (picked ?? []).every((m) => m.role === "owner" || m.role === "admin");
      if (!allAdmin) return { error: ADMIN_ONLY_RESPONSIBLE };
    }
  }

  const have = new Set((existing ?? []).map((r) => r.member_id as string));
  const want = new Set(wantIds);

  // task_member_completions carries restrictive RLS — correct for direct client
  // access, but it rejects a creator adding OTHER people. The permission gate
  // above already decided this change is allowed, so the write itself runs with
  // the server-side service-role client (never exposed to the browser). Without
  // a configured service key we fall back to the user client + RLS.
  //
  // The writes MUST be error-checked: a rejected batch rolls back ALL rows while
  // activity/notifications would still be written — exactly the "activity says
  // added, task shows nobody" bug. Never log before the write succeeded.
  const writer = getAdminClient() ?? sb;
  const addedIds = wantIds.filter((id) => !have.has(id));
  const toAdd = addedIds.map((id) => ({ workspace_id: c.workspaceId, task_id: taskId, member_id: id }));
  if (toAdd.length) {
    const { error: addErr } = await writer.from("task_member_completions").insert(toAdd);
    // Raw RLS/Postgres text never reaches the user — map to a clear message.
    if (addErr) return { error: toActionErrorMessage(addErr, SAVE_FAILED) };
  }

  const removedRows = (existing ?? []).filter((r) => !want.has(r.member_id as string));
  const removedMemberIds = removedRows.map((r) => r.member_id as string);
  const toRemove = removedRows.map((r) => r.id as string);
  if (toRemove.length) {
    const { error: rmErr } = await writer
      .from("task_member_completions")
      .delete()
      .in("id", toRemove)
      .eq("task_id", taskId);
    if (rmErr) return { error: toActionErrorMessage(rmErr, REMOVE_FAILED) };
  }

  /* assignee_id KATILIMCI KÜMESİYLE SENKRON TUTULUR.
     Sorumluluğun kanonik kaydı task_member_completions'tır; assignee_id ise
     tek kişilik ESKİ alandır. Ama sistemin yarısı hâlâ o eski alanı okuyor:
     Ana Sayfa'daki "Bana atanan görevler", Liste'nin "Bana atananlar"
     merceği, CRM'deki "X görev" sayıları, kart renkleri.
     "Görev oluştur" penceresi sorumluyu yalnız katılımcı olarak yazıp
     assignee_id'yi null bıraktığı için panelden açılan HER görev o
     ekranlarda kayboluyordu — Aslı Hanım (2026-08-24): "Tüm işler kısmına
     giriyorum her kişinin görevi var, ama board'da kişi adına basıp girince
     görev yok."
     Bu yüzden assignee_id burada, katılımcı kümesinin TEK sahibi olarak
     güncellenir: ilk sorumlu assignee olur, kimse kalmazsa null'a döner.
     Zaten geçerli bir assignee listede duruyorsa dokunulmaz (kullanıcının
     seçtiği sıra korunur). */
  const { data: finalRows } = await sb
    .from("task_member_completions")
    .select("member_id")
    .eq("task_id", taskId);
  const finalMemberIds = (finalRows ?? []).map((r) => r.member_id as string);

  let assigneeUserId: string | null = null;
  if (finalMemberIds.length > 0) {
    const { data: finalMembers } = await sb
      .from("workspace_members")
      .select("id, user_id")
      .in("id", finalMemberIds);
    const userIdByMember = new Map((finalMembers ?? []).map((m) => [m.id as string, m.user_id as string]));
    const currentAssignee = (vTask.assignee_id as string | null) ?? null;
    const stillResponsible =
      currentAssignee != null &&
      finalMemberIds.some((id) => userIdByMember.get(id) === currentAssignee);
    assigneeUserId = stillResponsible
      ? currentAssignee
      : (wantIds.map((id) => userIdByMember.get(id)).find(Boolean)
         ?? userIdByMember.get(finalMemberIds[0])
         ?? null);
  }
  if (assigneeUserId !== ((vTask.assignee_id as string | null) ?? null)) {
    await writer.from("tasks").update({ assignee_id: assigneeUserId }).eq("id", taskId);
  }

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
