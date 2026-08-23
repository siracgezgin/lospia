"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage } from "@/lib/utils/supabase-errors";

// Sezon — Ürün ekranlarının bağlamı (Zedonk `SS 21 - WW` deseni).
// Okuma tüm üyelere açık, yazma yalnız yönetici (RLS 20240309 ile aynı model).

const AUTH_REQUIRED = "Kimlik doğrulama gerekli.";
const ADMIN_ONLY = "Sezonları yalnız yöneticiler düzenleyebilir.";
const NOT_FOUND = "Sezon bulunamadı.";

const nn = (v?: string | null) => {
  const t = (v ?? "").trim();
  return t.length ? t : null;
};

const SeasonSchema = z.object({
  name: z.string().min(1, "Sezon adı gerekli.").max(120),
  starts_on: z.string().optional().nullable(),
  ends_on: z.string().optional().nullable(),
  is_current: z.boolean().default(false),
});
export type SeasonInput = z.infer<typeof SeasonSchema>;

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

const isAdmin = (r: AppRole) => r === "owner" || r === "admin";

function revalidateAll() {
  revalidatePath("/collection");
  revalidatePath("/collection/maliyet");
  revalidatePath("/collection/odeme");
  revalidatePath("/settings");
}

/**
 * Aktif sezon tektir (kısmi benzersiz indeks). Yeni bir sezon aktif yapılırken
 * eskisi ÖNCE düşürülür — yoksa indeks ihlali kullanıcıya ham hata olarak döner.
 */
async function clearCurrent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  exceptId?: string,
) {
  const q = supabase
    .from("workspace_seasons")
    .update({ is_current: false })
    .eq("workspace_id", workspaceId)
    .eq("is_current", true);
  if (exceptId) q.neq("id", exceptId);
  await q;
}

export async function createSeason(
  input: SeasonInput,
): Promise<{ id: string } | { error: string }> {
  const parsed = SeasonSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdmin(ctx.role)) return { error: ADMIN_ONLY };

  const v = parsed.data;
  if (v.is_current) await clearCurrent(supabase, ctx.workspaceId);

  const { data, error } = await supabase
    .from("workspace_seasons")
    .insert({
      workspace_id: ctx.workspaceId,
      name: v.name.trim(),
      starts_on: nn(v.starts_on),
      ends_on: nn(v.ends_on),
      is_current: v.is_current,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "Bu adda bir sezon zaten var (büyük/küçük harf farkı aynı sayılır)." };
    return { error: toActionErrorMessage(error) };
  }
  revalidateAll();
  return { id: (data as { id: string }).id };
}

export async function updateSeason(
  id: string,
  input: SeasonInput,
): Promise<{ ok: true } | { error: string }> {
  const parsed = SeasonSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdmin(ctx.role)) return { error: ADMIN_ONLY };

  const v = parsed.data;
  if (v.is_current) await clearCurrent(supabase, ctx.workspaceId, id);

  const { error, count } = await supabase
    .from("workspace_seasons")
    .update(
      {
        name: v.name.trim(),
        starts_on: nn(v.starts_on),
        ends_on: nn(v.ends_on),
        is_current: v.is_current,
        updated_by: ctx.userId,
      },
      { count: "exact" },
    )
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId);
  if (error) {
    if (error.code === "23505") return { error: "Bu adda bir sezon zaten var (büyük/küçük harf farkı aynı sayılır)." };
    return { error: toActionErrorMessage(error) };
  }
  if (count === 0) return { error: NOT_FOUND };
  revalidateAll();
  return { ok: true };
}

/** Föye bağlı sezon silinmez — geçmiş koleksiyon kopmasın. */
export async function deleteSeason(id: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdmin(ctx.role)) return { error: ADMIN_ONLY };

  const { count } = await supabase
    .from("production_sheets")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", ctx.workspaceId)
    .eq("season_id", id);
  if ((count ?? 0) > 0) {
    return { error: `Bu sezona bağlı ${count} föy var. Sezon silinemez — geçmiş koleksiyon kopar.` };
  }

  const { error } = await supabase
    .from("workspace_seasons")
    .delete()
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };
  revalidateAll();
  return { ok: true };
}
