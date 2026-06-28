import type { WorkspaceRole } from "@/types";

// User-facing role labels. The "owner" is the system administrator (Sıraç) and is
// NEVER shown as "Sahip"; it surfaces as "Sistem Admini". "admin" = Yönetici,
// "member" = Üye. "viewer" stays internal (İzleyici) but is not offered in pickers.
export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Sistem Admini",
  admin: "Yönetici",
  member: "Üye",
  viewer: "İzleyici",
};

export function roleLabel(role: string): string {
  return (ROLE_LABELS as Record<string, string>)[role] ?? role;
}

// Roles selectable in member / invite dropdowns. Only Yönetici and Üye are
// exposed — owner is system-only and viewer is hidden (kept for internal use).
export const ASSIGNABLE_ROLE_OPTIONS: { value: "admin" | "member"; label: string }[] = [
  { value: "admin", label: "Yönetici" },
  { value: "member", label: "Üye" },
];
