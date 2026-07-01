"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";

// Kreatif Linkler — a link registry (no file storage). Phase 1: this is an
// admin-only area, so every mutation requires owner/admin. RLS on creative_assets
// is the DB-level backstop; these checks give clean Turkish errors and set
// created_by/archived_at correctly.

const PERM_DENIED = "Bu işlem için yetkiniz yok.";
const ADMIN_ROLES: AppRole[] = ["owner", "admin"];

const uuidOrNull = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  .optional()
  .nullable()
  .or(z.literal(""));

const AssetSchema = z.object({
  title: z.string().min(1, "Başlık gerekli").max(300),
  url: z.string().url("Geçerli bir bağlantı girin").max(2000),
  provider: z.enum(["canva", "google_drive", "dropbox", "figma", "website", "other"]),
  status: z.enum(["draft", "in_review", "approved", "archived"]),
  department_id: uuidOrNull,
  related_task_id: uuidOrNull,
  related_contact_id: uuidOrNull,
  notes: z.string().max(4000).optional().nullable(),
});

type AssetInput = z.infer<typeof AssetSchema>;

async function getCtx(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!member) return null;
  return { userId: user.id, workspaceId: member.workspace_id as string, role: member.role as AppRole };
}

function normalize(v: AssetInput) {
  const nn = (s?: string | null) => {
    const t = (s ?? "").trim();
    return t.length ? t : null;
  };
  return {
    title: v.title.trim(),
    url: v.url.trim(),
    provider: v.provider,
    status: v.status,
    department_id: nn(v.department_id),
    related_task_id: nn(v.related_task_id),
    related_contact_id: nn(v.related_contact_id),
    notes: nn(v.notes),
  };
}

export async function createCreativeAsset(
  input: AssetInput,
): Promise<{ id: string } | { error: string }> {
  const parsed = AssetSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: "Kimlik doğrulama gerekli." };
  if (!ADMIN_ROLES.includes(ctx.role)) return { error: PERM_DENIED };

  const data = normalize(parsed.data);
  const { data: row, error } = await supabase
    .from("creative_assets")
    .insert({
      workspace_id: ctx.workspaceId,
      created_by: ctx.userId,
      archived_at: data.status === "archived" ? new Date().toISOString() : null,
      ...data,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/creative");
  return { id: (row as { id: string }).id };
}

// Phase 1: creative links are an admin-only area. All mutations require
// owner/admin — a member/viewer gets a permission error even if they call the
// action directly (RLS is the DB-level backstop).
function canMutate(ctx: NonNullable<Awaited<ReturnType<typeof getCtx>>>): boolean {
  return ADMIN_ROLES.includes(ctx.role);
}

export async function updateCreativeAsset(
  assetId: string,
  input: AssetInput,
): Promise<{ ok: true } | { error: string }> {
  const parsed = AssetSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: "Kimlik doğrulama gerekli." };
  if (!canMutate(ctx)) return { error: PERM_DENIED };

  const data = normalize(parsed.data);
  const { error } = await supabase
    .from("creative_assets")
    .update({
      ...data,
      archived_at: data.status === "archived" ? new Date().toISOString() : null,
    })
    .eq("id", assetId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: error.message };
  revalidatePath("/creative");
  return { ok: true };
}

// Prefer archive over hard delete — non-destructive.
export async function archiveCreativeAsset(
  assetId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: "Kimlik doğrulama gerekli." };
  if (!canMutate(ctx)) return { error: PERM_DENIED };

  const { error } = await supabase
    .from("creative_assets")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", assetId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: error.message };
  revalidatePath("/creative");
  return { ok: true };
}

export async function deleteCreativeAsset(
  assetId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: "Kimlik doğrulama gerekli." };
  if (!canMutate(ctx)) return { error: PERM_DENIED };

  const { error } = await supabase
    .from("creative_assets")
    .delete()
    .eq("id", assetId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: error.message };
  revalidatePath("/creative");
  return { ok: true };
}
