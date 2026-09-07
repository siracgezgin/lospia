"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage, isMissingSchemaError } from "@/lib/utils/supabase-errors";

/**
 * AYLIK KİŞİ HEDEFLERİ (20240340).
 *
 * Aslı Hanım (2026-09-07): "Her insanın o bir ay içindeki hedefi, ikinci
 * aydaki hedefi, üçüncü aydaki hedefi… Oraya onu ben yazdığım zaman her gün
 * herkesin saati de çıkacak, sorumluluğu da çıkacak. BEN ARAYA İŞ
 * SOKMAYACAĞIM."
 *
 * İzin: yönetici herkesin hedefini yazar; üye KENDİ hedefini yazar (AF'nin
 * Sıraç'tan istediği "önündeki üç ayı bana hazırla" işi). Kural hem burada hem
 * RLS'te — savunma iki katmanlı.
 */

const AUTH_REQUIRED = "Kimlik doğrulama gerekli.";
const NOT_ALLOWED = "Yalnız kendi hedefinizi düzenleyebilirsiniz.";
const NOT_FOUND = "Hedef bulunamadı.";
const SETUP_PENDING = "Hedefler için veritabanı güncellemesi bekleniyor (20240340).";

const isAdminRole = (r: AppRole) => r === "owner" || r === "admin";
const MONTH_RE = /^\d{4}-\d{2}-01$/;

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

/** Yönetici herkesinkini, üye yalnız kendisininkini yazar. */
function mayWriteFor(ctx: { userId: string; role: AppRole }, memberId: string): boolean {
  return isAdminRole(ctx.role) || memberId === ctx.userId;
}

const nn = (s?: string | null) => {
  const t = (s ?? "").trim();
  return t.length ? t : null;
};

const CreateSchema = z.object({
  member_id: z.string().min(1).max(64),
  period_month: z.string().regex(MONTH_RE, "Ay, ayın ilk günü olmalı (2026-09-01)."),
  title: z.string().trim().min(1, "Hedef boş olamaz.").max(300),
  detail: z.string().max(4000).optional().nullable(),
});
export type GoalInput = z.infer<typeof CreateSchema>;

export async function createGoal(input: GoalInput): Promise<{ id: string } | { error: string }> {
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  const v = parsed.data;
  if (!mayWriteFor(ctx, v.member_id)) return { error: NOT_ALLOWED };

  /* Sıra: o kişinin o ayındaki son hedefin ardına. Tek sorgu; yarışta iki
     hedef aynı sırayı alsa bile liste bozulmaz (ikincil sıralama created_at). */
  const { data: last } = await supabase
    .from("workspace_goals")
    .select("position")
    .eq("workspace_id", ctx.workspaceId)
    .eq("member_id", v.member_id)
    .eq("period_month", v.period_month)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((last as { position: number } | null)?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("workspace_goals")
    .insert({
      workspace_id: ctx.workspaceId,
      member_id: v.member_id,
      period_month: v.period_month,
      title: v.title.trim(),
      detail: nn(v.detail),
      position,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) {
    if (isMissingSchemaError(error)) return { error: SETUP_PENDING };
    return { error: toActionErrorMessage(error) };
  }
  revalidatePath("/goals");
  return { id: (data as { id: string }).id };
}

const UpdateSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  detail: z.string().max(4000).optional().nullable(),
  status: z.enum(["open", "done", "dropped"]).optional(),
  /** Hedefi başka aya taşı — "bu ay olmadı, gelecek aya". */
  period_month: z.string().regex(MONTH_RE).optional(),
});

export async function updateGoal(
  goalId: string,
  input: z.infer<typeof UpdateSchema>,
): Promise<{ ok: true } | { error: string }> {
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  /* Sahibi kim? RLS zaten koruyor ama mesaj "bulunamadı" değil "yalnız
     kendinizinkini" olsun diye açıkça okunur. */
  const { data: row, error: readErr } = await supabase
    .from("workspace_goals")
    .select("member_id")
    .eq("id", goalId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (readErr && isMissingSchemaError(readErr)) return { error: SETUP_PENDING };
  if (!row) return { error: NOT_FOUND };
  if (!mayWriteFor(ctx, (row as { member_id: string }).member_id)) return { error: NOT_ALLOWED };

  const v = parsed.data;
  const patch: Record<string, unknown> = { updated_by: ctx.userId };
  if (v.title !== undefined) patch.title = v.title.trim();
  if (v.detail !== undefined) patch.detail = nn(v.detail);
  if (v.status !== undefined) patch.status = v.status;
  if (v.period_month !== undefined) patch.period_month = v.period_month;

  const { error } = await supabase
    .from("workspace_goals")
    .update(patch)
    .eq("id", goalId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/goals");
  return { ok: true };
}

export async function deleteGoal(goalId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { data: row } = await supabase
    .from("workspace_goals")
    .select("member_id")
    .eq("id", goalId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!row) return { error: NOT_FOUND };
  if (!mayWriteFor(ctx, (row as { member_id: string }).member_id)) return { error: NOT_ALLOWED };

  const { error } = await supabase
    .from("workspace_goals")
    .delete()
    .eq("id", goalId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/goals");
  return { ok: true };
}
