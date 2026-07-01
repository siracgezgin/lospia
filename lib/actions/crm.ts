"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { canManageContacts, type AppRole } from "@/lib/auth/permissions";

// CRM v0 builds on the existing workspace_contacts table (used for task
// responsible/contact mapping). These actions only touch the additive columns
// from 20240204000000_crm_contact_fields.sql — the base contact behaviour is
// untouched. Writes stay owner/admin-only, consistent with canManageContacts.

const hexUuid = (msg: string) =>
  z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, msg);

const PERM_DENIED = "Bu işlem için yetkiniz yok.";
const dateOrNull = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Geçersiz tarih")
  .optional()
  .nullable();

const nullableText = (max: number) => z.string().max(max).optional().nullable();

const CrmFieldsSchema = z.object({
  name: z.string().min(1, "İsim gerekli").max(200),
  organization: nullableText(200),
  segment: nullableText(40),
  crm_status: nullableText(40),
  source_channel: nullableText(60),
  email: z.string().email("Geçersiz e-posta").optional().nullable().or(z.literal("")),
  phone: nullableText(60),
  role_label: nullableText(100),
  notes: nullableText(4000),
  last_contact_at: dateOrNull,
  next_follow_up_at: dateOrNull,
  owner_id: hexUuid("Geçersiz sorumlu").optional().nullable().or(z.literal("")),
});

type CrmFields = z.infer<typeof CrmFieldsSchema>;

async function requireContactAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ workspaceId: string } | { error: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Kimlik doğrulama gerekli." };
  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!member) return { error: "Çalışma alanı bulunamadı." };
  if (!canManageContacts(member.role as AppRole)) return { error: PERM_DENIED };
  return { workspaceId: member.workspace_id as string };
}

// Normalise empty strings → null so we never store "".
function clean(v: CrmFields) {
  const nn = (s?: string | null) => {
    const t = (s ?? "").trim();
    return t.length ? t : null;
  };
  return {
    name: v.name.trim(),
    organization: nn(v.organization),
    segment: nn(v.segment),
    crm_status: nn(v.crm_status),
    source_channel: nn(v.source_channel),
    email: nn(v.email),
    phone: nn(v.phone),
    role_label: nn(v.role_label),
    notes: nn(v.notes),
    last_contact_at: nn(v.last_contact_at),
    next_follow_up_at: nn(v.next_follow_up_at),
    owner_id: nn(v.owner_id),
  };
}

export async function createCrmContact(
  input: CrmFields,
): Promise<{ id: string } | { error: string }> {
  const parsed = CrmFieldsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await requireContactAdmin(supabase);
  if ("error" in ctx) return { error: ctx.error };

  const { data, error } = await supabase
    .from("workspace_contacts")
    .insert({ workspace_id: ctx.workspaceId, ...clean(parsed.data) })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/crm");
  revalidatePath("/settings");
  return { id: (data as { id: string }).id };
}

export async function updateCrmContact(
  contactId: string,
  input: CrmFields,
): Promise<{ ok: true } | { error: string }> {
  const parsed = CrmFieldsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await requireContactAdmin(supabase);
  if ("error" in ctx) return { error: ctx.error };

  const { error } = await supabase
    .from("workspace_contacts")
    .update(clean(parsed.data))
    .eq("id", contactId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: error.message };
  revalidatePath("/crm");
  revalidatePath("/settings");
  return { ok: true };
}

// ── Contact ↔ system user link (manual, admin-only) ───────────────────────────
// Confirms that a CRM contact IS a given team member. Never auto-applied — an
// admin sets/clears it from the "Kişi eşleştirme" panel. Once linked, the task
// deep-link matcher also treats the member's assignee tasks as this contact's.

export async function linkContactToUser(
  contactId: string,
  userId: string,
): Promise<{ ok: true } | { error: string }> {
  if (!contactId || !userId) return { error: "Eksik bilgi." };

  const supabase = await createClient();
  const ctx = await requireContactAdmin(supabase);
  if ("error" in ctx) return { error: ctx.error };

  // The target user must be a member of this workspace.
  const { data: member } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", ctx.workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) return { error: "Seçilen kişi bu çalışma alanının üyesi değil." };

  const { error } = await supabase
    .from("workspace_contacts")
    .update({ user_id: userId })
    .eq("id", contactId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) {
    if (error.code === "23505") return { error: "Bu sistem hesabı başka bir kişiyle zaten eşleşmiş." };
    return { error: error.message };
  }
  revalidatePath("/crm");
  revalidatePath("/settings");
  return { ok: true };
}

export async function unlinkContactUser(
  contactId: string,
): Promise<{ ok: true } | { error: string }> {
  if (!contactId) return { error: "Eksik bilgi." };

  const supabase = await createClient();
  const ctx = await requireContactAdmin(supabase);
  if ("error" in ctx) return { error: ctx.error };

  const { error } = await supabase
    .from("workspace_contacts")
    .update({ user_id: null })
    .eq("id", contactId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: error.message };
  revalidatePath("/crm");
  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteCrmContact(
  contactId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await requireContactAdmin(supabase);
  if ("error" in ctx) return { error: ctx.error };

  const { error } = await supabase
    .from("workspace_contacts")
    .delete()
    .eq("id", contactId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: error.message };
  revalidatePath("/crm");
  revalidatePath("/settings");
  return { ok: true };
}
