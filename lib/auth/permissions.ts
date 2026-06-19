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

export function canDeleteTask(role: AppRole): boolean {
  return ADMIN_ROLES.includes(role);
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
