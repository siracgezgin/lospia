"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage, isMissingSchemaError } from "@/lib/utils/supabase-errors";
import { notifyTaskEvent } from "@/lib/notifications/notify";
import { logTaskActivity, ACTIVITY_ACTIONS } from "@/lib/activity/log-task-activity";

/**
 * KADEMELİ KONTROL ZİNCİRİ (20240341).
 *
 * Aslı Hanım (2026-09-07): "Gül'ün yaptığını sen kontrol et. Senin yaptığını
 * Gül kontrol etsin. İkinizin yaptığını Nisa kontrol etsin. ONDAN SONRA BANA
 * GELSİN… Böylece bana gelene kadar zaten bitirmiş olursunuz."
 *
 * Zincir görev DURUMUNU değiştirmez. 'done' hâlâ yalnız yöneticinindir; buradan
 * çıkan şey GÖRÜNÜRLÜK ve SIRA: kim kontrol etti, sıra kimde, kim bekliyor.
 */

const AUTH_REQUIRED = "Kimlik doğrulama gerekli.";
const ADMIN_ONLY = "Kontrol kuyruğunu yalnız yöneticiler düzenleyebilir.";
const SETUP_PENDING = "Kontrol zinciri için veritabanı güncellemesi bekleniyor (20240341).";
const NOT_FOUND = "Kontrol adımı bulunamadı.";

const isAdminRole = (r: AppRole) => r === "owner" || r === "admin";

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

/* ── Çalışma alanının SABİT kuyruğu (Nisa → Aslı) ───────────────────────── */

export async function setReviewChain(
  reviewerIds: string[],
): Promise<{ ok: true } | { error: string }> {
  const parsed = z.array(z.string().min(1).max(64)).max(10).safeParse(reviewerIds);
  if (!parsed.success) return { error: "Geçersiz kontrol kuyruğu." };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdminRole(ctx.role)) return { error: ADMIN_ONLY };

  // Aynı kişi kuyrukta bir kez; sıra verilen sıradır.
  const unique = [...new Set(parsed.data)];

  const del = await supabase
    .from("workspace_review_chain")
    .delete()
    .eq("workspace_id", ctx.workspaceId);
  if (del.error) {
    if (isMissingSchemaError(del.error)) return { error: SETUP_PENDING };
    return { error: toActionErrorMessage(del.error) };
  }

  if (unique.length) {
    const { error } = await supabase.from("workspace_review_chain").insert(
      unique.map((reviewer_id, position) => ({
        workspace_id: ctx.workspaceId, position, reviewer_id,
      })),
    );
    if (error) return { error: toActionErrorMessage(error) };
  }
  revalidatePath("/settings");
  return { ok: true };
}

/* ── Görevi kontrole gönder ─────────────────────────────────────────────── */

/**
 * İşi bitiren kişi görevi kontrole atar.
 *
 * Adımlar: [çapraz kontrolcü?] + çalışma alanının sabit kuyruğu.
 * Gönderen kişi kendi işini kontrol edemez — listeden düşer ("Gül'ün yaptığını
 * SEN kontrol et"). Kuyruk boşsa ve çapraz kontrolcü de seçilmediyse görev
 * eskisi gibi doğrudan yöneticinin onayına kalır.
 */
export async function sendTaskToReview(
  taskId: string,
  opts: { peerReviewerId?: string | null } = {},
): Promise<{ ok: true; steps: number } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { data: task } = await supabase
    .from("tasks")
    .select("id, title, workspace_id, status, assignee_id")
    .eq("id", taskId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!task) return { error: "Görev bulunamadı." };

  const { data: chainRows, error: chainErr } = await supabase
    .from("workspace_review_chain")
    .select("reviewer_id, position")
    .eq("workspace_id", ctx.workspaceId)
    .order("position", { ascending: true });
  if (chainErr && isMissingSchemaError(chainErr)) return { error: SETUP_PENDING };

  const chain = ((chainRows ?? []) as { reviewer_id: string }[]).map((r) => r.reviewer_id);
  const peer = nn(opts.peerReviewerId);
  /* Sıra: önce çapraz kontrolcü, sonra sabit kuyruk. Gönderen kendi işini
     onaylamaz; yinelenen kişi bir kez geçer. */
  const ordered = [...new Set([...(peer ? [peer] : []), ...chain])].filter((id) => id !== ctx.userId);

  // Eski adımlar temizlenir: görev ikinci kez kontrole giriyorsa zincir baştan.
  const del = await supabase.from("task_review_steps").delete().eq("task_id", taskId);
  if (del.error && isMissingSchemaError(del.error)) return { error: SETUP_PENDING };

  if (ordered.length) {
    const { error } = await supabase.from("task_review_steps").insert(
      ordered.map((reviewer_id, position) => ({
        workspace_id: ctx.workspaceId, task_id: taskId, position, reviewer_id,
      })),
    );
    if (error) return { error: toActionErrorMessage(error) };
  }

  const previousStatus = task.status as string;
  const upd = await supabase
    .from("tasks")
    .update({ status: "review" })
    .eq("id", taskId)
    .eq("workspace_id", ctx.workspaceId);
  if (upd.error) return { error: toActionErrorMessage(upd.error) };

  /* DENETİM İZİ. Durum burada doğrudan yazıldığı için updateTask'ın kendi
     kaydı çalışmaz; aynı satırı bu akış da bırakmalı, yoksa görev "kendiliğinden
     kontrole geçmiş" gibi görünür (bkz. completions.ts'teki aynı desen). */
  if (previousStatus !== "review") {
    await logTaskActivity(supabase, {
      workspaceId: ctx.workspaceId, taskId, actorId: ctx.userId,
      action: ACTIVITY_ACTIONS.STATUS_CHANGED,
      oldValue: previousStatus, newValue: "review",
    });
  }

  if (ordered.length) {
    /* SIRA KİMDEYSE YALNIZ ONA HABER GİDER. Aslı Hanım'ın istediği şey tam
       olarak buydu: "Böylece BANA GELENE KADAR zaten bitirmiş olursunuz."
       Zincirin tamamına (ve yöneticilere) baştan bildirim atmak, AF'yi işin
       ilk adımında masaya çağırırdı. */
    await notifyTaskEvent(supabase, {
      workspaceId: ctx.workspaceId,
      taskId,
      taskTitle: task.title as string,
      actorId: ctx.userId,
      event: "task_review_your_turn",
      recipientUserIds: [ordered[0]],
    });
  } else {
    /* Zincir kurulmamışsa ESKİ DAVRANIŞ sürer: görev doğrudan yöneticilerin
       onayına düşer ve onlar haber alır. */
    const { data: admins } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", ctx.workspaceId)
      .in("role", ["owner", "admin"]);
    await notifyTaskEvent(supabase, {
      workspaceId: ctx.workspaceId,
      taskId,
      taskTitle: task.title as string,
      actorId: ctx.userId,
      event: "task_review_requested",
      recipientUserIds: (admins ?? []).map((a) => a.user_id as string),
    });
  }

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/board");
  return { ok: true, steps: ordered.length };
}

/* ── Onayla / geri gönder ───────────────────────────────────────────────── */

async function loadSteps(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  taskId: string,
) {
  const { data, error } = await supabase
    .from("task_review_steps")
    .select("id, position, reviewer_id, approved_at")
    .eq("workspace_id", workspaceId)
    .eq("task_id", taskId)
    .order("position", { ascending: true });
  return { rows: (data ?? []) as { id: string; position: number; reviewer_id: string; approved_at: string | null }[], error };
}

export async function approveReviewStep(
  stepId: string,
  note?: string | null,
): Promise<{ ok: true; nextReviewerId: string | null } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { data: step } = await supabase
    .from("task_review_steps")
    .select("id, task_id, reviewer_id, approved_at, position")
    .eq("id", stepId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!step) return { error: NOT_FOUND };
  const s = step as { id: string; task_id: string; reviewer_id: string; approved_at: string | null; position: number };
  if (s.approved_at) return { error: "Bu adım zaten onaylanmış." };
  if (s.reviewer_id !== ctx.userId && !isAdminRole(ctx.role)) {
    return { error: "Bu adımı yalnız kontrolcüsü onaylayabilir." };
  }

  /* SIRA ÖNEMLİ. "İkinizin yaptığını Nisa kontrol etsin, ONDAN SONRA bana
     gelsin" — Nisa'dan önce AF onaylarsa kademe atlanmış olur. */
  const { rows } = await loadSteps(supabase, ctx.workspaceId, s.task_id);
  const firstPending = rows.find((r) => !r.approved_at);
  if (firstPending && firstPending.id !== s.id) {
    return { error: "Sıra sizde değil — önceki kontrolün tamamlanması gerekiyor." };
  }

  const { error } = await supabase
    .from("task_review_steps")
    .update({ approved_at: new Date().toISOString(), note: nn(note) })
    .eq("id", stepId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };

  // Sırayı devral: bir sonraki kontrolcüye haber.
  const next = rows.find((r) => !r.approved_at && r.id !== s.id) ?? null;
  if (next) {
    const { data: task } = await supabase
      .from("tasks").select("title").eq("id", s.task_id).maybeSingle();
    await notifyTaskEvent(supabase, {
      workspaceId: ctx.workspaceId,
      taskId: s.task_id,
      taskTitle: (task?.title as string) ?? "Görev",
      actorId: ctx.userId,
      event: "task_review_your_turn",
      recipientUserIds: [next.reviewer_id],
    });
  }

  revalidatePath(`/tasks/${s.task_id}`);
  revalidatePath("/board");
  return { ok: true, nextReviewerId: next?.reviewer_id ?? null };
}

/**
 * GERİ GÖNDER — kontrolcü işi eksik buldu.
 *
 * Aslı Hanım'ın amacı hatanın KENDİSİNE gelmeden yakalanması; geri gönderme o
 * yüzden ceza değil akışın parçası. Görev "devam ediyor"a döner, zincir
 * sıfırlanır (yeniden gönderilince baştan kurulur) ve NOT ZORUNLUDUR — "eksik"
 * demek yetmez, neyin eksik olduğu yazılmalı.
 */
export async function returnTaskFromReview(
  taskId: string,
  note: string,
): Promise<{ ok: true } | { error: string }> {
  const trimmed = (note ?? "").trim();
  if (!trimmed) return { error: "Geri gönderirken neyin eksik olduğunu yazın." };
  if (trimmed.length > 2000) return { error: "Not çok uzun." };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { data: task } = await supabase
    .from("tasks")
    .select("id, title, assignee_id")
    .eq("id", taskId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!task) return { error: "Görev bulunamadı." };

  const { rows } = await loadSteps(supabase, ctx.workspaceId, taskId);
  const mine = rows.find((r) => r.reviewer_id === ctx.userId && !r.approved_at);
  if (!mine && !isAdminRole(ctx.role)) {
    return { error: "Bu görevi geri gönderme yetkiniz yok." };
  }

  const del = await supabase.from("task_review_steps").delete().eq("task_id", taskId);
  if (del.error) return { error: toActionErrorMessage(del.error) };

  const upd = await supabase
    .from("tasks")
    .update({ status: "in_progress" })
    .eq("id", taskId)
    .eq("workspace_id", ctx.workspaceId);
  if (upd.error) return { error: toActionErrorMessage(upd.error) };

  await logTaskActivity(supabase, {
    workspaceId: ctx.workspaceId, taskId, actorId: ctx.userId,
    action: ACTIVITY_ACTIONS.STATUS_CHANGED,
    oldValue: "review", newValue: "in_progress",
  });

  const assignee = (task.assignee_id as string | null) ?? null;
  if (assignee) {
    await notifyTaskEvent(supabase, {
      workspaceId: ctx.workspaceId,
      taskId,
      taskTitle: `${task.title as string} — ${trimmed}`,
      actorId: ctx.userId,
      event: "task_review_returned",
      recipientUserIds: [assignee],
    });
  }

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/board");
  return { ok: true };
}
