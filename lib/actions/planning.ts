"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage } from "@/lib/utils/supabase-errors";

// Planlama — Haftalık Toplantı Takvimi. Toplantı (renkli kutu) + altında Konu'lar.
// İzin modeli (2026-07-26): üyeler OKUR, yazma yalnız yönetici — hem burada
// (isAdminRole guard) hem RLS'te (20240226 migration) uygulanır.

const AUTH_REQUIRED = "Kimlik doğrulama gerekli.";
const PLANNING_ADMIN_ONLY = "Planlamayı yalnız yöneticiler düzenleyebilir.";
const NOT_FOUND = "Toplantı bulunamadı.";

const CATEGORIES = ["uretim", "ai", "sales", "marketing", "finance", "external", "system", "tasarim", "other"] as const;

const memberIds = z.array(z.string().max(64)).max(50).default([]);

const MeetingSchema = z.object({
  meeting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Geçersiz tarih"),
  time_slot: z.string().min(1).max(10).default("09:00"),
  category: z.enum(CATEGORIES).default("uretim"),
  title: z.string().max(300).optional().nullable(),
  content: z.string().max(4000).optional().nullable(),
  participant_ids: memberIds,
  // "İş birliği" — sorumlunun yanında çalışan kişiler (Aslı Hanım, 2026-08-19).
  collaborator_ids: memberIds,
});
export type MeetingInput = z.infer<typeof MeetingSchema>;

const TopicSchema = z.object({
  id: z.string().max(64).optional().nullable(),   // mevcut konu (upsert için)
  position: z.number().int().min(0).max(50),
  text: z.string().max(2000).optional().nullable(),
  participant_ids: memberIds,
  collaborator_ids: memberIds,
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
  if (!isAdminRole(ctx.role)) return { error: PLANNING_ADMIN_ONLY };

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
      collaborator_ids: v.collaborator_ids,
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
  if (!isAdminRole(ctx.role)) return { error: PLANNING_ADMIN_ONLY };

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
      collaborator_ids: v.collaborator_ids,
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
  if (!isAdminRole(ctx.role)) return { error: PLANNING_ADMIN_ONLY };
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
  if (!isAdminRole(ctx.role)) return { error: PLANNING_ADMIN_ONLY };

  const { data: meeting } = await supabase
    .from("planning_meetings")
    .select("id")
    .eq("id", meetingId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!meeting) return { error: NOT_FOUND };

  // Hangi konular tutulur:
  //   * metni olan  → her zaman,
  //   * metinsiz    → YALNIZ zaten kayıtlıysa (t.id).
  //
  // Metinsiz-ama-kayıtlı satırlar Aslı Hanım'ın Excel'inden geliyor (metin
  // hücresi boş, yalnız "Kim" dolu). Bunların ham `kim` metni düzenleyiciye
  // hiç yüklenmiyor ve yerelde üyeye de çözülmüyor; participant_ids'e bakarak
  // karar vermek onları SESSİZCE SİLİYORDU. Varlık ölçütü artık id.
  //
  // Yeni taslakta metin şart: düzenleyici her açılışta 3 boş satır üretiyor,
  // boş satırda yanlışlıkla kişi seçilip kaydedilince ızgarada yalnız bir
  // rozetten ibaret HAYALET "Konu" satırı oluşuyordu.
  //
  // Silme yolu değişmedi: çöp kutusu düğmesi satırı taslaktan çıkarır, bu
  // fonksiyon da gönderilmeyen mevcut konuları siler.
  const kept = parsed.data.filter((t) => nn(t.text) || !!t.id);
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
      collaborator_ids: t.collaborator_ids ?? [],
      due_date: t.due_date ?? null,
    };
    // Mevcut konu → güncelle. maybeSingle(): id bu toplantıya ait değilse (ör.
    // istemci eski bir taslak id'si taşıyorsa) 0 satır döner; single() burada
    // "Cannot coerce the result to a single JSON object" fırlatıyordu. Böyle
    // bir durumda satırı YENİ olarak ekleyip akışı sürdürüyoruz.
    let savedId: string | null = null;
    if (t.id) {
      const upd = await supabase
        .from("planning_topics")
        .update(payload)
        .eq("id", t.id)
        .eq("meeting_id", meetingId)
        .select("id")
        .maybeSingle();
      if (upd.error) return { error: toActionErrorMessage(upd.error) };
      savedId = (upd.data as { id: string } | null)?.id ?? null;
    }
    if (!savedId) {
      const ins = await supabase
        .from("planning_topics")
        .insert({ ...payload, created_by: ctx.userId })
        .select("id")
        .maybeSingle();
      if (ins.error) return { error: toActionErrorMessage(ins.error) };
      savedId = (ins.data as { id: string } | null)?.id ?? null;
      if (!savedId) return { error: "Konu kaydedilemedi. Sayfayı yenileyip tekrar deneyin." };
    }
    out.push({ position: t.position, id: savedId });
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
  if (!isAdminRole(ctx.role)) return { error: PLANNING_ADMIN_ONLY };

  const { data: topic } = await supabase
    .from("planning_topics")
    .select("id, text, participant_ids, collaborator_ids, task_id, meeting_id, workspace_id")
    .eq("id", topicId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!topic) return { error: "Konu bulunamadı." };

  const assignees = ((topic.participant_ids as string[]) ?? []).filter(Boolean);
  if (assignees.length === 0) return { error: "Önce konuya en az bir kişi seçin." };
  // İş birliği yapan kişiler göreve custom_fields.collaborators olarak geçer —
  // Pano'nun kişi ızgarası ve kişi filtresi bunları da o kişinin işi sayar.
  // (Kolon migrate edilmediyse alan yoktur; boş dizi olarak akar.)
  const collaborators = ((topic.collaborator_ids as string[] | null) ?? []).filter(Boolean);
  const customFields = collaborators.length ? { collaborators } : null;

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
        .update({
          title, assignee_id: assignees[0], due_date: dueDate,
          ...(customFields ? { custom_fields: customFields } : {}),
        })
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
        ...(customFields ? { custom_fields: customFields } : {}),
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

  // Konudaki HERKES görevin sorumlusu olur — ilk kişi assignee kalır, tümü
  // katılımcı modeline (task_member_completions) yazılır. user id →
  // workspace_members.id eşlenir; mevcut sorumlular korunur, eksikler eklenir.
  // Yazma, setTaskParticipants ile aynı nedenle service-role ile yapılır
  // (kısıtlı RLS başkasını ekleyen üyeyi reddeder); anahtar yoksa RLS'e düşer.
  const { data: wm } = await supabase
    .from("workspace_members")
    .select("id, user_id")
    .eq("workspace_id", ctx.workspaceId)
    .in("user_id", assignees);
  const participantMemberIds = (wm ?? []).map((m) => m.id as string);
  if (participantMemberIds.length) {
    const { data: existingComps } = await supabase
      .from("task_member_completions")
      .select("member_id")
      .eq("task_id", taskId);
    const have = new Set((existingComps ?? []).map((r) => r.member_id as string));
    const toAdd = participantMemberIds
      .filter((id) => !have.has(id))
      .map((member_id) => ({ workspace_id: ctx.workspaceId, task_id: taskId, member_id }));
    if (toAdd.length) {
      const { getAdminClient } = await import("@/lib/supabase/admin");
      const writer = getAdminClient() ?? supabase;
      const { error: partErr } = await writer.from("task_member_completions").insert(toAdd);
      if (partErr) return { error: toActionErrorMessage(partErr) };
    }
  }

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

// ═══════════════════════════════════════════════════════════════════════════
// Şablonlar — haftanın iskeleti ("her gün aynı saatte üretim" ritmi)
// ═══════════════════════════════════════════════════════════════════════════

const ADMIN_ONLY = "Bu işlem yalnız yöneticilere açık.";
const isAdminRole = (r: AppRole) => r === "owner" || r === "admin";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const TemplateSchema = z.object({
  id: z.string().max(64).optional().nullable(),
  weekday: z.number().int().min(0).max(6), // 0=Pazartesi … 6=Pazar
  time_slot: z.string().min(1).max(10).default("09:00"),
  category: z.enum(CATEGORIES).default("uretim"),
  title: z.string().max(300).optional().nullable(),
  content: z.string().max(4000).optional().nullable(),
  participant_ids: memberIds,
  active: z.boolean().default(true),
});
export type TemplateInput = z.infer<typeof TemplateSchema>;

/** Şablon ekle/güncelle (admin). */
export async function saveTemplate(
  input: TemplateInput,
): Promise<{ id: string } | { error: string }> {
  const parsed = TemplateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdminRole(ctx.role)) return { error: ADMIN_ONLY };

  const v = parsed.data;
  const payload = {
    weekday: v.weekday,
    time_slot: v.time_slot,
    category: v.category,
    title: nn(v.title),
    content: nn(v.content),
    participant_ids: v.participant_ids,
    active: v.active,
    updated_by: ctx.userId,
  };
  if (v.id) {
    const { error } = await supabase
      .from("planning_templates")
      .update(payload)
      .eq("id", v.id)
      .eq("workspace_id", ctx.workspaceId);
    if (error) return { error: toActionErrorMessage(error) };
    revalidatePath("/planning");
    return { id: v.id };
  }
  const { data, error } = await supabase
    .from("planning_templates")
    .insert({ ...payload, workspace_id: ctx.workspaceId, created_by: ctx.userId })
    .select("id")
    .single();
  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/planning");
  return { id: (data as { id: string }).id };
}

/** Şablon sil (admin). Şablondan kurulmuş toplantılar silinmez (template_id → null). */
export async function deleteTemplate(
  templateId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdminRole(ctx.role)) return { error: ADMIN_ONLY };
  const { error } = await supabase
    .from("planning_templates")
    .delete()
    .eq("id", templateId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/planning");
  return { ok: true };
}

/** yyyy-MM-dd + n gün (saat dilimi oynamasın diye UTC üzerinden). */
function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Haftayı şablondan kurar: aktif her şablon için o haftanın gününe bir toplantı
 * açar. Zaten kurulmuş şablonlar (template_id) ve aynı gün+saatte aynı
 * kategori+başlıkla elle açılmış toplantılar atlanır — buton kaç kez basılırsa
 * basılsın hafta ikinci kez şişmez.
 */
export async function applyTemplatesToWeek(
  weekStart: string,
): Promise<{ ok: true; created: number } | { error: string }> {
  if (!DATE_RE.test(weekStart)) return { error: "Geçersiz hafta başlangıcı." };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdminRole(ctx.role)) return { error: PLANNING_ADMIN_ONLY };

  const { data: templates, error: tErr } = await supabase
    .from("planning_templates")
    .select("*")
    .eq("workspace_id", ctx.workspaceId)
    .eq("active", true)
    .order("weekday", { ascending: true })
    .order("time_slot", { ascending: true })
    .order("position", { ascending: true });
  if (tErr) return { error: toActionErrorMessage(tErr) };
  if (!templates?.length) return { error: "Aktif şablon yok. Önce “Şablonlar”dan haftanın ritmini tanımlayın." };

  const weekEnd = addDaysIso(weekStart, 6);
  const { data: existing, error: eErr } = await supabase
    .from("planning_meetings")
    .select("meeting_date, time_slot, category, title, template_id")
    .eq("workspace_id", ctx.workspaceId)
    .gte("meeting_date", weekStart)
    .lte("meeting_date", weekEnd);
  if (eErr) return { error: toActionErrorMessage(eErr) };

  const usedTemplateIds = new Set((existing ?? []).map((m) => m.template_id).filter(Boolean));
  const manualKeys = new Set(
    (existing ?? []).map((m) => `${m.meeting_date}|${m.time_slot}|${m.category}|${m.title ?? ""}`),
  );

  const rows: Record<string, unknown>[] = [];
  for (const t of templates) {
    if (usedTemplateIds.has(t.id)) continue;
    const date = addDaysIso(weekStart, t.weekday as number);
    if (manualKeys.has(`${date}|${t.time_slot}|${t.category}|${t.title ?? ""}`)) continue;
    rows.push({
      workspace_id: ctx.workspaceId,
      meeting_date: date,
      time_slot: t.time_slot,
      category: t.category,
      title: t.title,
      content: t.content,
      participant_ids: t.participant_ids ?? [],
      position: t.position ?? 0,
      template_id: t.id,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    });
  }
  if (rows.length) {
    const { error } = await supabase.from("planning_meetings").insert(rows);
    if (error) return { error: toActionErrorMessage(error) };
  }
  revalidatePath("/planning");
  return { ok: true, created: rows.length };
}

/**
 * Geçen haftanın toplantılarını (konular hariç — konular o haftanın işidir)
 * bu haftaya kopyalar. Çakışanlar atlanır.
 */
export async function copyPreviousWeek(
  weekStart: string,
): Promise<{ ok: true; created: number } | { error: string }> {
  if (!DATE_RE.test(weekStart)) return { error: "Geçersiz hafta başlangıcı." };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdminRole(ctx.role)) return { error: PLANNING_ADMIN_ONLY };

  const prevStart = addDaysIso(weekStart, -7);
  const prevEnd = addDaysIso(weekStart, -1);
  const { data: prev, error: pErr } = await supabase
    .from("planning_meetings")
    .select("meeting_date, time_slot, category, title, content, participant_ids, position, template_id")
    .eq("workspace_id", ctx.workspaceId)
    .gte("meeting_date", prevStart)
    .lte("meeting_date", prevEnd);
  if (pErr) return { error: toActionErrorMessage(pErr) };
  if (!prev?.length) return { error: "Geçen haftada kopyalanacak toplantı yok." };

  const weekEnd = addDaysIso(weekStart, 6);
  const { data: existing, error: eErr } = await supabase
    .from("planning_meetings")
    .select("meeting_date, time_slot, category, title")
    .eq("workspace_id", ctx.workspaceId)
    .gte("meeting_date", weekStart)
    .lte("meeting_date", weekEnd);
  if (eErr) return { error: toActionErrorMessage(eErr) };
  const taken = new Set(
    (existing ?? []).map((m) => `${m.meeting_date}|${m.time_slot}|${m.category}|${m.title ?? ""}`),
  );

  const rows: Record<string, unknown>[] = [];
  for (const m of prev) {
    const date = addDaysIso(m.meeting_date as string, 7);
    if (taken.has(`${date}|${m.time_slot}|${m.category}|${m.title ?? ""}`)) continue;
    rows.push({
      workspace_id: ctx.workspaceId,
      meeting_date: date,
      time_slot: m.time_slot,
      category: m.category,
      title: m.title,
      content: m.content,
      participant_ids: m.participant_ids ?? [],
      position: m.position ?? 0,
      template_id: m.template_id ?? null,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    });
  }
  if (rows.length) {
    const { error } = await supabase.from("planning_meetings").insert(rows);
    if (error) return { error: toActionErrorMessage(error) };
  }
  revalidatePath("/planning");
  return { ok: true, created: rows.length };
}

/**
 * Toplantıyı BAŞKA HÜCREYE taşır — sürükle bırak.
 *
 * Aslı Hanım (2026-08-29): "bu calendar kısmı biraz Excel tarzında olmalı,
 * esnek olmalı; mesela sürükle bırakla taşıyabilmeli."
 *
 * Yalnız gün ve saat değişir; başlık, konular, kişiler ve kategori aynen
 * taşınır — hücre değiştirmek içeriği yeniden yazmak değildir.
 */
export async function moveMeeting(
  meetingId: string,
  target: { meeting_date: string; time_slot: string },
): Promise<{ ok: true } | { error: string }> {
  const parsed = z
    .object({
      meeting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Geçersiz tarih"),
      time_slot: z.string().min(1).max(10),
    })
    .safeParse(target);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdminRole(ctx.role)) return { error: PLANNING_ADMIN_ONLY };

  const { error, count } = await supabase
    .from("planning_meetings")
    .update(
      {
        meeting_date: parsed.data.meeting_date,
        time_slot: parsed.data.time_slot,
        updated_by: ctx.userId,
      },
      { count: "exact" },
    )
    .eq("id", meetingId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };
  if (count === 0) return { error: NOT_FOUND };
  revalidatePath("/planning");
  return { ok: true };
}

/**
 * KONUYU başka hücreye taşır — sürükle bırak.
 *
 * Aslı Hanım (2026-08-29): "Konulardaki başlıklar da sürükle bırak olmalı."
 *
 * Konu bir TOPLANTIYA bağlıdır; başka gün/saate taşımak onu o hücrenin
 * toplantısına bağlamak demektir. Hedef hücrede toplantı yoksa sessizce bir
 * tane açılır (başlıksız, kategorisi o saatteki komşusundan) — kullanıcı
 * "önce toplantı oluştur" diye bir duvara çarpmasın.
 *
 * Taşıma sonrası HEM kaynak HEM hedef toplantının konuları 0..n-1 olarak
 * yeniden numaralanır: ızgara satırları position'a göre çizildiği için
 * boşluklu numaralar "Konu 2 boş, Konu 3 dolu" gibi hayalet satır üretiyordu.
 */
export async function moveTopic(
  topicId: string,
  target: { meeting_date: string; time_slot: string; position: number },
): Promise<{ ok: true } | { error: string }> {
  const parsed = z
    .object({
      meeting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Geçersiz tarih"),
      time_slot: z.string().min(1).max(10),
      position: z.number().int().min(0).max(50),
    })
    .safeParse(target);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdminRole(ctx.role)) return { error: PLANNING_ADMIN_ONLY };

  const { data: topicRow, error: topicErr } = await supabase
    .from("planning_topics")
    .select("id, meeting_id")
    .eq("id", topicId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (topicErr) return { error: toActionErrorMessage(topicErr) };
  if (!topicRow) return { error: "Konu bulunamadı." };
  const sourceMeetingId = (topicRow as { meeting_id: string }).meeting_id;

  // Hedef hücrenin toplantısı — yoksa aç.
  const { data: found } = await supabase
    .from("planning_meetings")
    .select("id")
    .eq("workspace_id", ctx.workspaceId)
    .eq("meeting_date", parsed.data.meeting_date)
    .eq("time_slot", parsed.data.time_slot)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  let targetMeetingId = (found as { id: string } | null)?.id ?? null;
  if (!targetMeetingId) {
    // Kategori o saatteki başka bir günden miras alınır ki hücre şeridin
    // rengiyle uyumlu çıksın.
    const { data: sibling } = await supabase
      .from("planning_meetings")
      .select("category")
      .eq("workspace_id", ctx.workspaceId)
      .eq("time_slot", parsed.data.time_slot)
      .limit(1)
      .maybeSingle();
    const { data: created, error: createErr } = await supabase
      .from("planning_meetings")
      .insert({
        workspace_id: ctx.workspaceId,
        meeting_date: parsed.data.meeting_date,
        time_slot: parsed.data.time_slot,
        category: (sibling as { category: string } | null)?.category ?? "other",
        participant_ids: [],
        collaborator_ids: [],
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
      .select("id")
      .single();
    if (createErr) return { error: toActionErrorMessage(createErr) };
    targetMeetingId = (created as { id: string }).id;
  }

  const { error: moveErr } = await supabase
    .from("planning_topics")
    .update({ meeting_id: targetMeetingId, position: parsed.data.position })
    .eq("id", topicId)
    .eq("workspace_id", ctx.workspaceId);
  if (moveErr) return { error: toActionErrorMessage(moveErr) };

  await renumberTopics(supabase, ctx.workspaceId, targetMeetingId, topicId, parsed.data.position);
  if (sourceMeetingId !== targetMeetingId) {
    await renumberTopics(supabase, ctx.workspaceId, sourceMeetingId, null, 0);
  }

  revalidatePath("/planning");
  return { ok: true };
}

/** Bir toplantının konularını 0..n-1 yapar; `pinnedId` verilirse o konu
 *  `pinnedIndex`'e oturtulur, kalanlar etrafında kayar. */
async function renumberTopics(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  meetingId: string,
  pinnedId: string | null,
  pinnedIndex: number,
): Promise<void> {
  const { data } = await supabase
    .from("planning_topics")
    .select("id, position")
    .eq("meeting_id", meetingId)
    .eq("workspace_id", workspaceId)
    .order("position", { ascending: true });
  const rows = (data ?? []) as { id: string; position: number }[];
  if (!rows.length) return;

  const others = rows.filter((r) => r.id !== pinnedId).map((r) => r.id);
  const ordered = pinnedId
    ? [...others.slice(0, pinnedIndex), pinnedId, ...others.slice(pinnedIndex)]
    : others;

  for (let i = 0; i < ordered.length; i++) {
    const id = ordered[i];
    const current = rows.find((r) => r.id === id);
    if (current && current.position === i) continue; // gereksiz yazma yok
    await supabase
      .from("planning_topics")
      .update({ position: i })
      .eq("id", id)
      .eq("workspace_id", workspaceId);
  }
}
