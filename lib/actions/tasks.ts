"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateKeyBetween } from "fractional-indexing";
import { normalizeTags } from "@/lib/utils/normalize-tags";

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
  tags: z.array(z.string().max(50)).max(20).default([]),
  custom_fields: z.record(z.string(), z.unknown()).default({}),
});

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
  if (process.env.NODE_ENV === "development") {
    console.error("[createTask] RAW INPUT workspace_id:", JSON.stringify(input?.workspace_id), "type:", typeof input?.workspace_id);
    console.error("[createTask] RAW INPUT assignee_id:", JSON.stringify(input?.assignee_id), "type:", typeof input?.assignee_id);
    console.error("[createTask] RAW INPUT responsible_contact_id:", JSON.stringify(input?.responsible_contact_id));
    console.error("[createTask] RAW INPUT title:", JSON.stringify(input?.title));
    console.error("[createTask] ALL KEYS:", Object.keys(input ?? {}));
  }
  const parsed = CreateTaskSchema.safeParse(input);
  if (!parsed.success) {
    if (process.env.NODE_ENV === "development") {
      console.error("[createTask] validation errors:", JSON.stringify(parsed.error.flatten(), null, 2));
    }
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const taskData = { ...parsed.data, tags: normalizeTags(parsed.data.tags) };

  // Get the last fractional_index for this status column
  const { data: lastTask } = await supabase
    .from("tasks")
    .select("fractional_index")
    .eq("workspace_id", taskData.workspace_id)
    .eq("status", taskData.status)
    .order("fractional_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastIndex = (lastTask as { fractional_index?: string } | null)?.fractional_index ?? null;
  const fractional_index = generateKeyBetween(lastIndex, null);

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

  // Log creation activity
  await supabase.from("task_activity").insert({
    task_id: (data as { id: string }).id,
    workspace_id: taskData.workspace_id,
    user_id: user.id,
    type: "created",
    content: null,
    metadata: null,
  });

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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { id, ...rawUpdates } = parsed.data;
  const updates = rawUpdates.tags !== undefined
    ? { ...rawUpdates, tags: normalizeTags(rawUpdates.tags) }
    : rawUpdates;

  // Fetch current state for activity logging
  const { data: currentTask } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .single();

  if (!currentTask) return { error: "Task not found" };

  const { error } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", id);

  if (error) return { error: error.message };

  // Log changed fields as activity events
  const activityInserts = buildActivityEvents(id, (currentTask as Record<string, unknown>).workspace_id as string, user.id, currentTask as Record<string, unknown>, updates as Record<string, unknown>);
  if (activityInserts.length > 0) {
    await supabase.from("task_activity").insert(activityInserts);
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", taskId);

  if (error) return { error: error.message };
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("tasks")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", taskId);

  if (error) return { error: error.message };
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("tasks")
    .update({ archived_at: null })
    .eq("id", taskId);

  if (error) return { error: error.message };
  revalidatePath("/board");
  revalidatePath("/archive");
  return { success: true };
}

// ---- Lifecycle: restore from trash ----

export async function restoreTask(
  taskId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("tasks")
    .update({ deleted_at: null })
    .eq("id", taskId);

  if (error) return { error: error.message };
  revalidatePath("/board");
  revalidatePath("/trash");
  return { success: true };
}

// ---- Lifecycle: permanent delete (from trash) ----

export async function permanentDeleteTask(
  taskId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

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

  const lastIndex = (lastTask as { fractional_index?: string } | null)?.fractional_index ?? null;
  const fractional_index = generateKeyBetween(lastIndex, null);

  const { data: newTask, error } = await supabase
    .from("tasks")
    .insert({
      workspace_id:           source.workspace_id,
      title:                  `${source.title as string} (Kopya)`,
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { id, newStatus, prevIndex, nextIndex } = parsed.data;
  const fractional_index = generateKeyBetween(prevIndex, nextIndex);

  const { error } = await supabase
    .from("tasks")
    .update({ status: newStatus, fractional_index })
    .eq("id", id);

  if (error) return { error: error.message };

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

