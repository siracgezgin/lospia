// ---------------------------------------------------------------------------
// Notification → email bridge
// ---------------------------------------------------------------------------
// notifyTaskEvent owns recipient resolution and the admin_only/actor/dedupe
// filtering. This module does NOT re-derive recipients — it is handed the final
// filtered user-id list and simply resolves each one's email and dispatches a
// best-effort mail. Only task_assigned is wired for email in this phase.
//
// SECURITY: server-only. Resolving profiles.email uses the service-role admin
// client (notifications RLS only lets a user read their own rows). Browser
// guard hard-fails if this ever reaches the client bundle.

import { getAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send-email";
import { taskAssignedEmail } from "@/lib/email/templates/task-assigned";

if (typeof window !== "undefined") {
  throw new Error("lib/notifications/email-events.ts must never be imported in the browser");
}

// Fallback matches the AF pilot host. EMAIL_TASK_BASE_URL overrides it.
const DEFAULT_TASK_BASE_URL = "https://operasyon.aslifilinta.com";

/**
 * Send a task-assigned email to each already-filtered recipient. Best-effort:
 * a mail failure never propagates — the in-app notification is the source of
 * truth, email is a bonus.
 */
export async function dispatchTaskAssignedEmails(params: {
  recipientUserIds: string[];
  taskId: string | null;
  taskTitle: string | null;
}): Promise<void> {
  const { recipientUserIds, taskId, taskTitle } = params;

  // Cheap short-circuits before touching the DB.
  if (process.env.EMAIL_NOTIFICATIONS_ENABLED !== "true") return;
  if (!taskId || recipientUserIds.length === 0) return;

  const admin = getAdminClient();
  if (!admin) return;

  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, email")
    .in("id", recipientUserIds);
  if (error || !profiles) return;

  const baseUrl = process.env.EMAIL_TASK_BASE_URL ?? DEFAULT_TASK_BASE_URL;
  const title = taskTitle ?? "Görev";

  // One mail per recipient — never reveal other recipients in To.
  for (const profile of profiles) {
    const email = (profile as { email: string | null }).email;
    if (!email) continue; // profiles.email missing → skip this recipient
    try {
      await sendEmail(taskAssignedEmail({ to: email, taskTitle: title, taskId, baseUrl }));
    } catch {
      // best-effort: swallow so one bad recipient can't block the rest
    }
  }
}
