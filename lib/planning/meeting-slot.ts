import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeSlot } from "@/lib/planning/timezones";

/**
 * BİR GÜN+SAATTEKİ TOPLANTIYI BULUR, YOKSA AÇAR.
 *
 * Bu kural dört ayrı server action'da birebir kopyalanmıştı (moveTopic,
 * setMeetingTitle, duplicateTopic, attachTaskToCalendar). Dördü de aynı şeyi
 * söylüyordu ama dördünü ayrı ayrı düzeltmek gerekiyordu; kopyalardan biri
 * unutulsa iki akış sessizce ayrışırdı.
 *
 * Kural: kullanıcıyı "önce toplantı oluştur" duvarına çarptırma. Boş bir hücreye
 * konu/görev/hedef bağlamak da bir başlangıçtır (Aslı Hanım'ın Excel beklentisi).
 *
 * KATEGORİ KOMŞUDAN MİRAS: yeni toplantı, aynı saatteki başka bir günün
 * kategorisini alır ki ızgarada şeridin rengiyle uyumlu çıksın.
 */
export async function findOrCreateMeeting(
  supabase: SupabaseClient,
  ctx: { workspaceId: string; userId: string },
  meetingDate: string,
  timeSlot: string,
): Promise<{ id: string } | { error: string }> {
  const slot = normalizeSlot(timeSlot);

  const { data: found } = await supabase
    .from("planning_meetings")
    .select("id")
    .eq("workspace_id", ctx.workspaceId)
    .eq("meeting_date", meetingDate)
    .eq("time_slot", slot)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  const existing = (found as { id: string } | null)?.id;
  if (existing) return { id: existing };

  const { data: sibling } = await supabase
    .from("planning_meetings")
    .select("category")
    .eq("workspace_id", ctx.workspaceId)
    .eq("time_slot", slot)
    .limit(1)
    .maybeSingle();

  const { data: created, error } = await supabase
    .from("planning_meetings")
    .insert({
      workspace_id: ctx.workspaceId,
      meeting_date: meetingDate,
      time_slot: slot,
      category: (sibling as { category: string } | null)?.category ?? "other",
      participant_ids: [],
      collaborator_ids: [],
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: (created as { id: string }).id };
}
