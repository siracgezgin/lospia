import type { WorkspaceRole } from "@/types";

export type AppRole = WorkspaceRole;

const ADMIN_ROLES: AppRole[] = ["owner", "admin"];
const WRITE_ROLES: AppRole[] = ["owner", "admin", "member"];

export function canManageWorkspace(role: AppRole): boolean {
  return ADMIN_ROLES.includes(role);
}

export function canManageSettings(role: AppRole): boolean {
  return ADMIN_ROLES.includes(role);
}

export function canManageRules(role: AppRole): boolean {
  return ADMIN_ROLES.includes(role);
}

export function canManageContacts(role: AppRole): boolean {
  return ADMIN_ROLES.includes(role);
}

export function canCreateTask(role: AppRole): boolean {
  return WRITE_ROLES.includes(role);
}

export function canArchiveTask(role: AppRole): boolean {
  return ADMIN_ROLES.includes(role);
}

// Only owner/admin can mark a task as finally completed (done). Members send
// tasks to "Kontrol / Onay" (review); an admin approves them into done.
export function canCompleteTask(role: AppRole): boolean {
  return ADMIN_ROLES.includes(role);
}

export function canDeleteTask(role: AppRole): boolean {
  return ADMIN_ROLES.includes(role);
}

// Per-item delete rule: owner/admin may delete any task; a member may delete
// ONLY tasks they created. A task created by an admin is never deletable by a
// member, even if the member is the responsible/assigned person. Viewers never
// delete. Mirrors the same rule for notes via canDeleteNoteItem.
export function canDeleteTaskItem(
  role: AppRole,
  task: { created_by?: string | null },
  currentUserId: string,
): boolean {
  if (ADMIN_ROLES.includes(role)) return true;
  if (role === "viewer") return false;
  return (task.created_by ?? null) === currentUserId;
}

// Notes (workspace sticky notes + task notes): owner/admin delete any; the
// author deletes their own. `created_by` covers workspace_notes, `author_id`
// covers task_notes.
export function canDeleteNoteItem(
  role: AppRole,
  note: { created_by?: string | null; author_id?: string | null },
  currentUserId: string,
): boolean {
  if (ADMIN_ROLES.includes(role)) return true;
  if (role === "viewer") return false;
  const owner = note.created_by ?? note.author_id ?? null;
  return owner === currentUserId;
}

export function canPermanentDeleteTask(role: AppRole): boolean {
  return role === "owner" || role === "admin";
}

export function canEditTask(
  role: AppRole,
  task: { assignee_id?: string | null; created_by?: string | null },
  currentUserId: string
): boolean {
  if (ADMIN_ROLES.includes(role)) return true;
  if (role === "member") {
    return (
      task.assignee_id === currentUserId ||
      task.created_by === currentUserId
    );
  }
  return false;
}

// Assignment (sorumlu ekleme/çıkarma/handoff) is stricter than general edit:
// owner/admin manage any task; the creator manages their own task; a CURRENT
// responsible person (legacy assignee or participant) may hand the task off.
// A member can NEVER add themselves to a task they are not already on — that
// was the "assign myself, gain edit rights" bypass. Viewers never mutate.
export function canManageTaskAssignment(
  role: AppRole,
  task: { assignee_id?: string | null; created_by?: string | null },
  currentUserId: string,
  isParticipant: boolean,
): boolean {
  if (ADMIN_ROLES.includes(role)) return true;
  if (role !== "member") return false;
  return (
    task.assignee_id === currentUserId ||
    (task.created_by ?? null) === currentUserId ||
    isParticipant
  );
}

export function canReorderTask(
  role: AppRole,
  task: { assignee_id?: string | null; created_by?: string | null },
  currentUserId: string
): boolean {
  return canEditTask(role, task, currentUserId);
}

export function canViewDestructivePages(role: AppRole): boolean {
  return ADMIN_ROLES.includes(role);
}

export function canManageMembers(role: AppRole): boolean {
  return role === "owner";
}

export function canRenameWorkspace(role: AppRole): boolean {
  return role === "owner";
}
