// ---------------------------------------------------------------------------
// Email recipient resolver
// ---------------------------------------------------------------------------
// Turns a list of workspace-member user ids into real, mailable addresses.
// This is the SINGLE place that decides where a task e-mail actually goes.
//
// Resolution order for each user id (workspace-scoped — a member of ANOTHER
// workspace never resolves here, which is the cross-tenant leak guard):
//   1. workspace_members.notification_email   (source: "notification_email")
//   2. profiles.email                          (source: "profile_email")
//   3. no address                              → skip ("no_email")
//   • @lospia.local placeholder                → skip ("placeholder_email")
//   • email_notifications_enabled = false      → skip ("notifications_disabled")
//   • not a member of this workspace           → skip ("no_membership")
//
// workspace_contacts.email is DELIBERATELY never consulted here: it is CRM /
// customer data and must not receive internal member notifications.
//
// SECURITY: server-only. Reads notification_email + profiles.email through the
// service-role admin client (RLS only lets a user read their own rows). The
// browser guard hard-fails if this ever reaches the client bundle.

import { getAdminClient } from "@/lib/supabase/admin";
import { isPlaceholderEmail, normalizeNotificationEmail } from "@/lib/utils/notification-email";

if (typeof window !== "undefined") {
  throw new Error("lib/notifications/email-recipients.ts must never be imported in the browser");
}

export type EmailSource = "notification_email" | "profile_email";

export type ResolvedEmailRecipient = {
  userId: string;
  email: string;
  source: EmailSource;
};

export type SkipReason =
  | "no_service_role"
  | "no_membership"
  | "notifications_disabled"
  | "no_email"
  | "placeholder_email";

export type SkippedEmailRecipient = {
  userId: string;
  reason: SkipReason;
};

export type ResolveResult = {
  recipients: ResolvedEmailRecipient[];
  skipped: SkippedEmailRecipient[];
};

/**
 * Resolve mailable addresses for a set of user ids within one workspace.
 * Never throws for data reasons — an unresolvable recipient becomes a `skipped`
 * entry the caller can log, not an exception.
 */
export async function resolveEmailRecipients(params: {
  workspaceId: string;
  recipientUserIds: string[];
}): Promise<ResolveResult> {
  const { workspaceId } = params;
  const userIds = Array.from(new Set(params.recipientUserIds.filter((id): id is string => !!id)));
  if (userIds.length === 0) return { recipients: [], skipped: [] };

  const admin = getAdminClient();
  if (!admin) {
    // No service-role key → we cannot read cross-user emails. Skip everyone
    // rather than fall back to an RLS-limited client that would silently
    // resolve nobody.
    return { recipients: [], skipped: userIds.map((userId) => ({ userId, reason: "no_service_role" as const })) };
  }

  // Membership rows carry the notification address + kill switch AND enforce the
  // workspace filter: only members of THIS workspace come back.
  const { data: memberRows } = await admin
    .from("workspace_members")
    .select("user_id, notification_email, email_notifications_enabled")
    .eq("workspace_id", workspaceId)
    .in("user_id", userIds);

  const memberByUser = new Map(
    (memberRows ?? []).map((m) => [
      m.user_id as string,
      {
        notificationEmail: m.notification_email as string | null,
        enabled: m.email_notifications_enabled as boolean,
      },
    ]),
  );

  // profiles.email fallback — only fetched for members that lack a
  // notification_email (keeps the query small and avoids reading emails we
  // won't use).
  const needProfileEmail = userIds.filter((id) => {
    const m = memberByUser.get(id);
    return m && !normalizeNotificationEmail(m.notificationEmail);
  });
  const profileEmailByUser = new Map<string, string | null>();
  if (needProfileEmail.length > 0) {
    const { data: profileRows } = await admin
      .from("profiles")
      .select("id, email")
      .in("id", needProfileEmail);
    for (const p of profileRows ?? []) {
      profileEmailByUser.set(p.id as string, (p.email as string | null) ?? null);
    }
  }

  const recipients: ResolvedEmailRecipient[] = [];
  const skipped: SkippedEmailRecipient[] = [];

  for (const userId of userIds) {
    const member = memberByUser.get(userId);
    if (!member) {
      skipped.push({ userId, reason: "no_membership" });
      continue;
    }
    if (member.enabled === false) {
      skipped.push({ userId, reason: "notifications_disabled" });
      continue;
    }

    const notificationEmail = normalizeNotificationEmail(member.notificationEmail);
    let email: string | null = notificationEmail;
    let source: EmailSource = "notification_email";
    if (!email) {
      email = normalizeNotificationEmail(profileEmailByUser.get(userId));
      source = "profile_email";
    }

    if (!email) {
      skipped.push({ userId, reason: "no_email" });
      continue;
    }
    if (isPlaceholderEmail(email)) {
      skipped.push({ userId, reason: "placeholder_email" });
      continue;
    }

    recipients.push({ userId, email, source });
  }

  return { recipients, skipped };
}

/** Mask an address for safe logging: `si***@gmail.com`. Never log the full mail. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}***@${domain}`;
}
