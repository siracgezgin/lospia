/**
 * Canonical UI display e-mail selection — shared by the AppHeader profile
 * menu and the Settings "Profiliniz" card so both always show the SAME
 * address.
 *
 * Admin-created accounts sign in with `<username>@lospia.local`, an internal
 * auth placeholder that must never be presented as the person's real e-mail.
 * The real address is looked up in priority order:
 *   1. profiles.email                        (when real, not a placeholder)
 *   2. auth user e-mail                      (when real)
 *   3. workspace_members.notification_email  (when real)
 *   4. null → the UI shows a muted "E-posta eklenmedi" fallback
 *
 * workspace_contacts.email is CRM/customer data and is deliberately never a
 * candidate here. Pure function only — no queries, no server actions.
 */

import { isPlaceholderEmail, normalizeNotificationEmail } from "./notification-email";

export function pickDisplayEmail(options: {
  profileEmail?: string | null;
  authEmail?: string | null;
  notificationEmail?: string | null;
}): string | null {
  const candidates = [options.profileEmail, options.authEmail, options.notificationEmail];
  for (const raw of candidates) {
    const email = normalizeNotificationEmail(raw);
    if (email && !isPlaceholderEmail(email)) return email;
  }
  return null;
}
