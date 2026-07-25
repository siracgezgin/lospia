// Task-assigned template — sent to a person who was assigned a task.
//
// Deliberately minimal: it links to the task but shows NO note/comment content,
// CRM data, or other sensitive workspace data in the body. Just the title and a
// link back into the app.

import type { EmailMessage } from "../types";
import {
  EMAIL_BRAND_FOOTER_NAME,
  renderButton,
  renderEmailShell,
  renderHeading,
  renderParagraph,
} from "./shared";

export function taskAssignedEmail(params: {
  to: string;
  taskTitle: string;
  taskId: string;
  baseUrl: string;
}): EmailMessage {
  const { to, taskTitle, taskId, baseUrl } = params;
  const url = `${baseUrl.replace(/\/+$/, "")}/tasks/${taskId}`;

  const text = [
    "Merhaba,",
    "",
    "Size yeni bir görev atandı.",
    `Görev: ${taskTitle}`,
    `Görevi görüntüle: ${url}`,
    "",
    "—",
    EMAIL_BRAND_FOOTER_NAME,
  ].join("\n");

  const html = renderEmailShell({
    title: "Size yeni bir görev atandı",
    bodyHtml: [
      renderHeading("Size yeni bir görev atandı"),
      renderParagraph(`Görev: ${taskTitle}`),
      renderButton(url, "Görevi görüntüle"),
    ].join("\n"),
  });

  return {
    to,
    subject: `${EMAIL_BRAND_FOOTER_NAME}'da size yeni bir görev atandı — ${taskTitle}`,
    text,
    html,
  };
}
