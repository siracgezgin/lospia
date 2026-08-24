"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage } from "@/lib/utils/supabase-errors";

// Planlama — "Tamamlanmamış Eksik Konular". Aslı Hanım'ın takviminin altındaki
// kişi sütunları: bitmemiş işlerin not defteri. Takvimden farkı:
//   * haftaya bağlı değil — tamamlanana kadar durur,
//   * yazma yalnız yöneticiye kapalı değil: herkes KENDİ sütununa yazar
//     (yönetici hepsine). Aynı kural RLS'te de var (20240228 migration).

const AUTH_REQUIRED = "Kimlik doğrulama gerekli.";
const NOT_ALLOWED = "Bu satırı yalnız sahibi veya yönetici düzenleyebilir.";
const NOT_FOUND = "Konu bulunamadı.";

const CATEGORIES = [
  "uretim", "ai", "sales", "marketing", "finance", "external", "system", "tasarim", "other",
] as const;

const isAdminRole = (r: AppRole) => r === "owner" || r === "admin";
const nn = (s?: string | null) => {
  const t = (s ?? "").trim();
  return t.length ? t : null;
};

const CreateSchema = z.object({
  owner_user_id: z.string().max(64).optional().nullable(),
  owner_label: z.string().max(120).optional().nullable(),
  // Kişinin alt sütunu — Excel'de bir kişinin iki listesi olabiliyor
  // ("Sales / Satın Alma" ve "Sales / AFCOM").
  owner_role: z.string().max(200).optional().nullable(),
  text: z.string().min(1, "Konu metni boş olamaz.").max(2000),
  category: z.enum(CATEGORIES).optional().nullable(),
});
export type OpenItemInput = z.infer<typeof CreateSchema>;

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

/** Satırı düzenleme yetkisi: yönetici her sütuna, üye kendi sütununa. */
function canWrite(ctx: { userId: string; role: AppRole }, ownerUserId: string | null) {
  return isAdminRole(ctx.role) || (!!ownerUserId && ownerUserId === ctx.userId);
}

export async function createOpenItem(
  input: OpenItemInput,
): Promise<{ id: string } | { error: string }> {
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const v = parsed.data;
  const ownerUserId = nn(v.owner_user_id);
  if (!canWrite(ctx, ownerUserId)) return { error: NOT_ALLOWED };

  // Sıra: aynı ALT SÜTUNdaki son satırın altına (kişi + rol birlikte).
  const ownerRole = nn(v.owner_role);
  let posQ = supabase
    .from("planning_open_items")
    .select("position")
    .eq("workspace_id", ctx.workspaceId)
    .order("position", { ascending: false })
    .limit(1);
  posQ = ownerUserId
    ? posQ.eq("owner_user_id", ownerUserId)
    : posQ.eq("owner_label", nn(v.owner_label) ?? "Genel").is("owner_user_id", null);
  const { data: last } = await (ownerRole ? posQ.eq("owner_role", ownerRole) : posQ.is("owner_role", null));
  const position = ((last?.[0]?.position as number | undefined) ?? -1) + 1;

  const { data, error } = await supabase
    .from("planning_open_items")
    .insert({
      workspace_id: ctx.workspaceId,
      owner_user_id: ownerUserId,
      owner_label: nn(v.owner_label),
      owner_role: ownerRole,
      text: v.text.trim(),
      category: v.category ?? null,
      position,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/planning");
  return { id: (data as { id: string }).id };
}

const UpdateSchema = z.object({
  text: z.string().min(1).max(2000).optional(),
  category: z.enum(CATEGORIES).optional().nullable(),
});

export async function updateOpenItem(
  itemId: string,
  input: z.infer<typeof UpdateSchema>,
): Promise<{ ok: true } | { error: string }> {
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { data: row } = await supabase
    .from("planning_open_items")
    .select("id, owner_user_id")
    .eq("id", itemId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!row) return { error: NOT_FOUND };
  if (!canWrite(ctx, row.owner_user_id as string | null)) return { error: NOT_ALLOWED };

  const patch: Record<string, unknown> = { updated_by: ctx.userId };
  if (parsed.data.text !== undefined) patch.text = parsed.data.text.trim();
  if (parsed.data.category !== undefined) patch.category = parsed.data.category ?? null;

  const { error } = await supabase
    .from("planning_open_items")
    .update(patch)
    .eq("id", itemId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/planning");
  return { ok: true };
}

/** Tamamlandı işaretle / geri al. */
export async function setOpenItemDone(
  itemId: string,
  done: boolean,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { data: row } = await supabase
    .from("planning_open_items")
    .select("id, owner_user_id")
    .eq("id", itemId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!row) return { error: NOT_FOUND };
  if (!canWrite(ctx, row.owner_user_id as string | null)) return { error: NOT_ALLOWED };

  const { error } = await supabase
    .from("planning_open_items")
    .update({ done, done_at: done ? new Date().toISOString() : null, updated_by: ctx.userId })
    .eq("id", itemId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/planning");
  return { ok: true };
}

export async function deleteOpenItem(
  itemId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { data: row } = await supabase
    .from("planning_open_items")
    .select("id, created_by")
    .eq("id", itemId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!row) return { error: NOT_FOUND };
  if (!isAdminRole(ctx.role) && row.created_by !== ctx.userId) {
    return { error: "Bu satırı yalnız ekleyen kişi veya yönetici silebilir." };
  }

  const { error } = await supabase
    .from("planning_open_items")
    .delete()
    .eq("id", itemId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/planning");
  return { ok: true };
}

/**
 * Açık konuyu gerçek göreve dönüştürür ve sahibine bildirir (task_assigned
 * maili mevcut altyapıdan gider). Yalnız yönetici; sütun sahibi sistemde
 * kullanıcı olmalı ("EF" gibi serbest adlar göreve dönüşemez).
 */
export async function assignOpenItemAsTask(
  itemId: string,
  input: { dueDate?: string | null },
): Promise<{ ok: true; taskId: string } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdminRole(ctx.role)) return { error: "Göreve dönüştürmeyi yalnız yöneticiler yapabilir." };

  const { data: item } = await supabase
    .from("planning_open_items")
    .select("id, text, owner_user_id, owner_label, task_id")
    .eq("id", itemId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!item) return { error: NOT_FOUND };

  /* SAHİP: önce üye, olmazsa CRM kişisi.
     Burada eskiden yalnız owner_user_id'ye bakılıyordu ve dolmamışsa işlem
     "sistemde kayıtlı kullanıcı değil" diyerek reddediliyordu. Ama Aslı
     Hanım'ın Excel'inden gelen sütun sahipleri (Selen Ergül, Gül Özerdekli,
     Kısmet Yalçın…) CRM KİŞİSİ olarak kayıtlı — sonuç: 61 konunun 61'i de
     hiç göreve dönüşemedi. Oysa Pano kişi ızgarası zaten üyeler ∪ CRM
     kişileriyle çalışıyor ve tasks.responsible_contact_id tam bunun için var.
     Üye önceliklidir: yalnız üyenin girişi, bildirimi ve "Bana atananlar"
     merceği vardır. (Aynı çözüm SQL tarafında da var:
     supabase/migrations/20240317000000_open_items_to_board.sql) */
  const label = ((item.owner_label as string | null) ?? "").trim();
  const firstWord = label.split(/\s+/)[0]?.toLowerCase() ?? "";

  let ownerId = item.owner_user_id as string | null;
  if (!ownerId && firstWord) {
    const { data: members } = await supabase
      .from("workspace_members")
      .select("user_id, profiles(id, full_name)")
      .eq("workspace_id", ctx.workspaceId);
    for (const m of (members ?? []) as unknown as {
      user_id: string; profiles: { id: string; full_name: string | null } | { id: string; full_name: string | null }[] | null;
    }[]) {
      const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      const name = (prof?.full_name ?? "").trim().toLowerCase();
      if (!name) continue;
      if (name === label.toLowerCase() || name.split(/\s+/)[0] === firstWord) {
        ownerId = m.user_id;
        break;
      }
    }
  }

  let contactId: string | null = null;
  if (!ownerId && label) {
    const { data: contacts } = await supabase
      .from("workspace_contacts")
      .select("id, name")
      .eq("workspace_id", ctx.workspaceId);
    // Tam eşleşme önce, sonra "etiket kişi adıyla başlıyor" (Selen Ergül → Selen).
    const list = (contacts ?? []) as { id: string; name: string }[];
    const exact = list.find((c) => c.name.trim().toLowerCase() === label.toLowerCase());
    const prefix = list
      .filter((c) => c.name.trim().length >= 3 && label.toLowerCase().startsWith(c.name.trim().toLowerCase() + " "))
      .sort((a, b) => a.name.length - b.name.length)[0];
    const firstNameHit = list.find((c) => c.name.trim().toLowerCase().split(/\s+/)[0] === firstWord);
    contactId = (exact ?? prefix ?? firstNameHit)?.id ?? null;
  }

  if (!ownerId && !contactId) {
    return { error: `"${label || "Bu sütun"}" ne ekipte ne de Kişiler'de bulunamadı — önce kişiyi ekleyin.` };
  }

  const title = (item.text as string).trim();
  const dueDate = (input.dueDate ?? "").match(/^\d{4}-\d{2}-\d{2}$/) ? input.dueDate! : null;
  const today = new Date().toISOString().slice(0, 10);

  let taskId = item.task_id as string | null;
  if (taskId) {
    const { data: existing } = await supabase.from("tasks").select("id").eq("id", taskId).maybeSingle();
    if (existing) {
      const upd = await supabase
        .from("tasks")
        .update({
          title,
          assignee_id: ownerId,
          responsible_contact_id: ownerId ? null : contactId,
          due_date: dueDate,
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
        assignee_id: ownerId,
        responsible_contact_id: ownerId ? null : contactId,
        due_date: dueDate,
        start_date: today,
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (ins.error) return { error: toActionErrorMessage(ins.error) };
    taskId = (ins.data as { id: string }).id;
  }

  await supabase
    .from("planning_open_items")
    .update({ task_id: taskId, updated_by: ctx.userId })
    .eq("id", itemId);

  // Sorumluluk modeli: sahibi katılımcı olarak da yazılır (assignTopicAsTask ile
  // aynı yol — kısıtlı RLS başkasını ekleyen üyeyi reddettiği için service-role).
  const { data: wm } = ownerId
    ? await supabase
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", ctx.workspaceId)
        .eq("user_id", ownerId)
        .maybeSingle()
    : { data: null };
  const memberId = (wm as { id: string } | null)?.id ?? null;
  if (memberId) {
    const { data: existingComps } = await supabase
      .from("task_member_completions")
      .select("member_id")
      .eq("task_id", taskId);
    const have = new Set((existingComps ?? []).map((r) => r.member_id as string));
    if (!have.has(memberId)) {
      const { getAdminClient } = await import("@/lib/supabase/admin");
      const writer = getAdminClient() ?? supabase;
      const { error: partErr } = await writer
        .from("task_member_completions")
        .insert([{ workspace_id: ctx.workspaceId, task_id: taskId, member_id: memberId }]);
      if (partErr) return { error: toActionErrorMessage(partErr) };
    }
  }

  // Bildirim yalnız ÜYEYE gider — CRM kişisinin hesabı yok.
  if (ownerId) {
    const { notifyTaskEvent } = await import("@/lib/notifications/notify");
    await notifyTaskEvent(supabase, {
      workspaceId: ctx.workspaceId,
      taskId,
      event: "task_assigned",
      taskTitle: title,
      recipientUserIds: [ownerId],
      actorId: ctx.userId,
    });
  }

  revalidatePath("/planning");
  revalidatePath("/board");
  revalidatePath("/list");
  return { ok: true, taskId };
}
