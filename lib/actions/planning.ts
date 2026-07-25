"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage } from "@/lib/utils/supabase-errors";

// Planlama — Haftalık Toplantı Takvimi. Toplantı (renkli kutu) + altında Konu'lar.
// Tüm üyeler okur/yazar (office-center RLS). "Kim" serbest metin.

const AUTH_REQUIRED = "Kimlik doğrulama gerekli.";
const NOT_FOUND = "Toplantı bulunamadı.";

const CATEGORIES = ["uretim", "ai", "sales", "marketing", "finance", "external", "system", "other"] as const;

const memberIds = z.array(z.string().max(64)).max(50).default([]);

const MeetingSchema = z.object({
  meeting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Geçersiz tarih"),
  time_slot: z.string().min(1).max(10).default("09:00"),
  category: z.enum(CATEGORIES).default("uretim"),
  title: z.string().max(300).optional().nullable(),
  content: z.string().max(4000).optional().nullable(),
  participant_ids: memberIds,
});
export type MeetingInput = z.infer<typeof MeetingSchema>;

const TopicSchema = z.object({
  position: z.number().int().min(0).max(50),
  text: z.string().max(2000).optional().nullable(),
  participant_ids: memberIds,
});

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

const nn = (s?: string | null) => {
  const t = (s ?? "").trim();
  return t.length ? t : null;
};

export async function createMeeting(
  input: MeetingInput,
): Promise<{ id: string } | { error: string }> {
  const parsed = MeetingSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const v = parsed.data;
  const { data, error } = await supabase
    .from("planning_meetings")
    .insert({
      workspace_id: ctx.workspaceId,
      meeting_date: v.meeting_date,
      time_slot: v.time_slot,
      category: v.category,
      title: nn(v.title),
      content: nn(v.content),
      participant_ids: v.participant_ids,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/planning");
  return { id: (data as { id: string }).id };
}

export async function updateMeeting(
  meetingId: string,
  input: MeetingInput,
): Promise<{ ok: true } | { error: string }> {
  const parsed = MeetingSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const v = parsed.data;
  const { error } = await supabase
    .from("planning_meetings")
    .update({
      meeting_date: v.meeting_date,
      time_slot: v.time_slot,
      category: v.category,
      title: nn(v.title),
      content: nn(v.content),
      participant_ids: v.participant_ids,
      updated_by: ctx.userId,
    })
    .eq("id", meetingId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/planning");
  return { ok: true };
}

export async function deleteMeeting(
  meetingId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  const { error } = await supabase
    .from("planning_meetings")
    .delete()
    .eq("id", meetingId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/planning");
  return { ok: true };
}

/**
 * Bir toplantının konularını (Konu 1–5) topluca kaydeder: mevcutları siler,
 * boş olmayanları yeniden ekler (basit ve tutarlı). Konu = ileride göreve
 * bağlanacak (task_id); şimdilik metin + Kim.
 */
export async function saveMeetingTopics(
  meetingId: string,
  topics: z.infer<typeof TopicSchema>[],
): Promise<{ ok: true } | { error: string }> {
  const parsed = z.array(TopicSchema).max(20).safeParse(topics);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  // Toplantının bu workspace'e ait olduğunu doğrula.
  const { data: meeting } = await supabase
    .from("planning_meetings")
    .select("id")
    .eq("id", meetingId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!meeting) return { error: NOT_FOUND };

  const rows = parsed.data
    .filter((t) => nn(t.text) || (t.participant_ids?.length ?? 0) > 0)
    .map((t, i) => ({
      meeting_id: meetingId,
      workspace_id: ctx.workspaceId,
      position: i,
      text: nn(t.text),
      participant_ids: t.participant_ids ?? [],
      created_by: ctx.userId,
    }));

  const del = await supabase.from("planning_topics").delete().eq("meeting_id", meetingId);
  if (del.error) return { error: toActionErrorMessage(del.error) };
  if (rows.length) {
    const ins = await supabase.from("planning_topics").insert(rows);
    if (ins.error) return { error: toActionErrorMessage(ins.error) };
  }
  revalidatePath("/planning");
  return { ok: true };
}
