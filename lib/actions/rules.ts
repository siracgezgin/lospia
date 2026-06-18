"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

function hexUuid() {
  // z.string().uuid() enforces UUID version bits and rejects all-zero seeded IDs.
  // Use a format-only regex instead.
  return z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Geçersiz ID");
}

const RuleSchema = z.object({
  workspace_id: hexUuid(),
  title: z.string().min(1, "Başlık gerekli").max(500).trim(),
  body: z.string().max(5000).nullable().optional(),
  category: z.string().max(100).nullable().optional(),
});

export async function createRule(input: z.infer<typeof RuleSchema> & { position?: number }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum açılmamış" };

  const parsed = RuleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase.from("workspace_rules").insert({
    ...parsed.data,
    position: input.position ?? 0,
    created_by: user.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/rules");
  return { success: true };
}

export async function updateRule(input: {
  id: string;
  title?: string;
  body?: string | null;
  category?: string | null;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum açılmamış" };

  const schema = z.object({
    id: hexUuid(),
    title: z.string().min(1).max(500).trim().optional(),
    body: z.string().max(5000).nullable().optional(),
    category: z.string().max(100).nullable().optional(),
  });

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { id, ...rest } = parsed.data;
  const { error } = await supabase.from("workspace_rules").update(rest).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/rules");
  return { success: true };
}

export async function toggleRule(id: string, is_active: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum açılmamış" };

  const parsed = hexUuid().safeParse(id);
  if (!parsed.success) return { error: "Geçersiz ID" };

  const { error } = await supabase.from("workspace_rules").update({ is_active }).eq("id", parsed.data);
  if (error) return { error: error.message };

  revalidatePath("/rules");
  return { success: true };
}

export async function deleteRule(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum açılmamış" };

  const parsed = hexUuid().safeParse(id);
  if (!parsed.success) return { error: "Geçersiz ID" };

  const { error } = await supabase.from("workspace_rules").delete().eq("id", parsed.data);
  if (error) return { error: error.message };

  revalidatePath("/rules");
  return { success: true };
}
