"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateKeyBetween } from "fractional-indexing";
import { normalizeTags } from "@/lib/utils/normalize-tags";
import {
  canCreateTask, canArchiveTask, canDeleteTask, canPermanentDeleteTask,
  canEditTask, canReorderTask, canCompleteTask, type AppRole,
} from "@/lib/auth/permissions";
import {
  logTaskActivity, logTaskActivities, ACTIVITY_ACTIONS,
  type TaskActivityEntry,
} from "@/lib/activity/log-task-activity";
import { applyPointsForStatusTransition } from "@/lib/points/award";
import { notifyTaskEvent } from "@/lib/notifications/notify";
import { pointsForEffort, type EffortSize } from "@/lib/points/effort";
import type { Json, TaskStatus as TaskStatusType } from "@/types";

const ADMIN_ROLES: AppRole[] = ["owner", "admin"];
const isAdminRole = (r: AppRole) => ADMIN_ROLES.includes(r);

const PERM_DENIED = "Bu işlem için yetkiniz yok.";
const FINAL_DONE_DENIED = "Görevi yalnızca yönetici tamamlanmış olarak işaretleyebilir. Lütfen 'Kontrol / Onay'a taşıyın.";
const DONE_LOCKED_DENIED = "Tamamlanmış görevleri yalnızca yönetici değiştirebilir.";

// A non-admin may never push a task INTO "done" nor pull one OUT of "done".
// Both directions are owner/admin-only; members route through "Kontrol / Onay".
function isForbiddenDoneTransition(
  from: TaskStatusType, to: TaskStatusType, role: AppRole,
): boolean {
  if (from === to) return false;
  const touchesDone = to === "done" || from === "done";
  return touchesDone && !canCompleteTask(role);
}

// Notify on meaningful status transitions:
//  • → review : tell workspace owners/admins a task is awaiting approval
//  • → done   : tell the assignee their task was marked complete
// Reopen + points fan-out live in lib/points/award.ts. The central producer
// (notifyTaskEvent → create_task_notifications RPC) owns Turkish copy + dedupe.
async function notifyStatusTransition(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts: {
    taskId: string; workspaceId: string; title: string; actorId: string;
    from: TaskStatusType; to: TaskStatusType; assigneeId: string | null;
  },
) {
  const { taskId, workspaceId, title, actorId, from, to, assigneeId } = opts;
  if (to === from) return;
  if (to === "review") {
    const { data: admins } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .in("role", ["owner", "admin"]);
    await notifyTaskEvent(supabase, {
      workspaceId, taskId, taskTitle: title, actorId,
      event: "task_review_requested",
      recipientUserIds: (admins ?? []).map((a) => a.user_id as string),
    });
  } else if (to === "done") {
    await notifyTaskEvent(supabase, {
      workspaceId, taskId, taskTitle: title, actorId,
      event: "task_completed",
      recipientUserIds: [assigneeId],
    });
  }
}

async function getUserAndRole(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  return member ? { user, role: member.role as AppRole, workspaceId: member.workspace_id } : null;
}

// ---- Zod schemas ----

const TaskStatusSchema = z.enum([
  "backlog", "ready", "in_progress", "blocked", "review", "done", "archived",
]);

const TaskPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);

// Zod v4 changed z.string().uuid() to strict RFC 9562 — rejects nil-pattern UUIDs
// (e.g. "00000000-0000-0000-0000-000000000010") used throughout seed data.
// Use a structural hex regex instead.
const hexUuid = (msg: string) =>
  z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, msg);

const CreateTaskSchema = z.object({
  workspace_id: hexUuid("Geçersiz çalışma alanı"),
  title: z.string().min(1, "Başlık gerekli").max(500, "Başlık çok uzun"),
  description: z.string().max(10000).optional(),
  status: TaskStatusSchema.default("backlog"),
  priority: TaskPrioritySchema.default("medium"),
  assignee_id: hexUuid("Geçersiz üye seçimi").nullable().optional(),
  responsible_contact_id: hexUuid("Geçersiz kişi seçimi").nullable().optional(),
  due_date: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  department_id: hexUuid("Geçersiz departman").nullable().optional(),
  effort_size: z.enum(["small", "medium", "large"]).optional(),
  visibility: z.enum(["workspace", "admin_only"]).optional(),
  // When true (interactive create form), start + due date are mandatory. Bulk /
  // system creators (Excel import, note→task) omit this and keep their behaviour.
  require_schedule: z.boolean().optional(),
  tags: z.array(z.string().max(50)).max(20).default([]),
  custom_fields: z.record(z.string(), z.unknown()).default({}),
});

const ApprovalStatusSchema = z.enum(["none", "pending", "approved", "rejected"]);

const UpdateTaskSchema = z.object({
  id: hexUuid("Geçersiz görev kimliği"),
  title: z.string().min(1, "Başlık gerekli").max(500).optional(),
  description: z.string().max(10000).nullable().optional(),
  status: TaskStatusSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  assignee_id: hexUuid("Geçersiz üye seçimi").nullable().optional(),
  responsible_contact_id: hexUuid("Geçersiz kişi seçimi").nullable().optional(),
  due_date: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
  approval_required: z.boolean().optional(),
  approval_status: ApprovalStatusSchema.optional(),
  waiting_on_member_id: hexUuid("Geçersiz üye").nullable().optional(),
  waiting_on_contact_id: hexUuid("Geçersiz kişi").nullable().optional(),
  waiting_reason: z.string().max(500).nullable().optional(),
  department_id: hexUuid("Geçersiz departman").nullable().optional(),
  effort_size: z.enum(["small", "medium", "large"]).optional(),
  visibility: z.enum(["workspace", "admin_only"]).optional(),
});

const ReorderTaskSchema = z.object({
  id: hexUuid("Geçersiz görev kimliği"),
  newStatus: TaskStatusSchema,
  prevIndex: z.string().nullable(),
  nextIndex: z.string().nullable(),
});

// ---- Server actions ----

export async function createTask(
  input: z.infer<typeof CreateTaskSchema>
): Promise<{ id: string } | { error: string }> {
  const parsed = CreateTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const ctx = await getUserAndRole(supabase);
  if (!ctx) return { error: "Not authenticated" };
  const { user, role } = ctx;

  if (!canCreateTask(role)) return { error: PERM_DENIED };

  // Date discipline. Interactive creates (require_schedule) must carry both a
  // start and a due date; any create with both must keep start ≤ due.
  const { require_schedule, ...createInput } = parsed.data;
  if (require_schedule) {
    if (!createInput.start_date) return { error: "Başlangıç tarihi zorunludur." };
    if (!createInput.due_date) return { error: "Teslim tarihi zorunludur." };
  }
  if (createInput.start_date && createInput.due_date && createInput.start_date > createInput.due_date) {
    return { error: "Başlangıç tarihi teslim tarihinden sonra olamaz." };
  }

  // Visibility is admin-only. A non-admin explicitly asking for an admin_only
  // task is rejected (the UI never offers them the field, so this only fires for
  // hand-crafted requests). Members otherwise default to 'workspace' below.
  if (parsed.data.visibility === "admin_only" && !isAdminRole(role)) {
    return { error: "Yöneticiye özel görev oluşturma yetkiniz yok." };
  }

  // AF works weekly: a new task's entry date (start_date) defaults to today so
  // it always lands in the current week's board even if no due date is set yet.
  const today = new Date().toISOString().slice(0, 10);
  // Effort is an admin-only lever; members always create at the default (medium
  // / 3 points). points_value is always derived from effort server-side.
  const effort_size: EffortSize = isAdminRole(role) && createInput.effort_size
    ? createInput.effort_size
    : "medium";
  // Visibility is an admin-only lever. A non-admin (or unset) always lands on
  // 'workspace' — a member can never create a hidden, admin-only task.
  const visibility = isAdminRole(role) && createInput.visibility === "admin_only"
    ? "admin_only"
    : "workspace";
  const taskData = {
    ...createInput,
    tags: normalizeTags(createInput.tags),
    start_date: createInput.start_date ?? today,
    effort_size,
    points_value: pointsForEffort(effort_size),
    visibility,
  };

  // Get the last fractional_index for this status column
  const { data: lastTask } = await supabase
    .from("tasks")
    .select("fractional_index")
    .eq("workspace_id", taskData.workspace_id)
    .eq("status", taskData.status)
    .order("fractional_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const rawLastIndex = (lastTask as { fractional_index?: string } | null)?.fractional_index ?? null;
  let fractional_index: string;
  try {
    fractional_index = generateKeyBetween(rawLastIndex, null);
  } catch {
    fractional_index = generateKeyBetween(null, null);
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      ...taskData,
      fractional_index,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Log creation activity (legacy task_activity — drives notifications)
  await supabase.from("task_activity").insert({
    task_id: (data as { id: string }).id,
    workspace_id: taskData.workspace_id,
    user_id: user.id,
    type: "created",
    content: null,
    metadata: null,
  });

  // Audit trail
  await logTaskActivity(supabase, {
    workspaceId: taskData.workspace_id,
    taskId: (data as { id: string }).id,
    actorId: user.id,
    action: ACTIVITY_ACTIONS.TASK_CREATED,
    metadata: {
      status: taskData.status,
      priority: taskData.priority,
      due_date: taskData.due_date ?? null,
      assignee_id: taskData.assignee_id ?? null,
      responsible_contact_id: taskData.responsible_contact_id ?? null,
    },
  });

  // Notification: task created already assigned to someone else
  if (taskData.assignee_id && taskData.assignee_id !== user.id) {
    await notifyTaskEvent(supabase, {
      workspaceId: taskData.workspace_id,
      taskId: (data as { id: string }).id,
      taskTitle: taskData.title,
      actorId: user.id,
      event: "task_assigned",
      recipientUserIds: [taskData.assignee_id],
    });
  }

  revalidatePath("/board");
  revalidatePath("/list");
  return { id: (data as { id: string }).id };
}

export async function updateTask(
  input: z.infer<typeof UpdateTaskSchema>
): Promise<{ success: true } | { error: string }> {
  const parsed = UpdateTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const ctx = await getUserAndRole(supabase);
  if (!ctx) return { error: "Not authenticated" };
  const { user, role } = ctx;

  const { id, ...rawUpdates } = parsed.data;
  const updates: Record<string, unknown> = rawUpdates.tags !== undefined
    ? { ...rawUpdates, tags: normalizeTags(rawUpdates.tags) }
    : { ...rawUpdates };

  // Effort is admin-only. Strip it for non-admins; for admins, derive the
  // matching points_value so the two columns can never drift apart.
  if ("effort_size" in updates) {
    if (isAdminRole(role) && updates.effort_size) {
      updates.points_value = pointsForEffort(updates.effort_size as EffortSize);
    } else {
      delete updates.effort_size;
    }
  }

  // Visibility is admin-only. Strip it for non-admins so a member can never flip
  // a task to/from admin_only (RLS would block it anyway, but fail-soft here).
  if ("visibility" in updates && !isAdminRole(role)) {
    delete updates.visibility;
  }

  // Fetch current state for both permission check and activity logging
  const { data: currentTask } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .single();

  if (!currentTask) return { error: "Task not found" };

  const task = currentTask as Record<string, unknown>;
  if (!canEditTask(role, { assignee_id: task.assignee_id as string | null, created_by: task.created_by as string | null }, user.id)) {
    return { error: PERM_DENIED };
  }

  // Turning a task admin_only: every current responsible person (participants ∪
  // legacy assignee fallback) must already be an owner/admin. We reject rather
  // than silently dropping members, so the admin consciously removes them first.
  const nextVisibility = "visibility" in updates ? (updates.visibility as string | undefined) : undefined;
  if (nextVisibility === "admin_only" && task.visibility !== "admin_only") {
    const wsId = task.workspace_id as string;
    const { data: parts } = await supabase
      .from("task_member_completions")
      .select("workspace_members(user_id, role)")
      .eq("task_id", id);
    const responsibleRoles: { user_id: string | null; role: string }[] = (parts ?? [])
      .map((p) => {
        const wm = (p as { workspace_members: unknown }).workspace_members;
        return (Array.isArray(wm) ? wm[0] : wm) as { user_id: string | null; role: string } | null;
      })
      .filter((r): r is { user_id: string | null; role: string } => !!r);

    // Fall back to the legacy assignee when there are no participant rows.
    if (responsibleRoles.length === 0 && task.assignee_id) {
      const { data: am } = await supabase
        .from("workspace_members")
        .select("user_id, role")
        .eq("workspace_id", wsId)
        .eq("user_id", task.assignee_id as string)
        .maybeSingle();
      if (am) responsibleRoles.push(am as { user_id: string | null; role: string });
    }

    const hasNonAdmin = responsibleRoles.some(
      (r) => r.role !== "owner" && r.role !== "admin",
    );
    if (hasNonAdmin) {
      return {
        error:
          "Bu görevi sadece yöneticilere özel yapmak için yönetici olmayan sorumluları kaldırın.",
      };
    }
  }

  // Only owner/admin can mark a task finally done OR reopen a done task; members
  // use Kontrol / Onay and can never touch the done boundary in either direction.
  const nextStatus = "status" in updates ? (updates.status as TaskStatusType | undefined) : undefined;
  if (nextStatus && isForbiddenDoneTransition(task.status as TaskStatusType, nextStatus, role)) {
    return { error: task.status === "done" ? DONE_LOCKED_DENIED : FINAL_DONE_DENIED };
  }

  const { error } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", id);

  if (error) return { error: error.message };

  // Log changed fields as activity events (legacy task_activity)
  const activityInserts = buildActivityEvents(id, task.workspace_id as string, user.id, task, updates as Record<string, unknown>);
  if (activityInserts.length > 0) {
    await supabase.from("task_activity").insert(activityInserts);
  }

  // Audit trail — one entry per meaningful field change
  const logEntries = buildActivityLogEntries(
    id, task.workspace_id as string, user.id, task, updates as Record<string, unknown>,
  );
  await logTaskActivities(supabase, logEntries);

  // Notification: task assigned to a new person
  const newAssignee = "assignee_id" in updates ? updates.assignee_id : undefined;
  if (newAssignee && newAssignee !== task.assignee_id && newAssignee !== user.id) {
    await notifyTaskEvent(supabase, {
      workspaceId: task.workspace_id as string,
      taskId: id,
      taskTitle: task.title as string,
      actorId: user.id,
      event: "task_assigned",
      recipientUserIds: [newAssignee as string],
    });
  }

  // Notification: waiting_on changed — notify the person being waited on
  const newWaitingMember = "waiting_on_member_id" in updates ? updates.waiting_on_member_id : undefined;
  if (newWaitingMember && newWaitingMember !== (task.waiting_on_member_id ?? null) && newWaitingMember !== user.id) {
    // Resolve waiting member's profile user_id via workspace_members
    const { data: wm } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("id", newWaitingMember as string)
      .maybeSingle();
    if (wm?.user_id) {
      await notifyTaskEvent(supabase, {
        workspaceId: task.workspace_id as string,
        taskId: id,
        taskTitle: task.title as string,
        actorId: user.id,
        event: "task_waiting_on",
        recipientUserIds: [wm.user_id],
      });
    }
  }

  // Notification: status moved to review (→ admins) or done (→ assignee)
  if (nextStatus && nextStatus !== task.status) {
    await notifyStatusTransition(supabase, {
      taskId: id, workspaceId: task.workspace_id as string, title: task.title as string,
      actorId: user.id, from: task.status as TaskStatusType, to: nextStatus,
      assigneeId: (task.assignee_id as string | null) ?? null,
    });
    // Puan & Motivasyon: finalise on → done, revoke on done → …
    await applyPointsForStatusTransition(supabase, {
      taskId: id, workspaceId: task.workspace_id as string, title: task.title as string,
      actorId: user.id, from: task.status as TaskStatusType, to: nextStatus,
    });
  }

  revalidatePath(`/tasks/${id}`);
  revalidatePath("/board");
  revalidatePath("/list");
  return { success: true };
}

export async function updateTaskStatus(
  taskId: string,
  newStatus: z.infer<typeof TaskStatusSchema>
): Promise<{ success: true } | { error: string }> {
  return updateTask({ id: taskId, status: newStatus });
}

export async function deleteTask(
  taskId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) return { error: error.message };

  revalidatePath("/board");
  revalidatePath("/list");
  redirect("/board");
}

// ---- Lifecycle: soft-delete ----

export async function softDeleteTask(
  taskId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getUserAndRole(supabase);
  if (!ctx) return { error: "Not authenticated" };
  if (!canDeleteTask(ctx.role)) return { error: PERM_DENIED };

  const { error } = await supabase
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", taskId);

  if (error) return { error: error.message };
  await logTaskActivity(supabase, {
    workspaceId: ctx.workspaceId,
    taskId,
    actorId: ctx.user.id,
    action: ACTIVITY_ACTIONS.TASK_TRASHED,
  });
  revalidatePath("/board");
  revalidatePath("/list");
  revalidatePath("/trash");
  return { success: true };
}

// ---- Lifecycle: archive (explicit) ----

export async function archiveTask(
  taskId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getUserAndRole(supabase);
  if (!ctx) return { error: "Not authenticated" };
  if (!canArchiveTask(ctx.role)) return { error: PERM_DENIED };

  const { error } = await supabase
    .from("tasks")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", taskId);

  if (error) return { error: error.message };
  await logTaskActivity(supabase, {
    workspaceId: ctx.workspaceId,
    taskId,
    actorId: ctx.user.id,
    action: ACTIVITY_ACTIONS.TASK_ARCHIVED,
  });
  revalidatePath("/board");
  revalidatePath("/list");
  revalidatePath("/archive");
  return { success: true };
}

// ---- Lifecycle: unarchive ----

export async function unarchiveTask(
  taskId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getUserAndRole(supabase);
  if (!ctx) return { error: "Not authenticated" };
  if (!canArchiveTask(ctx.role)) return { error: PERM_DENIED };

  const { error } = await supabase
    .from("tasks")
    .update({ archived_at: null })
    .eq("id", taskId);

  if (error) return { error: error.message };
  await logTaskActivity(supabase, {
    workspaceId: ctx.workspaceId,
    taskId,
    actorId: ctx.user.id,
    action: ACTIVITY_ACTIONS.TASK_UNARCHIVED,
  });
  revalidatePath("/board");
  revalidatePath("/archive");
  return { success: true };
}

// ---- Lifecycle: restore from trash ----

export async function restoreTask(
  taskId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getUserAndRole(supabase);
  if (!ctx) return { error: "Not authenticated" };
  if (!canDeleteTask(ctx.role)) return { error: PERM_DENIED };

  const { error } = await supabase
    .from("tasks")
    .update({ deleted_at: null })
    .eq("id", taskId);

  if (error) return { error: error.message };
  await logTaskActivity(supabase, {
    workspaceId: ctx.workspaceId,
    taskId,
    actorId: ctx.user.id,
    action: ACTIVITY_ACTIONS.TASK_RESTORED,
  });
  revalidatePath("/board");
  revalidatePath("/trash");
  return { success: true };
}

// ---- Lifecycle: permanent delete (from trash) ----

export async function permanentDeleteTask(
  taskId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getUserAndRole(supabase);
  if (!ctx) return { error: "Not authenticated" };
  if (!canPermanentDeleteTask(ctx.role)) return { error: PERM_DENIED };

  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) return { error: error.message };
  revalidatePath("/trash");
  return { success: true };
}

// ---- Lifecycle: duplicate ----

export async function duplicateTask(
  taskId: string
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getUserAndRole(supabase);
  if (!ctx) return { error: "Not authenticated" };
  const { user, role } = ctx;

  if (!canCreateTask(role)) return { error: PERM_DENIED };

  const { data: src } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .single();
  if (!src) return { error: "Task not found" };

  const source = src as Record<string, unknown>;

  // Get last fractional_index in the same status column
  const { data: lastTask } = await supabase
    .from("tasks")
    .select("fractional_index")
    .eq("workspace_id", source.workspace_id as string)
    .eq("status", source.status as string)
    .order("fractional_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const rawLastIndex2 = (lastTask as { fractional_index?: string } | null)?.fractional_index ?? null;
  let fractional_index2: string;
  try {
    fractional_index2 = generateKeyBetween(rawLastIndex2, null);
  } catch {
    fractional_index2 = generateKeyBetween(null, null);
  }
  const fractional_index = fractional_index2;

  const { data: newTask, error } = await supabase
    .from("tasks")
    .insert({
      workspace_id:           source.workspace_id,
      title:                  `${source.title as string} kopyası`,
      description:            source.description,
      status:                 source.status,
      priority:               source.priority,
      assignee_id:            source.assignee_id,
      responsible_contact_id: source.responsible_contact_id,
      due_date:               source.due_date,
      start_date:             source.start_date,
      tags:                   source.tags,
      custom_fields:          source.custom_fields,
      fractional_index,
      created_by:             user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  await logTaskActivity(supabase, {
    workspaceId: source.workspace_id as string,
    taskId: (newTask as { id: string }).id,
    actorId: user.id,
    action: ACTIVITY_ACTIONS.TASK_DUPLICATED,
    metadata: { source_task_id: taskId },
  });
  revalidatePath("/board");
  revalidatePath("/list");
  return { id: (newTask as { id: string }).id };
}

export async function reorderTask(
  input: z.infer<typeof ReorderTaskSchema>
): Promise<{ success: true } | { error: string }> {
  const parsed = ReorderTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const ctx = await getUserAndRole(supabase);
  if (!ctx) return { error: "Not authenticated" };
  const { user, role } = ctx;

  const { id, newStatus, prevIndex, nextIndex } = parsed.data;

  // Fetch current row once: used for the permission check and for logging the
  // status transition (old → new) to the audit trail.
  const { data: currentTask } = await supabase
    .from("tasks")
    .select("status, assignee_id, created_by, workspace_id, title")
    .eq("id", id)
    .maybeSingle();
  if (!currentTask) return { error: "Task not found" };
  const prevTask = currentTask as {
    status: TaskStatusType;
    assignee_id: string | null;
    created_by: string | null;
    workspace_id: string;
    title: string;
  };

  // Members can move tasks they own, created, OR are a responsible participant of.
  if (role === "viewer") {
    return { error: PERM_DENIED };
  }
  if (role === "member" && !canReorderTask(role, prevTask, user.id)) {
    // Participant check: is this member a responsible person on the task?
    const { data: myMember } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("workspace_id", prevTask.workspace_id)
      .maybeSingle();
    let isParticipant = false;
    if (myMember?.id) {
      const { data: comp } = await supabase
        .from("task_member_completions")
        .select("id")
        .eq("task_id", id)
        .eq("member_id", myMember.id)
        .maybeSingle();
      isParticipant = !!comp;
    }
    if (!isParticipant) return { error: "Bu görevi yalnızca sorumlu kişiler veya yöneticiler taşıyabilir." };
  }

  // Only owner/admin can mark a task finally done OR reopen one; members never
  // cross the done boundary in either direction (drag included).
  if (isForbiddenDoneTransition(prevTask.status, newStatus, role)) {
    return { error: prevTask.status === "done" ? DONE_LOCKED_DENIED : FINAL_DONE_DENIED };
  }

  let fractional_index: string;
  try {
    fractional_index = generateKeyBetween(prevIndex, nextIndex);
  } catch {
    // Neighbor key is invalid legacy value; place at column end
    try { fractional_index = generateKeyBetween(prevIndex, null); } catch {
      fractional_index = generateKeyBetween(null, null);
    }
  }

  const { error } = await supabase
    .from("tasks")
    .update({ status: newStatus, fractional_index })
    .eq("id", id);

  if (error) return { error: error.message };

  // Audit trail — log the status transition caused by the drag (if any)
  if (newStatus !== prevTask.status) {
    await logTaskActivity(supabase, statusTransitionEntry(
      id, prevTask.workspace_id, user.id, prevTask.status, newStatus,
    ));
    await notifyStatusTransition(supabase, {
      taskId: id, workspaceId: prevTask.workspace_id, title: prevTask.title,
      actorId: user.id, from: prevTask.status, to: newStatus, assigneeId: prevTask.assignee_id,
    });
    // Puan & Motivasyon: finalise on → done, revoke on done → …
    await applyPointsForStatusTransition(supabase, {
      taskId: id, workspaceId: prevTask.workspace_id, title: prevTask.title,
      actorId: user.id, from: prevTask.status, to: newStatus,
    });
  }

  revalidatePath("/board");
  return { success: true };
}

export async function addTaskComment(
  taskId: string,
  workspaceId: string,
  content: string
): Promise<{ success: true } | { error: string }> {
  if (!content.trim()) return { error: "Comment cannot be empty" };
  if (content.length > 5000) return { error: "Comment too long" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.from("task_activity").insert({
    task_id: taskId,
    workspace_id: workspaceId,
    user_id: user.id,
    type: "comment",
    content: content.trim(),
    metadata: null,
  });

  if (error) return { error: error.message };

  revalidatePath(`/tasks/${taskId}`);
  return { success: true };
}

// ---- Helpers ----

type ActivityInsert = {
  task_id: string;
  workspace_id: string;
  user_id: string;
  type: string;
  content: null;
  metadata: Record<string, unknown>;
};

function buildActivityEvents(
  taskId: string,
  workspaceId: string,
  userId: string,
  current: Record<string, unknown>,
  updates: Record<string, unknown>
): ActivityInsert[] {
  const events: ActivityInsert[] = [];
  const activityMap: Record<string, string> = {
    status: "status_change",
    priority: "priority_change",
    assignee_id: "assignee_change",
    title: "title_change",
    description: "description_change",
    due_date: "due_date_change",
    start_date: "start_date_change",
    tags: "tags_change",
    custom_fields: "custom_field_change",
  };

  for (const [field, activityType] of Object.entries(activityMap)) {
    if (field in updates && updates[field] !== current[field]) {
      events.push({
        task_id: taskId,
        workspace_id: workspaceId,
        user_id: userId,
        type: activityType,
        content: null,
        metadata: { from: current[field], to: updates[field] },
      });
    }
  }

  return events;
}

// ---- Activity log (audit trail) builders ----

// Build the right entry for a status transition: completed / reopened / changed.
function statusTransitionEntry(
  taskId: string,
  workspaceId: string,
  actorId: string,
  oldStatus: TaskStatusType,
  newStatus: TaskStatusType,
): TaskActivityEntry {
  let action: string = ACTIVITY_ACTIONS.STATUS_CHANGED;
  if (oldStatus !== "done" && newStatus === "done") {
    action = ACTIVITY_ACTIONS.TASK_COMPLETED;
  } else if (oldStatus === "done" && newStatus !== "done") {
    action = ACTIVITY_ACTIONS.TASK_REOPENED;
  }
  return {
    workspaceId,
    taskId,
    actorId,
    action,
    fieldName: "status",
    oldValue: oldStatus,
    newValue: newStatus,
  };
}

// Compare current task vs updates and produce one audit entry per meaningful change.
function buildActivityLogEntries(
  taskId: string,
  workspaceId: string,
  actorId: string,
  current: Record<string, unknown>,
  updates: Record<string, unknown>,
): TaskActivityEntry[] {
  const entries: TaskActivityEntry[] = [];
  const base = { workspaceId, taskId, actorId };

  // Status — special-cased (completed / reopened / changed)
  if ("status" in updates && updates.status !== current.status) {
    entries.push(statusTransitionEntry(
      taskId, workspaceId, actorId,
      current.status as TaskStatusType, updates.status as TaskStatusType,
    ));
  }

  // Simple scalar fields
  const scalarFields: { field: string; action: string }[] = [
    { field: "title", action: ACTIVITY_ACTIONS.TITLE_CHANGED },
    { field: "description", action: ACTIVITY_ACTIONS.DESCRIPTION_CHANGED },
    { field: "priority", action: ACTIVITY_ACTIONS.PRIORITY_CHANGED },
    { field: "assignee_id", action: ACTIVITY_ACTIONS.ASSIGNEE_CHANGED },
    { field: "responsible_contact_id", action: ACTIVITY_ACTIONS.RESPONSIBLE_CONTACT_CHANGED },
    { field: "due_date", action: ACTIVITY_ACTIONS.DUE_DATE_CHANGED },
    { field: "effort_size", action: ACTIVITY_ACTIONS.EFFORT_CHANGED },
  ];
  for (const { field, action } of scalarFields) {
    if (field in updates && (updates[field] ?? null) !== (current[field] ?? null)) {
      entries.push({
        ...base, action, fieldName: field,
        oldValue: (current[field] ?? null) as Json,
        newValue: (updates[field] ?? null) as Json,
      });
    }
  }

  // Tags — array comparison
  if ("tags" in updates) {
    const oldTags = (current.tags ?? []) as string[];
    const newTags = (updates.tags ?? []) as string[];
    if (JSON.stringify(oldTags) !== JSON.stringify(newTags)) {
      entries.push({
        ...base, action: ACTIVITY_ACTIONS.TAGS_CHANGED, fieldName: "tags",
        oldValue: oldTags as Json, newValue: newTags as Json,
      });
    }
  }

  // custom_fields.category — nested comparison
  if ("custom_fields" in updates) {
    const oldCat = (current.custom_fields as Record<string, unknown> | null)?.category ?? null;
    const newCat = (updates.custom_fields as Record<string, unknown> | null)?.category ?? null;
    if (oldCat !== newCat) {
      entries.push({
        ...base, action: ACTIVITY_ACTIONS.CATEGORY_CHANGED, fieldName: "category",
        oldValue: oldCat as Json, newValue: newCat as Json,
      });
    }
  }

  // Approval — collapse approval_required + approval_status into one entry
  const approvalChanged =
    ("approval_required" in updates && updates.approval_required !== current.approval_required) ||
    ("approval_status" in updates && updates.approval_status !== current.approval_status);
  if (approvalChanged) {
    entries.push({
      ...base, action: ACTIVITY_ACTIONS.APPROVAL_CHANGED, fieldName: "approval",
      oldValue: {
        approval_required: (current.approval_required ?? null) as Json,
        approval_status: (current.approval_status ?? null) as Json,
      },
      newValue: {
        approval_required: ("approval_required" in updates ? updates.approval_required : current.approval_required) as Json,
        approval_status: ("approval_status" in updates ? updates.approval_status : current.approval_status) as Json,
      },
    });
  }

  // Waiting person — collapse waiting_on_member_id + waiting_on_contact_id
  const waitingChanged =
    ("waiting_on_member_id" in updates && updates.waiting_on_member_id !== current.waiting_on_member_id) ||
    ("waiting_on_contact_id" in updates && updates.waiting_on_contact_id !== current.waiting_on_contact_id);
  if (waitingChanged) {
    entries.push({
      ...base, action: ACTIVITY_ACTIONS.WAITING_PERSON_CHANGED, fieldName: "waiting_on",
      oldValue: {
        member_id: (current.waiting_on_member_id ?? null) as Json,
        contact_id: (current.waiting_on_contact_id ?? null) as Json,
      },
      newValue: {
        member_id: ("waiting_on_member_id" in updates ? updates.waiting_on_member_id : current.waiting_on_member_id) as Json,
        contact_id: ("waiting_on_contact_id" in updates ? updates.waiting_on_contact_id : current.waiting_on_contact_id) as Json,
      },
    });
  }

  return entries;
}

// Saved view actions
export async function createSavedView(input: {
  workspace_id: string;
  name: string;
  config: Record<string, unknown>;
  is_shared?: boolean;
}): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data, error } = await supabase
    .from("saved_views")
    .insert({ ...input, owner_id: user.id })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/board");
  revalidatePath("/list");
  return { id: (data as { id: string }).id };
}

export async function deleteSavedView(
  viewId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("saved_views").delete().eq("id", viewId);
  if (error) return { error: error.message };
  revalidatePath("/board");
  revalidatePath("/list");
  return { success: true };
}

// Custom fields validation helper (used by form components)
export async function validateAndUpdateCustomFields(
  taskId: string,
  workspaceId: string,
  customFields: Record<string, unknown>
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();

  // Fetch definitions for this workspace
  const { data: defs } = await supabase
    .from("custom_field_definitions")
    .select("field_key, field_type, options")
    .eq("workspace_id", workspaceId);

  if (!defs) return updateTask({ id: taskId, custom_fields: customFields });

  // Validate each field
  const schema = buildCustomFieldsSchema(defs as CustomFieldDef[]);
  const parsed = schema.safeParse(customFields);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  return updateTask({ id: taskId, custom_fields: parsed.data });
}

type CustomFieldDef = { field_key: string; field_type: string; options: string[] | null };

function buildCustomFieldsSchema(defs: CustomFieldDef[]): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const def of defs) {
    switch (def.field_type) {
      case "text":
        shape[def.field_key] = z.string().optional();
        break;
      case "number":
        shape[def.field_key] = z.number().optional();
        break;
      case "boolean":
        shape[def.field_key] = z.boolean().optional();
        break;
      case "date":
        shape[def.field_key] = z.string().date().optional();
        break;
      case "select":
        if (def.options) {
          shape[def.field_key] = z.enum(def.options as [string, ...string[]]).optional();
        }
        break;
    }
  }
  return z.object(shape).passthrough();
}

// Notification actions
export async function markNotificationsRead(
  notificationIds: string[]
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .in("id", notificationIds)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { success: true };
}

export async function markAllNotificationsRead(): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { success: true };
}

