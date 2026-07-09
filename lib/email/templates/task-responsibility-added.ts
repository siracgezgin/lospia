// Task-responsibility template — sent to a person added as a responsible
// participant on a task (the CreateTaskModal → participant_member_ids flow).
//
// Deliberately minimal: it links to the task but shows NO note/comment content,
// CRM data, or other sensitive workspace data in the body. Just the title and a
// link back into the app.

import type { EmailMessage } from "../types";
import {
  renderButton,
  renderEmailShell,
  renderHeading,
  renderParagraph,
} from "./shared";

export function taskResponsibilityAddedEmail(params: {
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
    "Size bir görev sorumluluğu verildi.",
    "",
    `Görev: ${taskTitle}`,
    `Görevi görüntüle: ${url}`,
    "",
    "—",
    "Lospia",
  ].join("\n");

  const html = renderEmailShell({
    title: "Size bir görev sorumluluğu verildi",
    bodyHtml: [
      renderHeading("Size bir görev sorumluluğu verildi"),
      renderParagraph(`Görev: ${taskTitle}`),
      renderButton(url, "Görevi görüntüle"),
    ].join("\n"),
  });

  return {
    to,
    subject: `Lospia'da size bir görev sorumluluğu verildi — ${taskTitle}`,
    text,
    html,
  };
}
