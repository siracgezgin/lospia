"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage, isMissingSchemaError } from "@/lib/utils/supabase-errors";
import { findOrCreateMeeting } from "@/lib/planning/meeting-slot";
import { normalizeSlot } from "@/lib/planning/timezones";

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


/**
 * HEDEFİ TAKVİME BAĞLAR — hedef de bir toplantı konusu olur.
 *
 * Sıraç (2026-09-10): "Kişilerin hedefleri olacak ya, onlar da aslında hepsi
 * AYNI MANTIK; sadece toplantı konusuna dahil etmek için gün vs girilecek…
 * artık her şey aynı sistem üzerinden yürüyecek."
 *
 * Hedef bir AY hedefidir (kişi × ay); takvim ise gün ve saat konuşur. İkisini
 * birleştiren şey konu satırıdır: hedefe bir gün+saat verildiğinde o günün
 * toplantısının altına konu olarak düşer ve toplantıda konuşulacak şey hâline
 * gelir. Hedefin kendisi Goals'ta kalır — kopyalanmaz, taşınmaz.
 *
 * Toplantı yoksa açılır (findOrCreateMeeting; görev akışıyla AYNI yardımcı).
 */
export async function addGoalToCalendar(
  goalId: string,
  input: { meeting_date: string; time_slot: string },
): Promise<{ ok: true } | { error: string }> {
  const parsed = z
    .object({
      meeting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Geçersiz tarih"),
      time_slot: z.string().regex(/^\d{1,2}:\d{2}$/, "Geçersiz saat"),
    })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { data: row } = await supabase
    .from("workspace_goals")
    .select("member_id, title")
    .eq("id", goalId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!row) return { error: NOT_FOUND };
  const goal = row as { member_id: string; title: string };
  if (!mayWriteFor(ctx, goal.member_id)) return { error: NOT_ALLOWED };

  /* Takvime YAZMAK yönetici işidir (planlama admin-only, RLS de öyle). Üye
     kendi hedefini yazabilir ama takvime koyamaz — duvara çarpmak yerine
     nedenini söylüyoruz. */
  if (!isAdminRole(ctx.role)) {
    return { error: "Hedefi takvime yalnız yöneticiler ekleyebilir." };
  }

  const slot = normalizeSlot(parsed.data.time_slot);
  const meeting = await findOrCreateMeeting(supabase, ctx, parsed.data.meeting_date, slot);
  if ("error" in meeting) return { error: meeting.error };

  // Konu toplantının SONUNA eklenir.
  const { data: last } = await supabase
    .from("planning_topics")
    .select("position")
    .eq("meeting_id", meeting.id)
    .eq("workspace_id", ctx.workspaceId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = Math.min(50, ((last as { position: number } | null)?.position ?? -1) + 1);

  const { error } = await supabase.from("planning_topics").insert({
    meeting_id: meeting.id,
    workspace_id: ctx.workspaceId,
    position,
    text: goal.title,
    // Hedefin sahibi konunun da sorumlusudur.
    participant_ids: [goal.member_id],
    collaborator_ids: [],
    due_date: parsed.data.meeting_date,
    created_by: ctx.userId,
  });
  if (error) return { error: toActionErrorMessage(error) };

  revalidatePath("/planning");
  revalidatePath("/goals");
  return { ok: true };
}
