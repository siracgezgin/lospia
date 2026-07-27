// Shared builder for the two task-event mails (assigned / responsibility).
// One place owns the professional layout — greeting with the recipient's name,
// actor-aware lead sentence, a detail card (task / due date / priority), the
// CTA button and a plain-URL fallback. The two public templates only differ in
// copy and subject.
//
// Deliberately minimal data surface: NO note/comment content, CRM data, or
// other sensitive workspace data — just the title, the meta rows and a link
// back into the app. All user-derived strings are escaped by the helpers.

import type { EmailMessage } from "../types";
import {
  EMAIL_BRAND_FOOTER_NAME,
  renderButton,
  renderDetailCard,
  renderDetailRow,
  renderEmailShell,
  renderFallbackLink,
  renderHeading,
  renderParagraph,
} from "./shared";

export interface TaskEventEmailParams {
  to: string;
  taskTitle: string;
  taskId: string;
  baseUrl: string;
  /** Recipient display name ("Ayşe Yılmaz") — greeting falls back to "Merhaba,". */
  recipientName?: string | null;
  /** Who triggered the event — makes the lead sentence personal when known. */
  actorName?: string | null;
  /** Pre-formatted Turkish due date ("28 Temmuz 2026 Salı"). */
  dueDateLabel?: string | null;
  /** Turkish priority label ("Yüksek"). */
  priorityLabel?: string | null;
}

interface TaskEventCopy {
  /** Card heading + <title>, e.g. "Size yeni bir görev atandı". */
  heading: string;
  /** Lead sentence when the actor is unknown. */
  leadFallback: string;
  /** Lead sentence builder when the actor IS known. Receives the plain name. */
  leadWithActor: (actorName: string) => string;
  /** Subject builder. Receives the plain task title. */
  subject: (taskTitle: string) => string;
}

export function buildTaskEventEmail(
  params: TaskEventEmailParams,
  copy: TaskEventCopy,
): EmailMessage {
  const { to, taskTitle, taskId, baseUrl, recipientName, actorName, dueDateLabel, priorityLabel } =
    params;
  const url = `${baseUrl.replace(/\/+$/, "")}/tasks/${taskId}`;

  const greeting = recipientName?.trim() ? `Sayın ${recipientName.trim()},` : "Merhaba,";
  const lead = actorName?.trim() ? copy.leadWithActor(actorName.trim()) : copy.leadFallback;

  const detailPairs: Array<[string, string]> = [["Görev", taskTitle]];
  if (dueDateLabel?.trim()) detailPairs.push(["Son tarih", dueDateLabel.trim()]);
  if (priorityLabel?.trim()) detailPairs.push(["Öncelik", priorityLabel.trim()]);

  const text = [
    greeting,
    "",
    lead,
    "",
    ...detailPairs.map(([label, value]) => `${label}: ${value}`),
    "",
    `Görevi görüntüle: ${url}`,
    "",
    "İyi çalışmalar,",
    EMAIL_BRAND_FOOTER_NAME,
  ].join("\n");

  const html = renderEmailShell({
    title: copy.heading,
    preheader: `${lead} ${taskTitle}`,
    bodyHtml: [
      renderHeading(copy.heading),
      renderParagraph(greeting),
      renderParagraph(lead),
      renderDetailCard(
        detailPairs.map(([label, value]) => renderDetailRow(label, value)).join("\n"),
      ),
      renderButton(url, "Görevi görüntüle"),
      renderFallbackLink(url),
    ].join("\n"),
  });

  return { to, subject: copy.subject(taskTitle), text, html };
}
