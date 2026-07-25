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
  id: z.string().max(64).optional().nullable(),   // mevcut konu (upsert için)
  position: z.number().int().min(0).max(50),
  text: z.string().max(2000).optional().nullable(),
  participant_ids: memberIds,
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
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
 * Bir toplantının konularını kaydeder — UPSERT (id'ye göre): mevcut konular
 * güncellenir (task_id + due_date korunur), yeniler eklenir, kaldırılanlar
 * silinir. Dönüşte pozisyon→id eşlemesi (edit sonrası "Ata & bildir" için).
 */
export async function saveMeetingTopics(
  meetingId: string,
  topics: z.infer<typeof TopicSchema>[],
): Promise<{ ok: true; topics: { position: number; id: string }[] } | { error: string }> {
  const parsed = z.array(TopicSchema).max(20).safeParse(topics);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { data: meeting } = await supabase
    .from("planning_meetings")
    .select("id")
    .eq("id", meetingId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!meeting) return { error: NOT_FOUND };

  // Boş olmayan konular (metin veya kişi var).
  const kept = parsed.data.filter((t) => nn(t.text) || (t.participant_ids?.length ?? 0) > 0);
  const keepIds = kept.map((t) => t.id).filter((id): id is string => !!id);

  // Bu toplantıda tutulmayan mevcut konuları sil.
  const delQ = supabase.from("planning_topics").delete().eq("meeting_id", meetingId);
  const del = keepIds.length
    ? await delQ.not("id", "in", `(${keepIds.join(",")})`)
    : await delQ;
  if (del.error) return { error: toActionErrorMessage(del.error) };

  const out: { position: number; id: string }[] = [];
  for (const t of kept) {
    const payload = {
      meeting_id: meetingId,
      workspace_id: ctx.workspaceId,
      position: t.position,
      text: nn(t.text),
      participant_ids: t.participant_ids ?? [],
      due_date: t.due_date ?? null,
    };
    if (t.id) {
      const upd = await supabase
        .from("planning_topics")
        .update(payload)
        .eq("id", t.id)
        .eq("meeting_id", meetingId)
        .select("id")
        .single();
      if (upd.error) return { error: toActionErrorMessage(upd.error) };
      out.push({ position: t.position, id: (upd.data as { id: string }).id });
    } else {
      const ins = await supabase
        .from("planning_topics")
        .insert({ ...payload, created_by: ctx.userId })
        .select("id")
        .single();
      if (ins.error) return { error: toActionErrorMessage(ins.error) };
      out.push({ position: t.position, id: (ins.data as { id: string }).id });
    }
  }
  revalidatePath("/planning");
  return { ok: true, topics: out };
}

/**
 * Bir Konu'yu gerçek göreve dönüştürür ve atananları bildirir (task-assigned
 * maili mevcut altyapıdan gider). Zaten bir görev bağlıysa onu günceller.
 */
export async function assignTopicAsTask(
  topicId: string,
  input: { dueDate?: string | null },
): Promise<{ ok: true; taskId: string } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { data: topic } = await supabase
    .from("planning_topics")
    .select("id, text, participant_ids, task_id, meeting_id, workspace_id")
    .eq("id", topicId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!topic) return { error: "Konu bulunamadı." };

  const assignees = ((topic.participant_ids as string[]) ?? []).filter(Boolean);
  if (assignees.length === 0) return { error: "Önce konuya en az bir kişi seçin." };

  // Başlık: konu metni; yoksa toplantı başlığı.
  const { data: meeting } = await supabase
    .from("planning_meetings")
    .select("title, category")
    .eq("id", topic.meeting_id)
    .maybeSingle();
  const title = (nn(topic.text as string) || nn(meeting?.title as string) || "Planlama görevi")!;
  const dueDate = (input.dueDate ?? "").match(/^\d{4}-\d{2}-\d{2}$/) ? input.dueDate! : null;
  const today = new Date().toISOString().slice(0, 10);

  let taskId = topic.task_id as string | null;
  if (taskId) {
    // Var olan görevi güncelle (var mı diye de kontrol).
    const { data: existing } = await supabase.from("tasks").select("id").eq("id", taskId).maybeSingle();
    if (existing) {
      const upd = await supabase
        .from("tasks")
        .update({ title, assignee_id: assignees[0], due_date: dueDate })
        .eq("id", taskId);
      if (upd.error) return { error: toActionErrorMessage(upd.error) };
    } else {
      taskId = null;
    }
  }
  if (!taskId) {
    const ins = await supabase
      .from("tasks")
      .insert({
        workspace_id: ctx.workspaceId,
        title,
        assignee_id: assignees[0],
        due_date: dueDate,
        start_date: today,
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (ins.error) return { error: toActionErrorMessage(ins.error) };
    taskId = (ins.data as { id: string }).id;
  }

  // Konuyu göreve bağla + due_date'i sakla.
  await supabase
    .from("planning_topics")
    .update({ task_id: taskId, due_date: dueDate })
    .eq("id", topicId);

  // Bildirim + mail (task_assigned e-posta üretir; actor hariç). Atananların
  // hepsine gönder — dedupe RPC tekrarı önler.
  const { notifyTaskEvent } = await import("@/lib/notifications/notify");
  await notifyTaskEvent(supabase, {
    workspaceId: ctx.workspaceId,
    taskId,
    event: "task_assigned",
    taskTitle: title,
    recipientUserIds: assignees,
    actorId: ctx.userId,
  });

  revalidatePath("/planning");
  revalidatePath("/board");
  revalidatePath("/list");
  return { ok: true, taskId };
}
