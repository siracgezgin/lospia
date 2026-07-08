// ---------------------------------------------------------------------------
// Central notification producer
// ---------------------------------------------------------------------------
// All task notifications flow through `notifyTaskEvent`. It resolves the
// Turkish title for the event, attaches the task title (plus an optional
// suffix) as the body, drops the actor + duplicate recipients, and hands the
// insert to a SECURITY DEFINER RPC.
//
// Why an RPC and not a plain insert?  The notifications RLS *select* policy is
// `user_id = auth.uid()`, so a server action can never *read* another user's
// rows — which means the old app-layer dedupe (a SELECT over the recipients)
// silently matched nothing and let duplicates through. `create_task_notifications`
// runs as definer, so its dedupe check sees every recipient's recent rows and
// the guard actually works (and is race-safe, since check + insert are atomic).

import type { createClient } from "@/lib/supabase/server";
import {
  NOTIFICATION_EVENTS,
  type TaskNotificationEvent,
} from "@/lib/notifications/events";
import { dispatchTaskAssignedEmails } from "@/lib/notifications/email-events";

type SB = Awaited<ReturnType<typeof createClient>>;

// A recipient who already received the same (task, type, title) within this
// window is skipped. Genuinely new events (a task re-entering review the next
// day, a reopen→done cycle) fall outside the window and still notify.
const DEDUPE_SECONDS = 300; // 5 minutes

interface NotifyTaskEventArgs {
  workspaceId: string;
  taskId: string | null;
  /** Profile ids to notify. Null/empty entries and the actor are dropped. */
  recipientUserIds: Array<string | null | undefined>;
  event: TaskNotificationEvent;
  taskTitle: string | null;
  /** The person who triggered the event — never notified about their own action. */
  actorId?: string | null;
  /** Short Turkish suffix appended to the body (e.g. " · +12 puan"). */
  bodySuffix?: string;
}

export async function notifyTaskEvent(
  sb: SB,
  args: NotifyTaskEventArgs,
): Promise<void> {
  const { workspaceId, taskId, event, taskTitle, actorId, bodySuffix } = args;

  let recipients = Array.from(
    new Set(args.recipientUserIds.filter((id): id is string => !!id)),
  ).filter((id) => id !== actorId);
  if (recipients.length === 0) return;

  // Admin_only tasks never notify non-admins. RLS already hides such rows from
  // members, but we also refuse to write them — keeping the notifications table
  // free of leaked titles/bodies for hidden tasks. This is the single chokepoint
  // every task notification flows through.
  if (taskId) {
    const { data: task } = await sb
      .from("tasks")
      .select("visibility")
      .eq("id", taskId)
      .maybeSingle();
    if (task?.visibility === "admin_only") {
      const { data: admins } = await sb
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspaceId)
        .in("user_id", recipients)
        .in("role", ["owner", "admin"]);
      const allowed = new Set((admins ?? []).map((a) => a.user_id as string));
      recipients = recipients.filter((id) => allowed.has(id));
      if (recipients.length === 0) return;
    }
  }

  const { dbType, title } = NOTIFICATION_EVENTS[event];
  const base = taskTitle ?? "";
  const body = bodySuffix ? `${base}${bodySuffix}` : base;

  await sb.rpc("create_task_notifications", {
    p_workspace_id: workspaceId,
    p_task_id: taskId,
    p_type: dbType,
    p_title: title,
    p_body: body || null,
    p_user_ids: recipients,
    p_dedupe_seconds: DEDUPE_SECONDS,
  });

  // Best-effort email fan-out over the SAME final recipient list (actor and
  // admin_only exclusions already applied above). Only task_assigned is wired
  // for email in this phase; any failure is swallowed so mail can never break
  // the notification flow.
  if (event === "task_assigned") {
    try {
      await dispatchTaskAssignedEmails({ recipientUserIds: recipients, taskId, taskTitle });
    } catch {
      // best-effort — never surface email errors to the caller
    }
  }
}
