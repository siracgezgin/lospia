import type { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Canonical action identifiers stored in `task_activity_logs.action`.
 * Keep these in sync with the UI message builder in
 * `components/task/activity-messages.ts`.
 */
export const ACTIVITY_ACTIONS = {
  TASK_CREATED: "task_created",
  TITLE_CHANGED: "title_changed",
  DESCRIPTION_CHANGED: "description_changed",
  STATUS_CHANGED: "status_changed",
  PRIORITY_CHANGED: "priority_changed",
  ASSIGNEE_CHANGED: "assignee_changed",
  RESPONSIBLE_CONTACT_CHANGED: "responsible_contact_changed",
  DUE_DATE_CHANGED: "due_date_changed",
  CATEGORY_CHANGED: "category_changed",
  TAGS_CHANGED: "tags_changed",
  APPROVAL_CHANGED: "approval_changed",
  WAITING_PERSON_CHANGED: "waiting_person_changed",
  TASK_COMPLETED: "task_completed",
  TASK_REOPENED: "task_reopened",
  TASK_ARCHIVED: "task_archived",
  TASK_UNARCHIVED: "task_unarchived",
  TASK_TRASHED: "task_trashed",
  TASK_RESTORED: "task_restored",
  TASK_DUPLICATED: "task_duplicated",
  PARTICIPANT_COMPLETED: "participant_completed",
  PARTICIPANT_UNCOMPLETED: "participant_uncompleted",
  RESPONSIBLE_ADDED: "responsible_added",
  RESPONSIBLE_REMOVED: "responsible_removed",
  AUTO_MOVED_TO_REVIEW: "auto_moved_to_review",
  NOTE_ADDED: "note_added",
  // Puan & Motivasyon
  POINTS_FINALIZED: "points_finalized",
  POINTS_REVOKED: "points_revoked",
  POINTS_SELF_APPROVAL_SKIPPED: "points_self_approval_skipped",
  EFFORT_CHANGED: "effort_changed",
} as const;

export type ActivityAction =
  (typeof ACTIVITY_ACTIONS)[keyof typeof ACTIVITY_ACTIONS];

export interface TaskActivityEntry {
  workspaceId: string;
  taskId: string;
  actorId: string | null;
  action: ActivityAction | string;
  fieldName?: string | null;
  oldValue?: Json;
  newValue?: Json;
  metadata?: Record<string, Json>;
}

function toInsertRow(entry: TaskActivityEntry) {
  return {
    workspace_id: entry.workspaceId,
    task_id: entry.taskId,
    actor_id: entry.actorId,
    action: entry.action,
    field_name: entry.fieldName ?? null,
    old_value: entry.oldValue ?? null,
    new_value: entry.newValue ?? null,
    metadata: entry.metadata ?? {},
  };
}

/**
 * Append one activity log entry. Fails safe: a logging failure must never crash
 * the surrounding task operation. Errors are surfaced to the server console so
 * they remain visible during development.
 */
export async function logTaskActivity(
  supabase: SupabaseServerClient,
  entry: TaskActivityEntry,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("task_activity_logs")
      .insert(toInsertRow(entry));
    if (error) {
      console.error("[activity-log] insert failed:", error.message, {
        action: entry.action,
        taskId: entry.taskId,
      });
    }
  } catch (err) {
    console.error("[activity-log] unexpected error:", err);
  }
}

/**
 * Append multiple activity log entries in a single insert. Same fail-safe
 * semantics as {@link logTaskActivity}.
 */
export async function logTaskActivities(
  supabase: SupabaseServerClient,
  entries: TaskActivityEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  try {
    const { error } = await supabase
      .from("task_activity_logs")
      .insert(entries.map(toInsertRow));
    if (error) {
      console.error("[activity-log] batch insert failed:", error.message, {
        count: entries.length,
      });
    }
  } catch (err) {
    console.error("[activity-log] unexpected batch error:", err);
  }
}
