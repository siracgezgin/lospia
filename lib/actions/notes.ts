"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logTaskActivity, ACTIVITY_ACTIONS } from "@/lib/activity/log-task-activity";
import { notifyTaskEvent } from "@/lib/notifications/notify";
import { canDeleteNoteItem, type AppRole } from "@/lib/auth/permissions";

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
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!member) return null;
  return { user, workspaceId: member.workspace_id, role: member.role };
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
