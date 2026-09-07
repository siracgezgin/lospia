// ---------------------------------------------------------------------------
// Notification → email bridge
// ---------------------------------------------------------------------------
// notifyTaskEvent owns in-app recipient resolution (actor/self exclusion +
// admin_only + dedupe). This module handles EMAIL, which has different rules:
// a mail must reach the recipient even when they ARE the actor (a person who
// assigns a task to themselves should still get the mail). It is therefore
// handed a recipient list that has NOT had the actor stripped, applies the
// email-specific resolver (notification_email → profiles.email, skip
// placeholders / disabled / cross-workspace), and dispatches best-effort mail.
//
// Only two events are wired for email (the whitelist lives in notify.ts):
//   • task_assigned              → "yeni bir görev atandı"
//   • task_responsibility_added  → "bir görev sorumluluğu verildi"
//
// SECURITY: server-only. The browser guard hard-fails if this ever reaches the
// client bundle.

import { sendEmail } from "@/lib/email/send-email";
import { taskAssignedEmail } from "@/lib/email/templates/task-assigned";
import { meetingTimeLabel } from "@/lib/email/templates/meeting-invite";
import { createClient } from "@/lib/supabase/server";
import { normalizeSlot, toIstanbulTime } from "@/lib/planning/timezones";
import { taskResponsibilityAddedEmail } from "@/lib/email/templates/task-responsibility-added";
import { PRIORITY_LABELS } from "@/lib/utils/task-constants";
import {
  resolveEmailRecipients,
  maskEmail,
  type ResolvedEmailRecipient,
  type SkippedEmailRecipient,
} from "@/lib/notifications/email-recipients";
import type { SendEmailResult } from "@/lib/email/types";

if (typeof window !== "undefined") {
  throw new Error("lib/notifications/email-events.ts must never be imported in the browser");
}

// Fallback matches the AF pilot host. EMAIL_TASK_BASE_URL overrides it.
const DEFAULT_TASK_BASE_URL = "https://operasyon.aslifilinta.com";

/** Events that produce an e-mail, mapped to their template builder. */
export type EmailTaskEvent = "task_assigned" | "task_responsibility_added";

const TEMPLATE: Record<EmailTaskEvent, typeof taskAssignedEmail> = {
  task_assigned: taskAssignedEmail,
  task_responsibility_added: taskResponsibilityAddedEmail,
};

/**
 * Resolve emails for the (actor-inclusive) recipient list and dispatch one mail
 * per person. Best-effort: a mail failure never propagates — the in-app
 * notification is the source of truth, email is a bonus.
 */
export async function dispatchTaskEmails(params: {
  event: EmailTaskEvent;
  workspaceId: string;
  recipientUserIds: string[];
  taskId: string | null;
  taskTitle: string | null;
  /** Optional meta — enriches the mail when the caller has it at hand. */
  actorName?: string | null;
  /** ARTIK MAİLE GİRMEZ (2026-09-07: "son tarih diye bir şey yok"). Çağıranlar
   *  hâlâ geçiyor; imza korunuyor ki her çağrı yeri değişmek zorunda kalmasın. */
  dueDate?: string | null;
  priority?: string | null;
}): Promise<void> {
  const { event, workspaceId, recipientUserIds, taskId, taskTitle, actorName, priority } = params;

  // Cheap short-circuits before touching the DB.
  if (process.env.EMAIL_NOTIFICATIONS_ENABLED !== "true") return;
  if (!taskId || recipientUserIds.length === 0) return;

  const { recipients, skipped } = await resolveEmailRecipients({ workspaceId, recipientUserIds });

  for (const s of skipped) logSkip(event, taskId, s);
  if (recipients.length === 0) return;

  const baseUrl = process.env.EMAIL_TASK_BASE_URL ?? DEFAULT_TASK_BASE_URL;
  const title = taskTitle ?? "Görev";
  const build = TEMPLATE[event];
  const priorityLabel = priority
    ? ((PRIORITY_LABELS as Record<string, string>)[priority] ?? null)
    : null;

  /* TOPLANTI ZAMANI — "son tarih"in yerini alan satır.
     Aslı Hanım (2026-09-07): "Artık son tarih diye bir şey yok — direkt
     toplantı tarihi, Türkiye saati ve parantezde NY saati."
     Görev bir toplantı konusundan doğduysa (planning_topics.task_id) o
     toplantının gün ve saati okunur. Doğmadıysa satır hiç yazılmaz; `dueDate`
     artık maile GİRMEZ. */
  const meeting = await resolveMeetingTime(taskId);

  // One mail per recipient — never reveal other recipients in To.
  for (const r of recipients) {
    let result: SendEmailResult;
    try {
      result = await sendEmail(
        build({
          to: r.email,
          taskTitle: title,
          taskId,
          baseUrl,
          recipientName: r.fullName,
          actorName: actorName ?? null,
          meetingDateLabel: meeting?.dateLabel ?? null,
          meetingTimeLabel: meeting?.timeLabel ?? null,
          priorityLabel,
        }),
      );
    } catch (err) {
      // best-effort: swallow so one bad recipient can't block the rest
      result = { status: "error", error: err instanceof Error ? err.message : String(err) };
    }
    logSend(event, taskId, r, result);
  }
}

/**
 * Görevin doğduğu toplantının gün ve saati.
 *
 * `planning_topics.task_id` konuyu göreve bağlar; toplantı da konunun
 * üstündedir. Bağ yoksa (elle açılmış görev) null döner ve mailde zaman satırı
 * hiç çizilmez.
 *
 * Saat kaydı NEW YORK'tur; Türkiye saati hesaplanır ve ÖNE yazılır — maili
 * okuyan kişi İstanbul'dadır.
 */
async function resolveMeetingTime(
  taskId: string,
): Promise<{ dateLabel: string; timeLabel: string | null } | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("planning_topics")
      .select("planning_meetings(meeting_date, time_slot)")
      .eq("task_id", taskId)
      .limit(1)
      .maybeSingle();
    const raw = (data as { planning_meetings?: { meeting_date: string; time_slot: string } | { meeting_date: string; time_slot: string }[] | null } | null)?.planning_meetings;
    const m = Array.isArray(raw) ? raw[0] : raw;
    if (!m?.meeting_date) return null;

    const dateIso = String(m.meeting_date).slice(0, 10);
    const dateLabel = formatTrDate(dateIso);
    if (!dateLabel) return null;

    const slot = normalizeSlot(m.time_slot ?? "");
    const ist = toIstanbulTime(dateIso, slot);
    const istLabel = ist ? (ist.dayShift === 0 ? ist.time : `${ist.time} (+1 gün)`) : null;
    return { dateLabel, timeLabel: meetingTimeLabel(istLabel, slot || null) };
  } catch {
    // Mail yan iştir: çözümlenemezse zaman satırsız gider, akış durmaz.
    return null;
  }
}

/** "2026-07-28" → "28 Temmuz 2026 Salı". Time parts are dropped; invalid → null. */
function formatTrDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
  }).format(date);
}

// ── Safe logging ─────────────────────────────────────────────────────────────
// Structured, non-sensitive fields only: event, taskId, recipient user id,
// email source, masked address, send status. No tokens, no full addresses,
// no task body.

function logSend(
  event: EmailTaskEvent,
  taskId: string,
  r: ResolvedEmailRecipient,
  result: SendEmailResult,
): void {
  console.info(
    "[email] send",
    JSON.stringify({
      event,
      taskId,
      recipientUserId: r.userId,
      source: r.source,
      email: maskEmail(r.email),
      status: result.status,
    }),
  );
}

function logSkip(event: EmailTaskEvent, taskId: string, s: SkippedEmailRecipient): void {
  console.info(
    "[email] skip",
    JSON.stringify({
      event,
      taskId,
      recipientUserId: s.userId,
      reason: s.reason,
    }),
  );
}
