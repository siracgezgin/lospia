"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage, isMissingSchemaError } from "@/lib/utils/supabase-errors";
import { sendEmail } from "@/lib/email/send-email";
import { meetingInviteEmail } from "@/lib/email/templates/meeting-invite";
import { normalizeSlot, toIstanbulTime } from "@/lib/planning/timezones";
import { findOrCreateMeeting } from "@/lib/planning/meeting-slot";
import { addDaysISO, istanbulTodayISO } from "@/lib/utils/today";

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
  /* EKİP DIŞI KATILIMCILAR (2026-09-07). Sabri Bey üreticimiz, Meral Hanım
     kalıpçımız — ikisi de sistemde kullanıcı değil:
       "Sabri Bey'i nasıl ekleyeceğim ben? Yani burada ekip içi var."
       "Şuraya bir artı koysan, bir e-mail hesabı girdirsen artıyla." */
  external_emails: z
    .array(z.string().trim().email("Geçersiz e-posta").max(200))
    .max(20)
    .default([]),
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
      external_emails: v.external_emails,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();
  /* `external_emails` kolonu 20240338 ile geldi. Prod'a migration elle
     uygulandığı için, henüz uygulanmamış bir kurulumda toplantı oluşturmak
     TAMAMEN kırılmasın: kolonsuz bir kez daha denenir. */
  if (error && isMissingSchemaError(error)) {
    const retry = await supabase
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
    if (retry.error) return { error: toActionErrorMessage(retry.error) };
    revalidatePath("/planning");
    return { id: (retry.data as { id: string }).id };
  }
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
  const base = {
    meeting_date: v.meeting_date,
    time_slot: v.time_slot,
    category: v.category,
    title: nn(v.title),
    content: nn(v.content),
    participant_ids: v.participant_ids,
    collaborator_ids: v.collaborator_ids,
    updated_by: ctx.userId,
  };
  const { error } = await supabase
    .from("planning_meetings")
    .update({ ...base, external_emails: v.external_emails })
    .eq("id", meetingId)
    .eq("workspace_id", ctx.workspaceId);
  if (error && isMissingSchemaError(error)) {
    const retry = await supabase
      .from("planning_meetings")
      .update(base)
      .eq("id", meetingId)
      .eq("workspace_id", ctx.workspaceId);
    if (retry.error) return { error: toActionErrorMessage(retry.error) };
    revalidatePath("/planning");
    return { ok: true };
  }
  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/planning");
  return { ok: true };
}

/** Silinen toplantının GERİ ALMAK için gereken tam kopyası. */
export type MeetingSnapshot = {
  meeting_date: string;
  time_slot: string;
  category: string;
  title: string | null;
  content: string | null;
  participant_ids: string[];
  collaborator_ids: string[];
  kim: string | null;
  topics: {
    position: number;
    text: string | null;
    kim: string | null;
    participant_ids: string[];
    collaborator_ids: string[];
    due_date: string | null;
  }[];
};

/**
 * Toplantıyı siler ve GERİ ALINABİLİR bir kopyasını döndürür.
 *
 * Aslı Hanım (2026-08-30): "Bir konu yerine yanlışlıkla başlığı silince
 * gidiyor, Ctrl+Z yapınca geri gelmiyor, bu çok kötü."
 *
 * Konu satırının çöp kutusu ile toplantının "Sil" düğmesi yan yana duruyor;
 * yanlışa basmak kolay ve sonucu KALICI. Silmeden önce satırın ve konularının
 * tam kopyası okunur, çağırana verilir; kullanıcı "Geri al" derse
 * `restoreMeeting` aynı içerikle yeniden yazar (bkz. MeetingUndoBar).
 *
 * Yumuşak silme (deleted_at) yerine kopya-döndürme seçildi: planning_meetings
 * tüm okumalarında filtre yok; bir `deleted_at` sütunu eklemek takvimin her
 * sorgusuna koşul eklemeyi ve migration'ı gerektirirdi. Geri alma penceresi
 * kullanıcının o anki kararı kadar yaşar.
 */
export async function deleteMeeting(
  meetingId: string,
): Promise<{ ok: true; snapshot: MeetingSnapshot | null } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdminRole(ctx.role)) return { error: PLANNING_ADMIN_ONLY };

  /* Kopya SİLMEDEN ÖNCE okunur — satır gittikten sonra okunacak bir şey
     kalmaz. Okuma başarısızsa silme yine yapılır, yalnız geri alma sunulmaz. */
  const { data: before } = await supabase
    .from("planning_meetings")
    .select("*, planning_topics(*)")
    .eq("id", meetingId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  const { error } = await supabase
    .from("planning_meetings")
    .delete()
    .eq("id", meetingId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/planning");

  const row = before as Record<string, unknown> | null;
  if (!row) return { ok: true, snapshot: null };

  const topicRows = (row.planning_topics as Record<string, unknown>[] | null) ?? [];
  const snapshot: MeetingSnapshot = {
    meeting_date: String(row.meeting_date).slice(0, 10),
    time_slot: String(row.time_slot).slice(0, 5),
    category: String(row.category ?? "other"),
    title: (row.title as string | null) ?? null,
    content: (row.content as string | null) ?? null,
    participant_ids: (row.participant_ids as string[] | null) ?? [],
    collaborator_ids: (row.collaborator_ids as string[] | null) ?? [],
    kim: (row.kim as string | null) ?? null,
    topics: topicRows
      .map((t, i) => ({
        position: Number(t.position ?? i),
        text: (t.text as string | null) ?? null,
        kim: (t.kim as string | null) ?? null,
        participant_ids: (t.participant_ids as string[] | null) ?? [],
        collaborator_ids: (t.collaborator_ids as string[] | null) ?? [],
        due_date: (t.due_date as string | null) ?? null,
      }))
      .sort((a, b) => a.position - b.position),
  };
  return { ok: true, snapshot };
}

/**
 * Silinen toplantıyı geri yazar (bkz. deleteMeeting).
 *
 * YENİ id ile yazılır: eski satırın id'sini geri koymak, o id'ye bağlı
 * silinmiş konuların/görevlerin yeniden canlanacağı izlenimi verirdi — oysa
 * geri gelen şey içeriğin kopyasıdır. Konuların `task_id`i BİLEREK taşınmaz:
 * göreve dönüştürülmüş bir konu silindiğinde görev Pano'da yaşamaya devam
 * eder; kopyayı ona yeniden bağlamak iki kaydı sessizce eşleştirirdi.
 */
export async function restoreMeeting(
  snapshot: MeetingSnapshot,
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdminRole(ctx.role)) return { error: PLANNING_ADMIN_ONLY };

  const { data, error } = await supabase
    .from("planning_meetings")
    .insert({
      workspace_id: ctx.workspaceId,
      meeting_date: snapshot.meeting_date,
      time_slot: snapshot.time_slot,
      category: snapshot.category,
      title: nn(snapshot.title),
      content: nn(snapshot.content),
      participant_ids: snapshot.participant_ids ?? [],
      collaborator_ids: snapshot.collaborator_ids ?? [],
      kim: nn(snapshot.kim),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) return { error: toActionErrorMessage(error) };
  const newId = (data as { id: string }).id;

  const topics = (snapshot.topics ?? []).filter((t) => (t.text ?? "").trim() || t.participant_ids?.length);
  if (topics.length) {
    const { error: tErr } = await supabase.from("planning_topics").insert(
      topics.map((t, i) => ({
        meeting_id: newId,
        workspace_id: ctx.workspaceId,
        position: t.position ?? i,
        text: nn(t.text),
        kim: nn(t.kim),
        participant_ids: t.participant_ids ?? [],
        collaborator_ids: t.collaborator_ids ?? [],
        due_date: t.due_date ?? null,
        created_by: ctx.userId,
      })),
    );
    // Konular yazılamazsa toplantı yine geri gelmiş olur; sessiz kalmayalım.
    if (tErr) return { error: "Toplantı geri geldi ama konular yazılamadı." };
  }

  revalidatePath("/planning");
  return { id: newId };
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
  /* İSTANBUL günü — Vercel UTC'de çalışıyor; `new Date().toISOString()`
     00:00–03:00 arasında BİR ÖNCEKİ günü veriyordu (bkz. lib/utils/today.ts). */
  const today = istanbulTodayISO();

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
      /* SERVİS ROL İSTEMCİSİ: katılımcı satırı BAŞKA birinin adına yazılır;
         `task_member_completions` RLS'i üyenin yalnız kendi satırını
         yazmasına izin verir, bu yüzden atamayı yönetici yaptığında normal
         istemci reddedilir. Yetki yukarıda kontrol edildi ve satır
         `ctx.workspaceId` ile damgalanıyor — kapsam korunuyor. */
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

/* addDaysIso YEREL KOPYASI KALDIRILDI — tek kaynak lib/utils/today.ts.
   Doğru yazılmıştı ama aynı hesap dört yerde duruyordu; biri bozulduğunda
   diğerleri sessizce ayrışırdı. */
const addDaysIso = addDaysISO;

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
 * BAŞLIĞI YERİNDE DEĞİŞTİRİR — ızgaradaki hücreye tıklayıp yazmak.
 *
 * Aslı Hanım (2026-09-07): "Toplantı başlıkları ve konular AYRI olsun. Yani
 * BAŞLIK ÜZERİNE TIKLAYINCA DEĞİŞEBİLİR OLSUN, silip yazabiliriz."
 *
 * Başlığı değiştirmek için toplantı penceresini açıp gündemin tamamını
 * görmek gerekiyordu; başlık ile konular aynı kapıdan giriliyordu. Artık
 * başlığın kendi kapısı var.
 *
 * Hücrede toplantı yoksa yazılan başlıkla bir tane AÇILIR (boş hücreye
 * yazmak da bir başlangıçtır). Başlık boşaltılırsa toplantı SİLİNMEZ —
 * yalnız adı boşalır; silme ayrı ve onaylı bir eylemdir.
 */
export async function setMeetingTitle(
  target: { meetingId: string } | { meeting_date: string; time_slot: string },
  title: string,
): Promise<{ ok: true; id: string } | { error: string }> {
  const clean = (title ?? "").trim().slice(0, 300);
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdminRole(ctx.role)) return { error: PLANNING_ADMIN_ONLY };

  if ("meetingId" in target) {
    const { error, count } = await supabase
      .from("planning_meetings")
      .update({ title: clean || null, updated_by: ctx.userId }, { count: "exact" })
      .eq("id", target.meetingId)
      .eq("workspace_id", ctx.workspaceId);
    if (error) return { error: toActionErrorMessage(error) };
    if (count === 0) return { error: NOT_FOUND };
    revalidatePath("/planning");
    return { ok: true, id: target.meetingId };
  }

  const parsed = z
    .object({
      meeting_date: z.string().regex(DATE_RE, "Geçersiz tarih"),
      time_slot: z.string().min(1).max(10),
    })
    .safeParse(target);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!clean) return { error: "Başlık boş olamaz." };

  /* Kategori o saatteki komşudan miras alınır ki yeni hücre şeridin rengiyle
     uyumlu çıksın (moveTopic'teki aynı kural). */
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
      title: clean,
      participant_ids: [],
      collaborator_ids: [],
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();
  if (createErr) return { error: toActionErrorMessage(createErr) };
  revalidatePath("/planning");
  return { ok: true, id: (created as { id: string }).id };
}

/**
 * KONUYU ÇOĞALTIR — toplantıyı değil, KONUYU.
 *
 * Sıraç (2026-09-08): "Çoğalt deyince O KONUYU değil, konu başlığı altındakini
 * çoğaltıyor." Bir önceki turda bunu "çoğalt toplantı düzeyinde bir eylem"
 * diye okuyup düğmeyi tek konu kipinden KALDIRMIŞTIM — yanlış okumaymış:
 * istenen şey konunun kendisinin kopyalanmasıydı (2026-09-10: "hani o konuyu
 * çoğaltma nerde?").
 *
 * Hedef gün verilmezse kopya AYNI toplantının sonuna eklenir. Verilirse o
 * gün/saatteki toplantıya taşınır; toplantı yoksa açılır (moveTopic'teki aynı
 * kural) — "bu konuyu çarşambaya da koy" akışı.
 *
 * Kopyalanmayan: `task_id` (kopya kaynağın görevini sahiplenmez, kendi
 * "Bildir"ini bekler) ve `done_at` (yeni konu bitmiş sayılmaz).
 */
export async function duplicateTopic(
  topicId: string,
  target?: { meeting_date?: string; time_slot?: string },
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdminRole(ctx.role)) return { error: PLANNING_ADMIN_ONLY };

  const { data: src } = await supabase
    .from("planning_topics")
    .select("id, meeting_id, text, participant_ids, collaborator_ids, due_date")
    .eq("id", topicId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!src) return { error: "Konu bulunamadı." };
  const t = src as {
    meeting_id: string; text: string | null;
    participant_ids: string[] | null; collaborator_ids: string[] | null;
    due_date: string | null;
  };

  let meetingId = t.meeting_id;
  let dueDate = t.due_date;

  const wantsMove = !!target?.meeting_date;
  if (wantsMove) {
    const parsed = z
      .object({
        meeting_date: z.string().regex(DATE_RE, "Geçersiz tarih"),
        time_slot: z.string().min(1).max(10).optional(),
      })
      .safeParse(target);
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    /* Hedef saat verilmediyse KAYNAK TOPLANTININ saati kullanılır: kopya
       rastgele bir şeride düşmesin. */
    let slot = parsed.data.time_slot ?? null;
    if (!slot) {
      const { data: srcMeeting } = await supabase
        .from("planning_meetings").select("time_slot").eq("id", t.meeting_id).maybeSingle();
      slot = (srcMeeting as { time_slot: string } | null)?.time_slot ?? "09:00";
    }

    const slotRes = await findOrCreateMeeting(supabase, ctx, parsed.data.meeting_date, slot);
    if ("error" in slotRes) return { error: slotRes.error };
    meetingId = slotRes.id;
    dueDate = parsed.data.meeting_date;
  }

  // Kopya hedef toplantının SONUNA eklenir.
  const { data: last } = await supabase
    .from("planning_topics")
    .select("position")
    .eq("meeting_id", meetingId)
    .eq("workspace_id", ctx.workspaceId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = Math.min(50, ((last as { position: number } | null)?.position ?? -1) + 1);

  const { data: ins, error } = await supabase
    .from("planning_topics")
    .insert({
      meeting_id: meetingId,
      workspace_id: ctx.workspaceId,
      position,
      text: t.text,
      participant_ids: t.participant_ids ?? [],
      collaborator_ids: t.collaborator_ids ?? [],
      due_date: dueDate,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) return { error: toActionErrorMessage(error) };

  revalidatePath("/planning");
  revalidatePath("/home");
  return { id: (ins as { id: string }).id };
}

/**
 * KONUNUN SONUCU — tamamlandı · aksadı · duruyor.
 *
 * Sıraç (2026-09-08): "Tamamlanması gereken KONU olması lazım, konu başlığı
 * değil — üzerini çizip yeşil yapalım, tıpkı Pano mantığındaki tamamlandı
 * gibi." Ve (2026-09-10): "AKSAYAN DA tamamlanan da konu başlığı değil konular
 * olmalı."
 *
 * Toplantı düzeyindeki `status` kolonu duruyor (veri kaybı olmasın) ama artık
 * arayüzde kullanılmıyor: bir toplantıda üç konu konuşulur, biri biter biri
 * aksar — tek bir "toplantı bitti" damgası bunu anlatamıyordu.
 */
export async function setTopicOutcome(
  topicId: string,
  outcome: "open" | "done" | "missed",
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdminRole(ctx.role)) return { error: PLANNING_ADMIN_ONLY };

  /* ÜÇ DURUM, İKİ KOLON. done_at ve missed_at aynı anda dolamaz (veritabanı
     kısıtı da bunu zorlar); bir duruma geçmek diğerini boşaltır. */
  const now = new Date().toISOString();
  const { error, count } = await supabase
    .from("planning_topics")
    .update(
      {
        done_at: outcome === "done" ? now : null,
        done_by: outcome === "done" ? ctx.userId : null,
        missed_at: outcome === "missed" ? now : null,
        missed_by: outcome === "missed" ? ctx.userId : null,
      },
      { count: "exact" },
    )
    .eq("id", topicId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) {
    if (isMissingSchemaError(error)) {
      return { error: "Konu durumu için veritabanı güncellemesi bekleniyor (20240343)." };
    }
    return { error: toActionErrorMessage(error) };
  }
  if (count === 0) return { error: "Konu bulunamadı." };
  revalidatePath("/planning");
  revalidatePath("/home");
  return { ok: true };
}

/**
 * TEK KONUYU SİLER — ızgaradan, pencere açmadan.
 *
 * Aslı Hanım (2026-09-07): "Ben SİL deyince genelde komple o toplantı
 * siliniyor, bunu istemiyorum. BİRER BİRER SİLİNEBİLSİN."
 *
 * Kalan konular 0..n-1 olarak yeniden numaralanır: boşluklu numara ızgarada
 * "Konu 2 boş, Konu 3 dolu" gibi hayalet satır üretiyordu.
 */
export async function deleteTopic(
  topicId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdminRole(ctx.role)) return { error: PLANNING_ADMIN_ONLY };

  const { data: topic } = await supabase
    .from("planning_topics")
    .select("id, meeting_id")
    .eq("id", topicId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!topic) return { error: "Konu bulunamadı." };
  const meetingId = (topic as { meeting_id: string }).meeting_id;

  const { error } = await supabase
    .from("planning_topics")
    .delete()
    .eq("id", topicId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };

  await renumberTopics(supabase, ctx.workspaceId, meetingId, null, 0);
  revalidatePath("/planning");
  return { ok: true };
}

/**
 * DIŞ KATILIMCIYI EKLER — hem toplantıya, hem FİHRİSTE (CRM).
 *
 * Aslı Hanım (2026-09-07):
 *   "Şuraya bir artı koysan, bir e-mail hesabı girdirsen artıyla."
 *   "Mesela bak şimdi burada cumartesi günü Berna Hanım'la bir toplantı koydu
 *    bana. ŞURADA BİR ARTI OLURSA BERNA'YI HEMEN KAYDEDERİZ."
 *   "Fihristte… ADI, SOYADI, TANIMI, NE TOPLANTISI OLDUĞU bilgileri girer.
 *    BÖYLECE ORADA DA BİR DATABASE'İMİZ OLUŞUR."
 *   "Meral Hanım kalıpçımız, Sabri Bey üreticimiz — bunlar bizim dışarıdan
 *    çalıştığımız insanlar."
 *
 * Yani "+" iki iş yapar: kişiyi toplantının davetlisi yapar VE CRM'e kalıcı
 * bir kayıt olarak düşürür. Adres yalnız toplantıda kalsaydı ikinci kez
 * çağırırken yeniden yazmak gerekirdi — AF'nin "database" dediği şey tam da
 * bunun olmaması.
 *
 * AYNI E-POSTA İKİ KEZ KAYDEDİLMEZ: adres CRM'de varsa o kayıt GÜNCELLENİR
 * (boş kalan tanım/kategori doldurulur), yenisi açılmaz.
 */
export async function addExternalParticipant(
  meetingId: string,
  input: {
    email: string;
    name?: string | null;
    /** "Üretici", "Kalıpçı" — AF'nin "tanımı" dediği alan. */
    roleLabel?: string | null;
    /** CRM kutusu: outsource · toplanti · vip · basin … (lib/crm/constants). */
    segment?: string | null;
  },
): Promise<{ ok: true; contactId: string | null } | { error: string }> {
  const parsed = z
    .object({
      email: z.string().trim().email("Geçerli bir e-posta yazın.").max(200),
      name: z.string().trim().max(200).optional().nullable(),
      roleLabel: z.string().trim().max(100).optional().nullable(),
      segment: z.string().trim().max(40).optional().nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdminRole(ctx.role)) return { error: PLANNING_ADMIN_ONLY };

  const v = parsed.data;
  const email = v.email.toLowerCase();

  const { data: meetingRow, error: mErr } = await supabase
    .from("planning_meetings")
    .select("id, title, meeting_date, external_emails")
    .eq("id", meetingId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (mErr && isMissingSchemaError(mErr)) {
    return { error: "Dış katılımcı alanı için veritabanı güncellemesi bekleniyor (20240338)." };
  }
  if (!meetingRow) return { error: NOT_FOUND };
  const meeting = meetingRow as {
    title: string | null; meeting_date: string; external_emails: string[] | null;
  };

  // 1) Toplantının davetli listesine ekle (yinelenmez).
  const current = (meeting.external_emails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!current.includes(email)) {
    const { error } = await supabase
      .from("planning_meetings")
      .update({ external_emails: [...current, email], updated_by: ctx.userId })
      .eq("id", meetingId)
      .eq("workspace_id", ctx.workspaceId);
    if (error) return { error: toActionErrorMessage(error) };
  }

  /* 2) FİHRİST kaydı. "Ne toplantısı olduğu" bilgisi nota düşer — AF bunu
        ayrı bir alan olarak değil, kişinin hikâyesi olarak istedi ("cumartesi
        günkü Berna"). Not BİRİKİR: aynı kişi başka bir toplantıya çağrılınca
        önceki satır silinmez. */
  const meetingLabel = `${nn(meeting.title) ?? "Toplantı"} · ${String(meeting.meeting_date).slice(0, 10)}`;

  const { data: existing, error: findErr } = await supabase
    .from("workspace_contacts")
    .select("id, name, role_label, segment, notes")
    .eq("workspace_id", ctx.workspaceId)
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  /* CRM kolonları migrate edilmemişse toplantı yine kurulmuş olur; fihrist
     kaydı sessizce atlanır — davet akışı buna takılmamalı. */
  if (findErr && isMissingSchemaError(findErr)) {
    revalidatePath("/planning");
    return { ok: true, contactId: null };
  }

  if (existing) {
    const e = existing as { id: string; name: string; role_label: string | null; segment: string | null; notes: string | null };
    const noteLine = `Toplantı: ${meetingLabel}`;
    const notes = (e.notes ?? "").includes(noteLine)
      ? e.notes
      : [e.notes, noteLine].filter(Boolean).join("\n");
    // Var olan kaydın DOLU alanları ezilmez; yalnız boşluklar tamamlanır.
    const { error } = await supabase
      .from("workspace_contacts")
      .update({
        name: e.name || nn(v.name) || email,
        role_label: e.role_label || nn(v.roleLabel),
        segment: e.segment || nn(v.segment) || "toplanti",
        notes,
      })
      .eq("id", e.id)
      .eq("workspace_id", ctx.workspaceId);
    if (error) return { error: toActionErrorMessage(error) };
    revalidatePath("/planning");
    revalidatePath("/crm");
    return { ok: true, contactId: e.id };
  }

  const { data: created, error: insErr } = await supabase
    .from("workspace_contacts")
    .insert({
      workspace_id: ctx.workspaceId,
      // CRM listesi YALNIZ dış ilişkileri gösterir (kind ayrımı, 2026-08-24).
      kind: "external",
      name: nn(v.name) || email,
      email,
      role_label: nn(v.roleLabel),
      // Kutu seçilmediyse "Toplantılar": AF'nin saydığı kutulardan biri ve
      // kişinin sisteme GİRİŞ sebebi tam olarak bu.
      segment: nn(v.segment) || "toplanti",
      notes: `Toplantı: ${meetingLabel}`,
    })
    .select("id")
    .maybeSingle();
  if (insErr) {
    if (isMissingSchemaError(insErr)) {
      revalidatePath("/planning");
      return { ok: true, contactId: null };
    }
    return { error: toActionErrorMessage(insErr) };
  }

  revalidatePath("/planning");
  revalidatePath("/crm");
  return { ok: true, contactId: (created as { id: string } | null)?.id ?? null };
}

/**
 * DIŞ KATILIMCILARA TOPLANTI DAVETİ GÖNDERİR.
 *
 * Aslı Hanım (2026-09-07):
 *   "Toplantı mailini sen buraya, şuraya bir artı koysan, bir e-mail hesabı
 *    girdirsen artıyla."
 *   "Onlara 'Size yeni bir görev atandı' DEĞİL de 'TOPLANTIYA DAVET
 *    EDİLDİNİZ' şeklinde olmalı."
 *   "Artık SON TARİH diye bir şey yok — direkt toplantı tarihi, TÜRKİYE SAATİ
 *    ve parantezde NY saati ile beraber gönderilsin."
 *   "Çarşamba günkü Sabri Bey ile toplantının e-maili buradan giderse Nisa'nın
 *    işini kolaylaştıracaksın. Bir daha adama 'mail' diye dürtmeyecek."
 *
 * Adres listesi toplantının `external_emails` alanıdır (20240338). Ekip
 * üyelerine buradan mail gitmez: onların bildirimi zaten uygulama içindeki
 * kanaldan (notifyTaskEvent) akıyor, ikinci bir kanal aynı kişiye iki kez
 * haber verirdi.
 *
 * Mail GERİ ALINAMAZ, o yüzden bu eylem kendiliğinden çalışmaz — kaydetmenin
 * yan etkisi değildir, yönetici açıkça "Davet gönder" der.
 */
export async function sendMeetingInvites(
  meetingId: string,
): Promise<{ ok: true; sent: string[]; failed: { to: string; reason: string }[] } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdminRole(ctx.role)) return { error: PLANNING_ADMIN_ONLY };

  const { data: row, error: readErr } = await supabase
    .from("planning_meetings")
    .select("id, title, content, meeting_date, time_slot, external_emails, planning_topics(text, position)")
    .eq("id", meetingId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (readErr) {
    if (isMissingSchemaError(readErr)) {
      return { error: "Dış katılımcı alanı için veritabanı güncellemesi bekleniyor (20240338)." };
    }
    return { error: toActionErrorMessage(readErr) };
  }
  if (!row) return { error: NOT_FOUND };

  const m = row as {
    title: string | null; content: string | null; meeting_date: string; time_slot: string;
    external_emails: string[] | null;
    planning_topics?: { text: string | null; position: number }[] | null;
  };
  const recipients = (m.external_emails ?? []).map((e) => e.trim()).filter(Boolean);
  if (!recipients.length) return { error: "Bu toplantıda dış katılımcı yok. Önce e-posta ekleyin." };

  const dateIso = String(m.meeting_date).slice(0, 10);
  const slot = normalizeSlot(m.time_slot);
  /* TÜRKİYE SAATİ ASIL, NY PARANTEZDE. Kayıtlı saat New York'tur; İstanbul
     hesaplanır (bkz. lib/planning/timezones.ts) — davet edilen kişi Türkiye'de,
     kendi saatini aramak zorunda kalmasın. */
  const ist = toIstanbulTime(dateIso, slot);
  const dateLabel = new Intl.DateTimeFormat("tr-TR", {
    day: "numeric", month: "long", year: "numeric", weekday: "long",
  }).format(new Date(`${dateIso}T12:00:00`));

  const topics = [...(m.planning_topics ?? [])]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((t) => (t.text ?? "").trim())
    .filter(Boolean);

  const { data: actor } = await supabase
    .from("profiles").select("full_name, email").eq("id", ctx.userId).maybeSingle();
  const actorName = (actor?.full_name as string | null) || (actor?.email as string | null) || null;

  const sent: string[] = [];
  const failed: { to: string; reason: string }[] = [];
  for (const to of recipients) {
    const res = await sendEmail(
      meetingInviteEmail({
        to,
        meetingTitle: nn(m.title) ?? "Toplantı",
        dateLabel,
        /* Gün taşması olduğunda saatin yanında "+1" durur — 21:00 NY, İstanbul'da
           ertesi gün 04:00'tür; bunu yazmazsak davet yanlış güne okunur. */
        istanbulTime: ist ? (ist.dayShift === 0 ? ist.time : `${ist.time} (+1 gün)`) : null,
        newYorkTime: slot || null,
        topics,
        actorName,
        note: nn(m.content),
      }),
    );
    if (res.status === "sent") sent.push(to);
    else failed.push({ to, reason: res.status === "error" ? res.error : res.reason });
  }

  revalidatePath("/planning");
  return { ok: true, sent, failed };
}

/**
 * TOPLANTIYI ÇOĞALTIR — "toplantının devamı".
 *
 * Aslı Hanım (2026-09-07):
 *   "Peki şöyle bir şey yapabiliyor muyum? Bunu DUPLICATE edebiliyor muyum?…
 *    Şimdi bu elbisenin fittingini yaptık, aynı ekiple bunun çarşamba günü
 *    üretimini konuştuk… Şöyle option'a basıp duplicate gibi taşıyabiliyor
 *    muyum? Yani toplantının DEVAMINI oraya koyacağım."
 *
 * Neden taşımak yetmiyor: sürükleyip bırakmak kaydı YERİNDEN EDİYORDU ve
 * geçmiş gün boşalıyordu —
 *   "Bu pazartesiyi buraya aldı. Hâlbuki ben bunu alsın istemiyorum. Ben dönüp
 *    HANGİ TARİHTE HANGİ TOPLANTIYI yaptığımız kalsın istiyorum."
 * Takvim bir arşivdir: geçmiş kayıt yerinde kalır, devamı yeni güne KOPYALANIR.
 *
 * Kopyalanan: başlık, not, kategori, kişiler, dış e-postalar ve KONULAR.
 * Kopyalanmayan: sonuç işareti (yeni toplantı 'planned' başlar) ve konuların
 * `task_id`'si — kopya, kaynağın görevini sahiplenmez, kendi "Bildir"ini bekler.
 */
export async function duplicateMeeting(
  meetingId: string,
  target: { meeting_date: string; time_slot?: string },
): Promise<{ id: string } | { error: string }> {
  const parsed = z
    .object({
      meeting_date: z.string().regex(DATE_RE, "Geçersiz tarih"),
      time_slot: z.string().min(1).max(10).optional(),
    })
    .safeParse(target);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdminRole(ctx.role)) return { error: PLANNING_ADMIN_ONLY };

  const { data: src, error: srcErr } = await supabase
    .from("planning_meetings")
    .select("*")
    .eq("id", meetingId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (srcErr) return { error: toActionErrorMessage(srcErr) };
  if (!src) return { error: NOT_FOUND };

  const m = src as Record<string, unknown>;

  /* AYNI HÜCREYE ÇOĞALTMA ENGELLİ. Sıraç (2026-09-08): "Kopyala yapıştır
     yapınca ya da çoğaltınca BAŞLIK İKİLİ OLUYOR ve silip düzeltemiyorum."
     Kopya kaynağın gün+saatine düşünce ızgara iki başlığı "Celebrity ·
     Celebrity" diye birleştiriyor ve hücre artık tek bir toplantıya ait
     olmadığı için yerinde düzenleme kapanıyor. Çoğaltmanın anlamı zaten
     "toplantının devamını BAŞKA GÜNE koymak" (AF, 07.09). */
  const targetSlot = parsed.data.time_slot ?? (m.time_slot as string);
  if (parsed.data.meeting_date === m.meeting_date && targetSlot === m.time_slot) {
    return { error: "Kopya aynı gün ve saate konamaz — başka bir gün seçin." };
  }

  const row: Record<string, unknown> = {
    workspace_id: ctx.workspaceId,
    meeting_date: parsed.data.meeting_date,
    time_slot: targetSlot,
    category: m.category,
    title: m.title,
    content: m.content,
    participant_ids: (m.participant_ids as string[]) ?? [],
    collaborator_ids: (m.collaborator_ids as string[]) ?? [],
    position: (m.position as number) ?? 0,
    created_by: ctx.userId,
    updated_by: ctx.userId,
  };
  if (Array.isArray(m.external_emails)) row.external_emails = m.external_emails;

  let created = await supabase.from("planning_meetings").insert(row).select("id").single();
  if (created.error && isMissingSchemaError(created.error)) {
    delete row.external_emails;
    created = await supabase.from("planning_meetings").insert(row).select("id").single();
  }
  if (created.error) return { error: toActionErrorMessage(created.error) };
  const newId = (created.data as { id: string }).id;

  /* KONULAR da gelir — "toplantının devamı" boş bir kutu değil, aynı gündemin
     ikinci oturumudur. Teslim tarihi yeni güne kayar; görev bağı kopar. */
  const { data: topics } = await supabase
    .from("planning_topics")
    .select("position, text, participant_ids, collaborator_ids")
    .eq("meeting_id", meetingId)
    .eq("workspace_id", ctx.workspaceId)
    .order("position", { ascending: true });
  const topicRows = (topics ?? []) as {
    position: number; text: string | null;
    participant_ids: string[] | null; collaborator_ids: string[] | null;
  }[];
  if (topicRows.length) {
    await supabase.from("planning_topics").insert(
      topicRows.map((t) => ({
        meeting_id: newId,
        workspace_id: ctx.workspaceId,
        position: t.position,
        text: t.text,
        participant_ids: t.participant_ids ?? [],
        collaborator_ids: t.collaborator_ids ?? [],
        due_date: parsed.data.meeting_date,
        created_by: ctx.userId,
      })),
    );
  }

  revalidatePath("/planning");
  revalidatePath("/home");
  return { id: newId };
}

/**
 * TOPLANTININ SONUCU — büyük yeşil tik ya da kırmızı çarpı.
 *
 * Aslı Hanım (2026-09-07):
 *   "Tamamlandığında şu yanındaki yeşil şey çıksın… Bu yeşili biraz daha büyük
 *    yapabilirsin. Hani böyle BAŞARDIK gibi bir yeşil olsun."
 *   "Eğer bu yeşil olmazsa, diyelim ki bir aksama oldu — toplantı kırmızı çarpı
 *    olsun, ki BİR SONRAKİ TOPLANTIYA EKLENMESİ GEREKTİĞİNİ anlayalım."
 *
 * Aynı işareti tekrar seçmek onu kaldırır (üçüncü durum: 'planned').
 */
export async function setMeetingStatus(
  meetingId: string,
  status: "planned" | "done" | "missed",
): Promise<{ ok: true; status: string } | { error: string }> {
  const parsed = z.enum(["planned", "done", "missed"]).safeParse(status);
  if (!parsed.success) return { error: "Geçersiz durum." };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdminRole(ctx.role)) return { error: PLANNING_ADMIN_ONLY };

  const { error, count } = await supabase
    .from("planning_meetings")
    .update(
      {
        status: parsed.data,
        status_at: parsed.data === "planned" ? null : new Date().toISOString(),
        status_by: parsed.data === "planned" ? null : ctx.userId,
        updated_by: ctx.userId,
      },
      { count: "exact" },
    )
    .eq("id", meetingId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) {
    /* Kolon henüz migrate edilmediyse kullanıcıya "yapamazsın" değil, NEDEN
       yapamadığı söylenir — prod'a migration'ı kullanıcı elle uyguluyor. */
    if (isMissingSchemaError(error)) {
      return { error: "Toplantı durumu için veritabanı güncellemesi bekleniyor (20240338)." };
    }
    return { error: toActionErrorMessage(error) };
  }
  if (count === 0) return { error: NOT_FOUND };
  revalidatePath("/planning");
  revalidatePath("/home");
  return { ok: true, status: parsed.data };
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

  /* Hedef hücrenin toplantısı — yoksa aç (ortak kural, bkz.
     lib/planning/meeting-slot). */
  const slotRes = await findOrCreateMeeting(
    supabase, ctx, parsed.data.meeting_date, parsed.data.time_slot,
  );
  if ("error" in slotRes) return { error: slotRes.error };
  const targetMeetingId = slotRes.id;

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

/**
 * GÖREVİ TAKVİME İLİŞTİRİR — "Görev oluştur" kartındaki SAAT'in karşılığı.
 *
 * Sıraç (2026-09-10): "Bu görev oluşturma da artık calendar'daki mantığa göre
 * olacak… artık departman kısmı yok burada, görev oluşturma kartında da işte
 * gündeki gibi ama bu sefer işte SAATİ de girecek, KONU girecek. Mantık bu
 * şekilde, artık her şey aynı sistem üzerinden yürüyecek."
 *
 * Departman "bu iş hangi kutuya ait?" sorusuydu; takvimde o soru yok — bir işin
 * yeri GÜN + SAAT'tir. Saati girilen görev, o hücredeki toplantının altına bir
 * KONU olarak düşer ve konu göreve bağlanır (`task_id`): Pano'daki iş ile
 * takvimdeki satır aynı kaydın iki yüzü olur, iki ayrı yere iki kez yazılmaz.
 *
 * Hücrede toplantı yoksa AÇILIR — moveTopic/setMeetingTitle'daki birebir aynı
 * kural, kategori o saatteki komşu şeritten miras alınır ki yeni hücre şeridin
 * rengiyle uyumlu çıksın. Kullanıcı "önce toplantı oluştur" duvarına çarpmaz.
 *
 * Saat girilmediyse bu fonksiyon hiç çağrılmaz (çağıran ekranın işi) — takvimde
 * saatsiz satır diye bir şey yok.
 */
export async function attachTaskToCalendar(
  taskId: string,
  input: { meeting_date: string; time_slot: string; text?: string | null },
): Promise<{ ok: true; topicId: string; meetingId: string } | { error: string }> {
  const parsed = z
    .object({
      meeting_date: z.string().regex(DATE_RE, "Geçersiz tarih"),
      // Tarayıcının <input type="time"> çıktısı "HH:MM"; normalizeSlot ızgarayla
      // aynı biçime ("09:00") çeker ki hücre eşleşmesi metin karşılaştırmasıyla
      // tutsun ("9:00" ile "09:00" iki ayrı hücre sayılmasın).
      time_slot: z.string().regex(/^\d{1,2}:\d{2}$/, "Geçersiz saat"),
      text: z.string().max(2000).optional().nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!taskId) return { error: "Görev bulunamadı." };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdminRole(ctx.role)) return { error: PLANNING_ADMIN_ONLY };

  const slot = normalizeSlot(parsed.data.time_slot);
  const day = parsed.data.meeting_date;

  // Görev gerçekten bu çalışma alanının mı? Başlık da buradan gelir: çağıran
  // metni göndermezse konu adsız kalmasın.
  const { data: task } = await supabase
    .from("tasks")
    .select("id, title")
    .eq("id", taskId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!task) return { error: "Görev bulunamadı." };
  const text = nn(parsed.data.text) ?? nn((task as { title: string | null }).title) ?? "Görev";

  // Hedef hücrenin toplantısı — yoksa aç (ortak kural, lib/planning/meeting-slot).
  const slotRes = await findOrCreateMeeting(supabase, ctx, day, slot);
  if ("error" in slotRes) return { error: slotRes.error };
  const meetingId = slotRes.id;

  /* Aynı görev iki kez iliştirilmesin: bağlı konu zaten varsa TAŞINIR.
     (Bugün çağıran tek yer yeni oluşturulmuş bir görev gönderiyor, ama bu
     eylem ileride "saatini değiştir" için de kullanılacak.) */
  const { data: existing } = await supabase
    .from("planning_topics")
    .select("id, meeting_id, position")
    .eq("workspace_id", ctx.workspaceId)
    .eq("task_id", taskId)
    .limit(1)
    .maybeSingle();
  const prev = existing as { id: string; meeting_id: string; position: number } | null;

  // Konu hedef toplantının SONUNA eklenir. Konu ZATEN o toplantıdaysa yerinde
  // kalır — kendi kendinin arkasına eklenip sırada boşluk (hayalet satır)
  // bırakmasın.
  const { data: last } = await supabase
    .from("planning_topics")
    .select("position")
    .eq("meeting_id", meetingId)
    .eq("workspace_id", ctx.workspaceId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position =
    prev && prev.meeting_id === meetingId
      ? prev.position
      : Math.min(50, ((last as { position: number } | null)?.position ?? -1) + 1);

  let topicId = prev?.id ?? "";
  if (topicId) {
    const { error: updErr } = await supabase
      .from("planning_topics")
      .update({ meeting_id: meetingId, position, text, due_date: day })
      .eq("id", topicId)
      .eq("workspace_id", ctx.workspaceId);
    if (updErr) return { error: toActionErrorMessage(updErr) };
  } else {
    const { data: ins, error: insErr } = await supabase
      .from("planning_topics")
      .insert({
        meeting_id: meetingId,
        workspace_id: ctx.workspaceId,
        position,
        text,
        task_id: taskId,
        participant_ids: [],
        collaborator_ids: [],
        due_date: day,
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (insErr) return { error: toActionErrorMessage(insErr) };
    topicId = (ins as { id: string }).id;
  }

  revalidatePath("/planning");
  revalidatePath("/home");
  revalidatePath("/calendar");
  return { ok: true, topicId, meetingId };
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
