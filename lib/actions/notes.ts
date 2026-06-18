"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

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

export async function updateNote(data: {
  id: string;
  title?: string;
  body?: string | null;
  color?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum açılmamış" };

  const schema = z.object({
    id: hexUuid(),
    title: z.string().min(1).max(500).trim().optional(),
    body: z.string().max(5000).nullable().optional(),
    color: NOTE_COLOR.optional(),
  });

  const parsed = schema.safeParse(data);
  if (!parsed.success) return { error: "Geçersiz veri" };

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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum açılmamış" };

  const parsed = hexUuid().safeParse(id);
  if (!parsed.success) return { error: "Geçersiz ID" };

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
