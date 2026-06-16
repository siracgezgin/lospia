"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const CreateContactSchema = z.object({
  workspace_id: z.string().uuid(),
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
    .insert(parsed.data)
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
