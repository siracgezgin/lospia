// ---------------------------------------------------------------------------
// Task visibility — "Görev Görünürlüğü"
// ---------------------------------------------------------------------------
// Two levels, enforced at the DB/RLS layer (see 20240203000000_task_visibility):
//   • workspace  → "Herkes"            — the relevant team can see the task
//   • admin_only → "Sadece yöneticiler" — only owner/admin roles can see it
// Default is 'workspace', so existing tasks and behaviour are unchanged.

export const TASK_VISIBILITIES = ["workspace", "admin_only"] as const;
export type TaskVisibility = (typeof TASK_VISIBILITIES)[number];

export const DEFAULT_VISIBILITY: TaskVisibility = "workspace";

export function isTaskVisibility(v: unknown): v is TaskVisibility {
  return v === "workspace" || v === "admin_only";
}

/** Normalise an unknown value (e.g. an untyped task row) to a valid visibility. */
export function asVisibility(v: unknown): TaskVisibility {
  return isTaskVisibility(v) ? v : DEFAULT_VISIBILITY;
}

export const VISIBILITY_LABELS: Record<TaskVisibility, string> = {
  workspace: "Herkes",
  admin_only: "Sadece yöneticiler",
};

export const VISIBILITY_DESCRIPTIONS: Record<TaskVisibility, string> = {
  workspace: "Bu görev çalışma alanındaki ilgili ekip tarafından görülebilir.",
  admin_only: "Bu görev yalnızca yönetici ve sistem adminleri tarafından görülebilir.",
};

/** Short chip text shown to admins on cards / list / detail. */
export const ADMIN_ONLY_CHIP_LABEL = "Yöneticiye özel";
