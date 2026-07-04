"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logTaskActivity, ACTIVITY_ACTIONS } from "@/lib/activity/log-task-activity";
import { notifyTaskEvent } from "@/lib/notifications/notify";
import type { TaskNotificationEvent } from "@/lib/notifications/events";
import {
  canDeleteNoteItem, canEditTask, canManageTaskAssignment, type AppRole,
} from "@/lib/auth/permissions";
import { setTaskParticipants } from "@/lib/actions/completions";
import { toActionErrorMessage, isMissingSchemaError } from "@/lib/utils/supabase-errors";
import type { Json, TaskNoteType } from "@/types";

const PERM_DENIED = "Bu işlem için yetkiniz yok.";

function hexUuid() {
  return z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Geçersiz UUID");
}

const NOTE_COLOR = z.enum(["yellow", "blue", "green", "purple"]);

export async function createNote(data: {
  workspace_id: string;
  title: string;
  body?: string;
  color?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum açılmamış" };

  const schema = z.object({
    workspace_id: hexUuid(),
    title: z.string().min(1).max(500).trim(),
    body: z.string().max(5000).optional(),
    color: NOTE_COLOR.default("yellow"),
  });

  const parsed = schema.safeParse(data);
  if (!parsed.success) return { error: "Geçersiz veri" };

  const { error } = await supabase.from("workspace_notes").insert({
    ...parsed.data,
    created_by: user.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/board");
  return { success: true };
}

// Resolve the caller's workspace role + the author of a workspace note, so we can
// enforce "author or admin" on edit/delete (the UI hides the controls, but the
// server is the real boundary).
async function resolveNoteAuth(
  supabase: Awaited<ReturnType<typeof createClient>>,
  noteId: string,
): Promise<{ userId: string; role: AppRole; createdBy: string | null } | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!member) return null;
  const { data: note } = await supabase
    .from("workspace_notes")
    .select("created_by")
    .eq("id", noteId)
    .maybeSingle();
  return {
    userId: user.id,
    role: member.role as AppRole,
    createdBy: (note?.created_by ?? null) as string | null,
  };
}

export async function updateNote(data: {
  id: string;
  title?: string;
  body?: string | null;
  color?: string;
}) {
  const supabase = await createClient();

  const schema = z.object({
    id: hexUuid(),
    title: z.string().min(1).max(500).trim().optional(),
    body: z.string().max(5000).nullable().optional(),
    color: NOTE_COLOR.optional(),
  });

  const parsed = schema.safeParse(data);
  if (!parsed.success) return { error: "Geçersiz veri" };

  const auth = await resolveNoteAuth(supabase, parsed.data.id);
  if (!auth) return { error: "Oturum açılmamış" };
  if (!canDeleteNoteItem(auth.role, { created_by: auth.createdBy }, auth.userId)) {
    return { error: PERM_DENIED };
  }

  const { id, ...rest } = parsed.data;
  if (Object.keys(rest).length === 0) return { success: true };

  const { error } = await supabase
    .from("workspace_notes")
    .update(rest)
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/board");
  return { success: true };
}

export async function deleteNote(id: string) {
  const supabase = await createClient();

  const parsed = hexUuid().safeParse(id);
  if (!parsed.success) return { error: "Geçersiz ID" };

  const auth = await resolveNoteAuth(supabase, parsed.data);
  if (!auth) return { error: "Oturum açılmamış" };
  if (!canDeleteNoteItem(auth.role, { created_by: auth.createdBy }, auth.userId)) {
    return { error: PERM_DENIED };
  }

  const { error } = await supabase
    .from("workspace_notes")
    .delete()
    .eq("id", parsed.data);
  if (error) return { error: error.message };

  revalidatePath("/board");
  return { success: true };
}

export async function reorderNotes(updates: { id: string; position: number }[]) {
  if (updates.length === 0) return { success: true };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum açılmamış" };

  const itemSchema = z.object({ id: hexUuid(), position: z.number().int().min(0) });
  const parsed = z.array(itemSchema).safeParse(updates);
  if (!parsed.success) return { error: "Geçersiz veri" };

  for (const { id, position } of parsed.data) {
    await supabase.from("workspace_notes").update({ position }).eq("id", id);
  }

  revalidatePath("/board");
  return { success: true };
}

// ── Task notes (görev notları / "Notlar" panel) ───────────────────────────────

async function getTaskCallerCtx(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: member } = await supabase
    .from("workspace_members")
    .select("id, workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!member) return null;
  return {
    user,
    memberId: member.id as string,
    workspaceId: member.workspace_id,
    role: member.role,
  };
}

export async function addTaskNote(
  taskId: string,
  content: string
): Promise<{ id: string } | { error: string }> {
  const trimmed = content.trim();
  if (!trimmed) return { error: "Not boş olamaz." };

  const supabase = await createClient();
  const ctx = await getTaskCallerCtx(supabase);
  if (!ctx) return { error: "Kimlik doğrulama gerekli." };
  if (ctx.role === "viewer") return { error: "İzleyiciler not ekleyemez." };

  const { data, error } = await supabase
    .from("task_notes")
    .insert({
      workspace_id: ctx.workspaceId,
      task_id: taskId,
      author_id: ctx.user.id,
      content: trimmed,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Notify the assignee and the person being waited on (deduped, skip self).
  const { data: task } = await supabase
    .from("tasks")
    .select("assignee_id, title, workspace_id, waiting_on_member_id")
    .eq("id", taskId)
    .maybeSingle();

  // Audit trail: record the note add for the admin activity log.
  if (task) {
    await logTaskActivity(supabase, {
      workspaceId: ctx.workspaceId, taskId, actorId: ctx.user.id,
      action: ACTIVITY_ACTIONS.NOTE_ADDED,
    });
  }

  if (task) {
    const recipients = new Set<string>();
    if (task.assignee_id) recipients.add(task.assignee_id);
    // waiting_on_member_id references workspace_members.id → resolve to user_id
    if (task.waiting_on_member_id) {
      const { data: wm } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("id", task.waiting_on_member_id)
        .maybeSingle();
      if (wm?.user_id) recipients.add(wm.user_id);
    }
    recipients.delete(ctx.user.id); // never notify the note author

    if (recipients.size > 0) {
      await notifyTaskEvent(supabase, {
        workspaceId: ctx.workspaceId,
        taskId,
        taskTitle: task.title,
        actorId: ctx.user.id,
        event: "task_note_added",
        recipientUserIds: [...recipients],
      });
    }
  }

  revalidatePath(`/tasks/${taskId}`);
  return { id: data.id };
}

// ── Operational note workflow ─────────────────────────────────────────────────
// A note is no longer just a comment: it confirms the delivery date, can notify
// specific people, and can add/hand off task responsibility — all in ONE atomic
// action (validate everything first, write with compensation, never leave a
// "note added but assignment failed" half-state).

const NOTE_WORKFLOW_SCHEMA = z.object({
  taskId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  body: z.string().min(1).max(5000),
  noteType: z.enum(["info", "action_required", "handoff", "approval_waiting"]).default("info"),
  // Date-only string — compared and stored as YYYY-MM-DD, never a timestamp,
  // so no 03:00-style timezone drift can occur.
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Geçersiz tarih").nullable().optional(),
  notifyUserIds: z.array(hexUuid()).max(50).default([]),
  notifyContactIds: z.array(hexUuid()).max(50).default([]),
  assignmentAction: z.enum(["none", "add_responsible", "handoff"]).default("none"),
  assignmentTargetMemberIds: z.array(hexUuid()).max(50).default([]),
});

export type AddTaskNoteWorkflowInput = z.input<typeof NOTE_WORKFLOW_SCHEMA>;

const DUE_REQUIRED = "Not eklemek için teslim tarihini belirleyin.";
const DUE_REQUIRED_NO_PERM =
  "Bu göreve not eklemek için teslim tarihi gerekli. Teslim tarihi belirleme yetkiniz yok.";
const DUE_CHANGE_DENIED = "Teslim tarihini değiştirme yetkiniz yok.";
const ASSIGN_DENIED = "Bu göreve sorumlu kişi atama yetkiniz yok.";
const PEOPLE_INVALID = "Seçilen kişilerden bazıları bu çalışma alanına ait değil.";
const NOTE_SAVE_FAILED = "Not eklenemedi. Lütfen tekrar deneyin.";
const WORKFLOW_PENDING_WARNING =
  "Not eklendi; not akışı alanları için veritabanı güncellemesi henüz uygulanmadığından tip/aksiyon bilgisi kaydedilemedi.";

export async function addTaskNoteWorkflow(
  input: AddTaskNoteWorkflowInput,
): Promise<{ id: string; warning?: string } | { error: string }> {
  const parsed = NOTE_WORKFLOW_SCHEMA.safeParse(input);
  if (!parsed.success) return { error: "Geçersiz veri." };
  const p = parsed.data;
  const body = p.body.trim();
  if (!body) return { error: "Not boş olamaz." };

  const supabase = await createClient();
  const ctx = await getTaskCallerCtx(supabase);
  if (!ctx) return { error: "Kimlik doğrulama gerekli." };
  if (ctx.role === "viewer") return { error: "İzleyiciler not ekleyemez." };
  const role = ctx.role as AppRole;

  // ── Task + workspace boundary ────────────────────────────────────────────
  const { data: task } = await supabase
    .from("tasks")
    .select("id, workspace_id, title, due_date, assignee_id, created_by, waiting_on_member_id")
    .eq("id", p.taskId)
    .maybeSingle();
  if (!task || task.workspace_id !== ctx.workspaceId) {
    return { error: "Görev bulunamadı." };
  }
  const taskPerm = {
    assignee_id: (task.assignee_id as string | null) ?? null,
    created_by: (task.created_by as string | null) ?? null,
  };
  const canEditDates = canEditTask(role, taskPerm, ctx.user.id);

  // ── Due-date confirmation (mandatory) ────────────────────────────────────
  const currentDue = task.due_date ? String(task.due_date).slice(0, 10) : null;
  const effectiveDue = p.dueDate ?? currentDue;
  if (!effectiveDue) {
    return { error: canEditDates ? DUE_REQUIRED : DUE_REQUIRED_NO_PERM };
  }
  const dueChanged = effectiveDue !== currentDue;
  if (dueChanged && !canEditDates) return { error: DUE_CHANGE_DENIED };

  // ── Notify targets must belong to THIS workspace ─────────────────────────
  const notifyUserIds = [...new Set(p.notifyUserIds)];
  const notifyContactIds = [...new Set(p.notifyContactIds)];
  if (notifyUserIds.length > 0) {
    const { data: wm } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", ctx.workspaceId)
      .in("user_id", notifyUserIds);
    if ((wm ?? []).length !== notifyUserIds.length) return { error: PEOPLE_INVALID };
  }
  let contactUserIds: string[] = [];
  if (notifyContactIds.length > 0) {
    const { data: wc } = await supabase
      .from("workspace_contacts")
      .select("id, user_id")
      .eq("workspace_id", ctx.workspaceId)
      .in("id", notifyContactIds);
    if ((wc ?? []).length !== notifyContactIds.length) return { error: PEOPLE_INVALID };
    // A CRM contact linked to a real account can still receive in-app
    // notifications; unlinked contacts are recorded on the note only.
    contactUserIds = (wc ?? [])
      .map((c) => c.user_id as string | null)
      .filter((id): id is string => !!id);
  }

  // ── Assignment intent (validated BEFORE any write) ───────────────────────
  const assignmentTargets = [...new Set(p.assignmentTargetMemberIds)];
  if (p.noteType === "handoff" && (p.assignmentAction === "none" || assignmentTargets.length === 0)) {
    return { error: "Devir notu için sorumlu kişi ve devir aksiyonu seçin." };
  }
  let desiredParticipants: string[] | null = null;
  if (p.assignmentAction !== "none") {
    if (assignmentTargets.length === 0) {
      return { error: "Sorumluluk aksiyonu için kişi seçin." };
    }
    const { data: existingRows } = await supabase
      .from("task_member_completions")
      .select("member_id")
      .eq("task_id", p.taskId);
    const existingMemberIds = (existingRows ?? []).map((r) => r.member_id as string);
    const isParticipant = existingMemberIds.includes(ctx.memberId ?? "");
    if (!canManageTaskAssignment(role, taskPerm, ctx.user.id, isParticipant)) {
      return { error: ASSIGN_DENIED };
    }
    desiredParticipants =
      p.assignmentAction === "handoff"
        ? assignmentTargets
        : [...new Set([...existingMemberIds, ...assignmentTargets])];
  }

  // ── 1) Note insert (workflow columns → legacy fallback pre-migration) ────
  const noteMetadata: Record<string, Json> = {
    notify_user_ids: notifyUserIds,
    notify_contact_ids: notifyContactIds,
    assignment_action: p.assignmentAction,
    due_confirmed: effectiveDue,
    ...(dueChanged ? { due_from: currentDue, due_to: effectiveDue } : {}),
  };
  let noteId: string | null = null;
  let migrationMissing = false;
  {
    const { data: inserted, error: insErr } = await supabase
      .from("task_notes")
      .insert({
        workspace_id: ctx.workspaceId,
        task_id: p.taskId,
        author_id: ctx.user.id,
        content: body,
        note_type: p.noteType,
        action_status: "open",
        due_date_at_note_time: effectiveDue,
        metadata: noteMetadata,
      })
      .select("id")
      .single();
    if (insErr && isMissingSchemaError(insErr)) {
      // Production schema is behind the code: degrade to a plain note instead
      // of blocking the team, and tell the caller the workflow bits were lost.
      migrationMissing = true;
      const { data: legacy, error: legacyErr } = await supabase
        .from("task_notes")
        .insert({
          workspace_id: ctx.workspaceId,
          task_id: p.taskId,
          author_id: ctx.user.id,
          content: body,
        })
        .select("id")
        .single();
      if (legacyErr || !legacy) return { error: toActionErrorMessage(legacyErr, NOTE_SAVE_FAILED) };
      noteId = legacy.id as string;
    } else if (insErr || !inserted) {
      return { error: toActionErrorMessage(insErr, NOTE_SAVE_FAILED) };
    } else {
      noteId = inserted.id as string;
    }
  }

  // Compensation helper — never leave the note behind if a later step fails.
  async function rollbackNote() {
    if (noteId) {
      await supabase.from("task_notes").delete().eq("id", noteId).eq("workspace_id", ctx!.workspaceId);
    }
  }

  // ── 2) Due-date update (only when actually changed) ──────────────────────
  if (dueChanged) {
    const { error: dueErr } = await supabase
      .from("tasks")
      .update({ due_date: effectiveDue })
      .eq("id", p.taskId);
    if (dueErr) {
      await rollbackNote();
      return { error: "Teslim tarihi güncellenemedi; not eklenmedi. Lütfen tekrar deneyin." };
    }
  }

  // ── 3) Responsibility change via the canonical participant writer ────────
  // setTaskParticipants re-checks permissions server-side, validates the member
  // ids, writes with the service-role client, logs responsible_added/removed
  // and notifies the added people. If it fails, the whole note action fails.
  if (desiredParticipants) {
    const res = await setTaskParticipants(p.taskId, desiredParticipants);
    if ("error" in res) {
      if (dueChanged) {
        await supabase.from("tasks").update({ due_date: currentDue }).eq("id", p.taskId);
      }
      await rollbackNote();
      return { error: res.error };
    }
  }

  // ── 4) Notifications (best-effort; core data is already consistent) ──────
  const explicitRecipients = [...new Set([...notifyUserIds, ...contactUserIds])];
  const eventForType: Record<TaskNoteType, TaskNotificationEvent> = {
    info: "task_note_added",
    action_required: "task_note_action_required",
    handoff: "task_note_handoff",
    approval_waiting: "task_note_approval_waiting",
  };
  if (explicitRecipients.length > 0) {
    await notifyTaskEvent(supabase, {
      workspaceId: ctx.workspaceId,
      taskId: p.taskId,
      taskTitle: task.title as string,
      actorId: ctx.user.id,
      event: eventForType[p.noteType],
      recipientUserIds: explicitRecipients,
    });
  }
  // Baseline (legacy behaviour): the assignee & the waited-on person still hear
  // about new notes even when not explicitly targeted.
  {
    const baseline = new Set<string>();
    if (task.assignee_id) baseline.add(task.assignee_id as string);
    if (task.waiting_on_member_id) {
      const { data: wm } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("id", task.waiting_on_member_id as string)
        .maybeSingle();
      if (wm?.user_id) baseline.add(wm.user_id as string);
    }
    for (const id of explicitRecipients) baseline.delete(id);
    baseline.delete(ctx.user.id);
    if (baseline.size > 0) {
      await notifyTaskEvent(supabase, {
        workspaceId: ctx.workspaceId,
        taskId: p.taskId,
        taskTitle: task.title as string,
        actorId: ctx.user.id,
        event: "task_note_added",
        recipientUserIds: [...baseline],
      });
    }
  }

  // ── 5) Activity log (only after every real write succeeded) ──────────────
  const activityMeta: Record<string, Json> = {
    note_type: p.noteType,
    notified_user_ids: notifyUserIds,
    notified_contact_ids: notifyContactIds,
    assignment_action: p.assignmentAction,
    due_confirmed: effectiveDue,
    ...(dueChanged ? { due_from: currentDue, due_to: effectiveDue } : {}),
  };
  await logTaskActivity(supabase, {
    workspaceId: ctx.workspaceId, taskId: p.taskId, actorId: ctx.user.id,
    action: ACTIVITY_ACTIONS.NOTE_ADDED,
    metadata: activityMeta,
  });
  if (p.assignmentAction === "handoff" && desiredParticipants) {
    const { data: targetMembers } = await supabase
      .from("workspace_members")
      .select("id, user_id")
      .in("id", desiredParticipants);
    await logTaskActivity(supabase, {
      workspaceId: ctx.workspaceId, taskId: p.taskId, actorId: ctx.user.id,
      action: ACTIVITY_ACTIONS.TASK_HANDED_OFF,
      metadata: { target_user_ids: (targetMembers ?? []).map((m) => m.user_id as string) },
    });
  }

  revalidatePath(`/tasks/${p.taskId}`);
  revalidatePath("/board");
  return migrationMissing ? { id: noteId!, warning: WORKFLOW_PENDING_WARNING } : { id: noteId! };
}

// ── "Gördüm" / "Üzerime aldım" acknowledgements ───────────────────────────────

const ACK_TABLE_MISSING =
  "Bu özellik için veritabanı güncellemesi henüz uygulanmadı. Yöneticinize bildirin.";

export async function acknowledgeTaskNote(
  noteId: string,
  action: "seen" | "claimed",
): Promise<{ ok: true } | { error: string }> {
  const idParsed = hexUuid().safeParse(noteId);
  if (!idParsed.success || (action !== "seen" && action !== "claimed")) {
    return { error: "Geçersiz istek." };
  }

  const supabase = await createClient();
  const ctx = await getTaskCallerCtx(supabase);
  if (!ctx) return { error: "Kimlik doğrulama gerekli." };
  if (action === "claimed" && ctx.role === "viewer") {
    return { error: "İzleyiciler aksiyon üstlenemez." };
  }

  // select("*") stays valid pre-migration (no explicit new-column projection).
  const { data: note } = await supabase
    .from("task_notes")
    .select("*")
    .eq("id", idParsed.data)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!note) return { error: "Not bulunamadı." };
  const taskId = note.task_id as string;

  // Receipt row — idempotent (unique note_id+user_id+action, duplicates ignored)
  const { error: ackErr } = await supabase
    .from("task_note_acknowledgements")
    .upsert(
      {
        workspace_id: ctx.workspaceId,
        task_id: taskId,
        note_id: idParsed.data,
        user_id: ctx.user.id,
        action,
      },
      { onConflict: "note_id,user_id,action", ignoreDuplicates: true },
    );
  if (ackErr) {
    if (isMissingSchemaError(ackErr)) return { error: ACK_TABLE_MISSING };
    return { error: toActionErrorMessage(ackErr, "Kayıt oluşturulamadı. Lütfen tekrar deneyin.") };
  }

  if (action === "claimed") {
    // Mark the note claimed so the board badge/feed carry-over resolves for
    // everyone. The claimant is usually neither the author nor an admin, so the
    // task_notes RLS update policy would reject them — the write goes through
    // the server-side service-role client AFTER the checks above. Best-effort:
    // the receipt row above is the source of truth if this update fails.
    const writer = getAdminClient() ?? supabase;
    const oldMeta = (note.metadata ?? {}) as Record<string, Json>;
    await writer
      .from("task_notes")
      .update({ action_status: "claimed", metadata: { ...oldMeta, claimed_by: ctx.user.id } })
      .eq("id", idParsed.data)
      .eq("workspace_id", ctx.workspaceId);

    // If (and only if) the current permission model allows it, the claimant
    // also becomes a responsible participant. A plain member who is not on the
    // task cannot self-assign (that rule predates this feature and stands);
    // their claim is still recorded and visible.
    const { data: task } = await supabase
      .from("tasks")
      .select("assignee_id, created_by")
      .eq("id", taskId)
      .maybeSingle();
    if (task && ctx.memberId) {
      const { data: rows } = await supabase
        .from("task_member_completions")
        .select("member_id")
        .eq("task_id", taskId);
      const memberIds = (rows ?? []).map((r) => r.member_id as string);
      const isParticipant = memberIds.includes(ctx.memberId);
      const allowed = canManageTaskAssignment(
        ctx.role as AppRole,
        {
          assignee_id: (task.assignee_id as string | null) ?? null,
          created_by: (task.created_by as string | null) ?? null,
        },
        ctx.user.id,
        isParticipant,
      );
      if (allowed && !isParticipant) {
        await setTaskParticipants(taskId, [...memberIds, ctx.memberId]);
      }
    }
  }

  await logTaskActivity(supabase, {
    workspaceId: ctx.workspaceId, taskId, actorId: ctx.user.id,
    action: action === "claimed" ? ACTIVITY_ACTIONS.NOTE_ACTION_CLAIMED : ACTIVITY_ACTIONS.NOTE_SEEN,
    metadata: { note_id: idParsed.data },
  });

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/board");
  return { ok: true };
}

export async function toggleNotePin(
  noteId: string,
  taskId: string,
  isPinned: boolean
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getTaskCallerCtx(supabase);
  if (!ctx) return { error: "Kimlik doğrulama gerekli." };

  const { error } = await supabase
    .from("task_notes")
    .update({ is_pinned: isPinned })
    .eq("id", noteId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: error.message };
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

export async function deleteTaskNote(
  noteId: string,
  taskId: string
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getTaskCallerCtx(supabase);
  if (!ctx) return { error: "Kimlik doğrulama gerekli." };

  // Author may delete their own note; owner/admin may delete any.
  const { data: note } = await supabase
    .from("task_notes")
    .select("author_id")
    .eq("id", noteId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!note) return { error: "Not bulunamadı." };
  if (!canDeleteNoteItem(ctx.role as AppRole, { author_id: note.author_id as string | null }, ctx.user.id)) {
    return { error: PERM_DENIED };
  }

  const { error } = await supabase
    .from("task_notes")
    .delete()
    .eq("id", noteId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: error.message };
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

export async function updateTaskNote(
  noteId: string,
  taskId: string,
  content: string
): Promise<{ ok: true } | { error: string }> {
  const trimmed = content.trim();
  if (!trimmed) return { error: "Not boş olamaz." };

  const supabase = await createClient();
  const ctx = await getTaskCallerCtx(supabase);
  if (!ctx) return { error: "Kimlik doğrulama gerekli." };

  const { data: note } = await supabase
    .from("task_notes")
    .select("author_id")
    .eq("id", noteId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!note) return { error: "Not bulunamadı." };
  if (!canDeleteNoteItem(ctx.role as AppRole, { author_id: note.author_id as string | null }, ctx.user.id)) {
    return { error: PERM_DENIED };
  }

  const { error } = await supabase
    .from("task_notes")
    .update({ content: trimmed })
    .eq("id", noteId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: error.message };
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}
