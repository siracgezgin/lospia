-- =============================================================================
-- Team access grants (AF Operasyon pilot self-service signup)
-- =============================================================================
-- The pilot uses an allowlist of e-mail addresses that an admin adds in
-- Settings → Üyeler → "Ekip erişimi". When a person signs up with an allowed
-- e-mail they join AF Operasyon with the configured role; non-allowed e-mails
-- never create a workspace.
--
-- The allowlist is stored in the existing workspace_invites table (reused, not
-- dropped). This migration is purely additive: it records WHICH user accepted a
-- grant so the row can be linked to the resulting member. Idempotent.
-- =============================================================================

alter table public.workspace_invites
  add column if not exists accepted_user_id uuid references public.profiles(id) on delete set null;
