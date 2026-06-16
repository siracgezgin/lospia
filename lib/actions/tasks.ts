"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateKeyBetween } from "fractional-indexing";
import type { TaskStatus, TaskPriority } from "@/types";

// ---- Zod schemas ----

const TaskStatusSchema = z.enum([
  "backlog", "ready", "in_progress", "blocked", "review", "done", "archived",
]);

const TaskPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);

export const CreateTaskSchema = z.object({
  workspace_id: z.string().uuid(),
  title: z.string().min(1, "Title is required").max(500),
  description: z.string().max(10000).optional(),
  status: TaskStatusSchema.default("backlog"),
  priority: TaskPrioritySchema.default("medium"),
  assignee_id: z.string().uuid().nullable().optional(),
  due_date: z.string().date().nullable().optional(),
  start_date: z.string().date().nullable().optional(),
  tags: z.array(z.string().max(50)).max(20).default([]),
  custom_fields: z.record(z.string(), z.unknown()).default({}),
});

export const UpdateTaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).nullable().optional(),
  status: TaskStatusSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  assignee_id: z.string().uuid().nullable().optional(),
  due_date: z.string().date().nullable().optional(),
  start_date: z.string().date().nullable().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
});

export const ReorderTaskSchema = z.object({
  id: z.string().uuid(),
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Get the last fractional_index for this status column
  const { data: lastTask } = await supabase
    .from("tasks")
    .select("fractional_index")
    .eq("workspace_id", parsed.data.workspace_id)
    .eq("status", parsed.data.status)
    .order("fractional_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastIndex = (lastTask as { fractional_index?: string } | null)?.fractional_index ?? null;
  const fractional_index = generateKeyBetween(lastIndex, null);

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      ...parsed.data,
      fractional_index,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Log creation activity
  await supabase.from("task_activity").insert({
    task_id: (data as { id: string }).id,
    workspace_id: parsed.data.workspace_id,
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

  const { id, ...updates } = parsed.data;

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
  newStatus: TaskStatus
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

// Type re-exports for convenience
export type { TaskStatus, TaskPriority };
