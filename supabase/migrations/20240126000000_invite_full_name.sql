-- Add an optional display name to prepared accounts (workspace_invites).
--
-- The admin "Ekip üyesi ekle" flow can capture the person's name so the account
-- creation link pre-fills it and the pending row reads as a name, not a raw
-- e-mail. Nullable and additive — existing rows and the onboarding flow keep
-- working unchanged. Idempotent.

alter table public.workspace_invites
  add column if not exists full_name text;
