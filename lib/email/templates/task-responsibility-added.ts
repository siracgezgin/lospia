// Task-responsibility template — sent to a person added as a responsible
// participant on a task (the CreateTaskModal → participant_member_ids flow).
// Layout + escaping live in buildTaskEventEmail; this file owns only the copy.

import type { EmailMessage } from "../types";
import { EMAIL_BRAND_FOOTER_NAME } from "./shared";
import { buildTaskEventEmail, type TaskEventEmailParams } from "./task-event";

export function taskResponsibilityAddedEmail(params: TaskEventEmailParams): EmailMessage {
  return buildTaskEventEmail(params, {
    heading: "Bir görevin sorumluluğu size verildi",
    leadFallback: "Bir görevin sorumluluğu size verildi. Detaylar aşağıdadır:",
    leadWithActor: (actor) =>
      `${actor} sizi bir görevin sorumluları arasına ekledi. Detaylar aşağıdadır:`,
    subject: (title) => `Görev sorumluluğu: ${title} — ${EMAIL_BRAND_FOOTER_NAME}`,
  });
}
