-- =============================================================================
-- Member notification e-mail (additive, backward-compatible)
-- =============================================================================
-- Admin-created accounts authenticate with an internal placeholder address
-- (`<username>@lospia.local`) that can never receive mail. This migration adds
-- a workspace-scoped REAL notification address per member, plus a per-member
-- kill switch, so e-mail notifications can reach people without ever touching
-- auth/login e-mails (auth.users.email / profiles.email stay untouched).
--
-- Nothing here is destructive: no drop/rename, no NOT NULL on existing rows,
-- no data change. Existing RLS already covers the new columns:
--   • owner/admin can update any member row  (initial_schema policy)
--   • a member can update their own row      (member_rules_seen policy)
--   • all workspace members can select rows  (same visibility as profiles.email today)
-- =============================================================================

alter table public.workspace_members
  add column if not exists notification_email text,
  add column if not exists email_notifications_enabled boolean not null default true;

-- Light sanity check only (something@something, no whitespace). Real format
-- validation lives in the app layer; this just blocks obviously broken values
-- from ever landing in the column.
alter table public.workspace_members
  add constraint workspace_members_notification_email_format
  check (
    notification_email is null
    or notification_email ~ '^[^[:space:]@]+@[^[:space:]@]+$'
  );

comment on column public.workspace_members.notification_email is
  'Real e-mail used for outbound notifications. Falls back to profiles.email when null; @lospia.local placeholders are never mailed.';
comment on column public.workspace_members.email_notifications_enabled is
  'Per-member kill switch for e-mail notifications (in-app notifications are unaffected).';
