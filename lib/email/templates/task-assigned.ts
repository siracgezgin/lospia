// Task-assigned template — sent to a person who was assigned a task.
//
// Deliberately minimal: it links to the task but shows NO note/comment content,
// CRM data, or other sensitive workspace data in the body. Just the title and a
// link back into the app.

import type { EmailMessage } from "../types";

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
    "Lospia",
  ].join("\n");

  return {
    to,
    subject: `Lospia'da size yeni bir görev atandı — ${taskTitle}`,
    text,
  };
}
