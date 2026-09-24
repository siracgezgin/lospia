"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { PLANNING_BANDS } from "@/lib/planning/bands";
import { normalizeSlot } from "@/lib/planning/timezones";
import { toActionErrorMessage } from "@/lib/utils/supabase-errors";

/**
 * Takvimin sol sütunu — şerit adı, saat, konu satır sayısı (20240326).
 *
 * Aslı Hanım (2026-08-28): "Buraya neden müdahale edemiyorum?"
 *
 * Şeritler kodda sabitti. Artık veritabanında yaşıyorlar; tablo BOŞSA kod
 * varsayılanları geçerli. İlk düzenlemede tüm şeritler bir kez tabloya
 * yazılır (`ensureBands`) — böylece varsayılanlar kaybolmaz ve düzenlenen
 * şerit dışındakiler yerinde kalır.
 *
 * Yazma yalnız yönetici — hem burada hem RLS'te.
 */

const AUTH_REQUIRED = "Kimlik doğrulama gerekli.";
const ADMIN_ONLY = "Takvim şeritlerini yalnız yöneticiler düzenleyebilir.";
const NOT_FOUND = "Şerit bulunamadı.";

const CATEGORIES = [
  "uretim", "ai", "sales", "marketing", "finance", "external", "system", "tasarim", "other",
] as const;

const BandSchema = z.object({
  label: z.string().max(60).default(""),
  slot: z.string().regex(/^\d{1,2}:\d{2}$/, "Saat SS:DD biçiminde olmalı."),
  category: z.enum(CATEGORIES).default("uretim"),
  /** Aslı Hanım'ın sınırı bir toplantıda en çok 5 konuydu; elle 10'a kadar. */
  topicRows: z.number().int().min(1).max(10).default(3),
});
export type BandInput = z.infer<typeof BandSchema>;

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

/**
 * Tablo boşsa kod varsayılanlarını bir kez yazar.
 *
 * Neden: kullanıcı tek bir şeridin adını değiştirdiğinde diğer üçü de
 * kaybolmamalı. "Boşsa koddan oku" davranışı ancak tablo TAMAMEN boşken
 * geçerli; ilk yazımda o kapı kapanır ve hepsi veriye döner.
 */
async function ensureBands(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  userId: string,
): Promise<{ error?: string }> {
  const { data, error } = await supabase
    .from("planning_bands")
    .select("id")
    .eq("workspace_id", workspaceId)
    .limit(1);
  if (error) return { error: toActionErrorMessage(error) };
  if (data && data.length > 0) return {};

  const rows = PLANNING_BANDS.map((b, i) => ({
    workspace_id: workspaceId,
    position: i,
    slot: b.slot,
    category: b.category,
    label: b.label,
    topic_rows: 3,
    columns: b.columns,
    created_by: userId,
    updated_by: userId,
  }));
  const ins = await supabase.from("planning_bands").insert(rows);
  if (ins.error) return { error: toActionErrorMessage(ins.error) };
  return {};
}

function revalidate() {
  revalidatePath("/planning");
}

export async function savePlanningBand(
  bandId: string | null,
  input: BandInput,
  /* `moved`: saat değiştiyse yeni saate taşınan toplantı sayısı. Ekran bunu
     yazar — sessizce taşımak, kullanıcının haberi olmadan takvimi değiştirmek
     olurdu. */
): Promise<{ ok: true; moved?: number } | { error: string }> {
  const parsed = BandSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdmin(ctx.role)) return { error: ADMIN_ONLY };

  const seeded = await ensureBands(supabase, ctx.workspaceId, ctx.userId);
  if (seeded.error) return { error: seeded.error };

  const v = parsed.data;
  const payload = {
    label: v.label.trim(),
    slot: normalizeSlot(v.slot),
    category: v.category,
    topic_rows: v.topicRows,
    updated_by: ctx.userId,
    updated_at: new Date().toISOString(),
  };

  if (bandId) {
    /* SAATİ DEĞİŞEN ŞERİT TOPLANTILARINI DA GÖTÜRÜR.
       Şeyda Nisa Hanım (24.09.2026): "Sürükle bırak yaptığımda diğer haftalar
       değişmedi… Aslı Hanım sabah 09:00'ların şimdilik boş olmasını rica etti."

       Sürükle-bırak TEK toplantıyı taşır; istenen ise saat şeridinin kendisini
       ileriye dönük kaydırmak. Şerit zaten çalışma alanı düzeyinde ve saati
       değiştirilebiliyordu — ama toplantılar `time_slot` ile eşlendiği için
       şerit 10:00'a alınınca 09:00'daki kayıtlar şeridin DIŞINDA kalıyor,
       başlıksız bir "ek saat" bloğuna düşüyordu. Ekranda hiçbir şey
       değişmemiş gibi görünmesinin sebebi buydu.

       GEÇMİŞE DOKUNULMAZ: yalnız BUGÜN ve sonrası taşınır. Geçen haftaların
       kaydı toplantının gerçekte kaçta yapıldığını söyler; onu geriye dönük
       düzeltmek tutanağı değiştirmek olurdu. */
    const { data: before } = await supabase
      .from("planning_bands")
      .select("slot")
      .eq("id", bandId)
      .eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    const oldSlot = (before as { slot: string } | null)?.slot ?? null;

    const { error, count } = await supabase
      .from("planning_bands")
      .update(payload, { count: "exact" })
      .eq("id", bandId)
      .eq("workspace_id", ctx.workspaceId);
    if (error) return { error: toActionErrorMessage(error) };
    if (count === 0) return { error: NOT_FOUND };

    let moved = 0;
    if (oldSlot && oldSlot !== payload.slot) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: movedRows, error: moveErr } = await supabase
        .from("planning_meetings")
        .update({ time_slot: payload.slot, updated_by: ctx.userId })
        .eq("workspace_id", ctx.workspaceId)
        .eq("time_slot", oldSlot)
        .gte("meeting_date", today)
        .select("id");
      /* Taşıma başarısız olursa şeridin saati yine de değişmiş olur; bunu
         SESSİZ geçmek, kullanıcıya "oldu" deyip toplantıları geride bırakmak
         olurdu. Sayı geri dönüyor, ekran ne olduğunu yazıyor. */
      if (moveErr) return { error: toActionErrorMessage(moveErr) };
      moved = (movedRows ?? []).length;
    }

    revalidate();
    return { ok: true, moved };
  }

  // Yeni şerit en sona.
  const { data: last } = await supabase
    .from("planning_bands")
    .select("position")
    .eq("workspace_id", ctx.workspaceId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((last as { position: number } | null)?.position ?? -1) + 1;

  const { error } = await supabase.from("planning_bands").insert({
    workspace_id: ctx.workspaceId,
    position,
    columns: [],
    created_by: ctx.userId,
    ...payload,
  });
  if (error) return { error: toActionErrorMessage(error) };
  revalidate();
  return { ok: true };
}

/**
 * Şeridi kaldırır. TOPLANTILAR SİLİNMEZ — o saatteki kayıtlar ızgarada
 * "Ek saat" bloğu olarak görünmeye devam eder. Şerit bir görünüm iskeletidir;
 * silinmesi kimsenin girdiği veriyi götürmemeli.
 */
export async function deletePlanningBand(
  bandId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdmin(ctx.role)) return { error: ADMIN_ONLY };

  const seeded = await ensureBands(supabase, ctx.workspaceId, ctx.userId);
  if (seeded.error) return { error: seeded.error };

  const { error } = await supabase
    .from("planning_bands")
    .delete()
    .eq("id", bandId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };
  revalidate();
  return { ok: true };
}
