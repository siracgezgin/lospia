/**
 * Notification e-mail helpers — shared by the settings UI and server actions.
 *
 * Admin-created accounts authenticate with `<username>@lospia.local`, an
 * internal placeholder that can never receive mail. A member's REAL address
 * lives in workspace_members.notification_email; profiles.email is only a
 * fallback when it is not a placeholder. workspace_contacts.email is CRM /
 * customer data and is deliberately NEVER used for member notifications.
 *
 * Pure functions only: this module is imported from both Client Components
 * and server actions.
 */

/** Domain of internal auth addresses (see INTERNAL_EMAIL_DOMAIN in workspace actions). */
export const PLACEHOLDER_EMAIL_DOMAIN = "lospia.local";

/** True when the address is an internal login placeholder that can never receive mail. */
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}

/** Trim + lowercase; empty input becomes null (meaning "no notification e-mail"). */
export function normalizeNotificationEmail(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim().toLowerCase();
  return value === "" ? null : value;
}

/**
 * Where a member's displayed notification address comes from:
 *  - "notification" → workspace_members.notification_email
 *  - "profile"      → profiles.email fallback (a real, non-placeholder address)
 *  - "none"         → nothing usable; UI shows "Bildirim e-postası eklenmedi"
 */
export type NotificationEmailSource = "notification" | "profile" | "none";

export function getDisplayNotificationEmail(member: {
  notification_email?: string | null;
  profiles?: { email?: string | null } | null;
}): { email: string | null; source: NotificationEmailSource } {
  const own = normalizeNotificationEmail(member.notification_email);
  if (own) return { email: own, source: "notification" };

  const profileEmail = normalizeNotificationEmail(member.profiles?.email);
  if (profileEmail && !isPlaceholderEmail(profileEmail)) {
    return { email: profileEmail, source: "profile" };
  }
  return { email: null, source: "none" };
}
