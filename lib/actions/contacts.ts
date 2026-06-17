"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Zod v4 strict UUID rejects nil-pattern UUIDs from seed data — use hex regex
const hexUuid = (msg: string) =>
  z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, msg);

const CreateContactSchema = z.object({
  workspace_id: hexUuid("Geçersiz çalışma alanı"),
  name: z.string().min(1, "İsim gerekli").max(200),
  email: z.string().email("Geçersiz e-posta").optional().nullable(),
  role_label: z.string().max(100).optional().nullable(),
});

export async function createContact(
  input: z.infer<typeof CreateContactSchema>
): Promise<{ id: string } | { error: string }> {
  const parsed = CreateContactSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data, error } = await supabase
    .from("workspace_contacts")
    .insert({
      workspace_id: parsed.data.workspace_id,
      name: parsed.data.name,
      email: parsed.data.email ?? null,
      role_label: parsed.data.role_label ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { id: (data as { id: string }).id };
}

export async function deleteContact(
  contactId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("workspace_contacts")
    .delete()
    .eq("id", contactId);

  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { success: true };
}
