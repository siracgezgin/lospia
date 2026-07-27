// Task-assigned template — sent to a person who was assigned a task.
// Layout + escaping live in buildTaskEventEmail; this file owns only the copy.

import type { EmailMessage } from "../types";
import { EMAIL_BRAND_FOOTER_NAME } from "./shared";
import { buildTaskEventEmail, type TaskEventEmailParams } from "./task-event";

export function taskAssignedEmail(params: TaskEventEmailParams): EmailMessage {
  return buildTaskEventEmail(params, {
    heading: "Size yeni bir görev atandı",
    leadFallback: "Size yeni bir görev atandı. Detaylar aşağıdadır:",
    leadWithActor: (actor) => `${actor} size yeni bir görev atadı. Detaylar aşağıdadır:`,
    subject: (title) => `Yeni görev: ${title} — ${EMAIL_BRAND_FOOTER_NAME}`,
  });
}
