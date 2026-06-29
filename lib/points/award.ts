import type { createClient } from "@/lib/supabase/server";
import { logTaskActivity, ACTIVITY_ACTIONS } from "@/lib/activity/log-task-activity";
import type { TaskStatus } from "@/types";

type SB = Awaited<ReturnType<typeof createClient>>;

type FinalizeResult = {
  awarded?: { user_id: string; points: number }[];
  skipped_self?: string | null;
  points_value?: number;
  error?: string;
};

type RevokeResult = {
  revoked?: { user_id: string; points: number }[];
  error?: string;
};

/**
 * Reconcile a task's points with a status transition. Call this AFTER the task
 * row has been updated to its new status (the SECURITY DEFINER functions read
 * the task's live status as a guard).
 *
 *  • → done   : finalise points for responsible participants (idempotent).
 *               The approver is never auto-awarded (self-approval guard) — we
 *               log that separately instead.
 *  • done → … : revoke previously-earned points with negative ledger rows.
 *
 * All ledger writes happen inside finalize_task_points / revoke_task_points;
 * here we only fan out the activity log + per-user notifications.
 */
export async function applyPointsForStatusTransition(
  sb: SB,
  opts: {
    taskId: string;
    workspaceId: string;
    from: TaskStatus;
    to: TaskStatus;
    actorId: string;
    title: string;
  },
): Promise<void> {
  const { taskId, workspaceId, from, to, actorId, title } = opts;
  if (from === to) return;

  if (from !== "done" && to === "done") {
    const { data } = await sb.rpc("finalize_task_points", { p_task_id: taskId });
    const res = (data ?? {}) as FinalizeResult;
    if (res.error) return;

    for (const a of res.awarded ?? []) {
      await logTaskActivity(sb, {
        workspaceId, taskId, actorId,
        action: ACTIVITY_ACTIONS.POINTS_FINALIZED,
        metadata: { user_id: a.user_id, points: a.points },
      });
      // Only the recipient is told — and only about their OWN points.
      await sb.from("notifications").insert({
        workspace_id: workspaceId, user_id: a.user_id, type: "task_status_changed",
        title: "Bir göreviniz onaylandı. Puanınız güncellendi.",
        body: `${title} · +${a.points} puan`, task_id: taskId,
      } as Record<string, unknown>);
    }

    if (res.skipped_self) {
      await logTaskActivity(sb, {
        workspaceId, taskId, actorId,
        action: ACTIVITY_ACTIONS.POINTS_SELF_APPROVAL_SKIPPED,
        metadata: { user_id: res.skipped_self },
      });
    }
  } else if (from === "done" && to !== "done") {
    const { data } = await sb.rpc("revoke_task_points", { p_task_id: taskId });
    const res = (data ?? {}) as RevokeResult;
    if (res.error) return;

    for (const a of res.revoked ?? []) {
      await logTaskActivity(sb, {
        workspaceId, taskId, actorId,
        action: ACTIVITY_ACTIONS.POINTS_REVOKED,
        metadata: { user_id: a.user_id, points: a.points },
      });
      await sb.from("notifications").insert({
        workspace_id: workspaceId, user_id: a.user_id, type: "task_status_changed",
        title: "Bir göreviniz yeniden açıldı. Puanınız güncellendi.",
        body: title, task_id: taskId,
      } as Record<string, unknown>);
    }
  }
}
