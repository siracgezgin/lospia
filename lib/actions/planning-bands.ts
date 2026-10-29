"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { PLANNING_BANDS } from "@/lib/planning/bands";
import { normalizeSlot } from "@/lib/planning/timezones";
import { toActionErrorMessage } from "@/lib/utils/supabase-errors";
import { addDaysISO } from "@/lib/utils/today";

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

/**
 * GÜN BAŞLIĞINI SONRAKİ HAFTALARA DA UYGULA.
 *
 * Nisa Hanım (29.10.2026): "Takvimde bir haftada başlıklarda değişiklik
 * yaptığımız zaman tümüne nasıl entegre edebiliriz, manuel şekilde düzeltmek
 * yerine?"
 *
 * Başlık hücresi yalnız O GÜNÜN toplantısını yeniden adlandırıyordu. Yeni
 * haftalar ise şeridin `columns` listesinden kuruluyor ve o liste ekrandan
 * hiç değişmiyordu — "Ready to Wear" bir kez "AF Team" yapılsa da her yeni
 * hafta eski adla açılıyor, her hafta elle düzeltiliyordu.
 *
 * Bu eylem üç şeyi birden yapar:
 *   1. Şeridin o güne ait başlığını değiştirir → henüz açılmamış haftalar
 *      yeni adla kurulur (ensureWeekScaffold).
 *   2. SONRAKİ haftalarda aynı gün + aynı saatte ESKİ adı taşıyan toplantıları
 *      yeni ada çevirir. Başka bir ad verilmiş hücreye dokunulmaz — biri o
 *      haftayı bilerek farklı adlandırdıysa o karar korunur.
 *   3. Eski başlık BOŞTU (o gün o saatte toplantı yoktu) → zaten açılmış
 *      sonraki haftalarda o hücreye aynı başlıkla toplantı açar.
 *
 * GEÇMİŞE DOKUNULMAZ: yalnız verilen günden SONRASI. Takvim bir arşivdir
 * (Aslı Hanım, 2026-09-07: "hangi tarihte hangi toplantıyı yaptığımız kalsın").
 */
const ForwardSchema = z.object({
  meeting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Geçersiz tarih"),
  time_slot: z.string().min(1).max(10),
  oldTitle: z.string().max(300),
  newTitle: z.string().trim().min(1, "Başlık boş olamaz.").max(300),
});

/** "2026-10-27" → 0 = Pazartesi … 6 = Pazar (şeridin `columns` sırası). */
function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export async function applyColumnTitleForward(
  input: z.input<typeof ForwardSchema>,
): Promise<{ ok: true; renamed: number; created: number } | { error: string }> {
  const parsed = ForwardSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { meeting_date, newTitle } = parsed.data;
  const slot = normalizeSlot(parsed.data.time_slot);
  const oldTitle = parsed.data.oldTitle.trim();

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdmin(ctx.role)) return { error: ADMIN_ONLY };

  const seeded = await ensureBands(supabase, ctx.workspaceId, ctx.userId);
  if (seeded.error) return { error: seeded.error };

  const weekday = weekdayOf(meeting_date);

  // 1) Şeridin o günkü başlığı. Şeridi olmayan "ek saat" için bu adım yok.
  const { data: bandRow, error: bandErr } = await supabase
    .from("planning_bands")
    .select("id, columns, category")
    .eq("workspace_id", ctx.workspaceId)
    .eq("slot", slot)
    .limit(1)
    .maybeSingle();
  if (bandErr) return { error: toActionErrorMessage(bandErr) };
  const band = bandRow as { id: string; columns: string[] | null; category: string } | null;
  if (band) {
    const columns = Array.from({ length: 7 }, (_, i) => band.columns?.[i] ?? "");
    columns[weekday] = newTitle;
    const { error } = await supabase
      .from("planning_bands")
      .update({ columns, updated_by: ctx.userId, updated_at: new Date().toISOString() })
      .eq("id", band.id)
      .eq("workspace_id", ctx.workspaceId);
    if (error) return { error: toActionErrorMessage(error) };
  }

  // 2–3) Zaten açılmış SONRAKİ haftalar.
  const { data: future, error: futErr } = await supabase
    .from("planning_meetings")
    .select("id, meeting_date, time_slot, title")
    .eq("workspace_id", ctx.workspaceId)
    .gt("meeting_date", meeting_date)
    .limit(5000);
  if (futErr) return { error: toActionErrorMessage(futErr) };
  const rows = (future ?? []) as { id: string; meeting_date: string; time_slot: string; title: string | null }[];
  const sameCell = (r: (typeof rows)[number]) =>
    normalizeSlot(r.time_slot) === slot && weekdayOf(r.meeting_date) === weekday;

  let renamed = 0;
  let created = 0;
  if (oldTitle) {
    const ids = rows.filter((r) => sameCell(r) && (r.title ?? "").trim() === oldTitle).map((r) => r.id);
    if (ids.length) {
      const { error } = await supabase
        .from("planning_meetings")
        .update({ title: newTitle, updated_by: ctx.userId })
        .eq("workspace_id", ctx.workspaceId)
        .in("id", ids);
      if (error) return { error: toActionErrorMessage(error) };
      renamed = ids.length;
    }
  } else {
    /* Hücre boştu: açılmış her sonraki haftada o güne toplantı aç. "Açılmış
       hafta" = içinde en az bir toplantı olan hafta; boş haftayı zaten
       iskelet (artık yeni başlıkla) kuracak. */
    const weekStarts = new Set(rows.map((r) => addDaysISO(r.meeting_date, -weekdayOf(r.meeting_date))));
    const taken = new Set(rows.filter(sameCell).map((r) => r.meeting_date));
    const inserts = [...weekStarts]
      .map((ws) => addDaysISO(ws, weekday))
      .filter((d) => d > meeting_date && !taken.has(d))
      .map((d) => ({
        workspace_id: ctx.workspaceId,
        meeting_date: d,
        time_slot: slot,
        category: band?.category ?? "other",
        title: newTitle,
        content: null,
        participant_ids: [] as string[],
        collaborator_ids: [] as string[],
        position: weekday,
        created_by: ctx.userId,
        updated_by: ctx.userId,
      }));
    if (inserts.length) {
      const { error } = await supabase.from("planning_meetings").insert(inserts);
      if (error) return { error: toActionErrorMessage(error) };
      created = inserts.length;
    }
  }

  revalidate();
  return { ok: true, renamed, created };
}
