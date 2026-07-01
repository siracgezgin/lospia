-- =============================================================================
-- Lospia Operasyon Merkezi — Phase 1 hardening
-- Contact ↔ User/Profile link (additive, backward-compatible).
-- =============================================================================
-- workspace_contacts is used for task responsible/contact mapping AND CRM v0.
-- This migration adds an OPTIONAL link from a contact to a system user
-- (profiles) so an admin can confirm "this CRM contact is that team member".
-- Nothing here is destructive: no drop/rename, no NOT NULL, no data change. The
-- link is set manually from the UI (never auto-applied).
-- =============================================================================

alter table public.workspace_contacts
  add column if not exists user_id uuid references public.profiles(id) on delete set null;

-- Lookup by linked user (e.g. "which contact is this member?").
create index if not exists workspace_contacts_user_id_idx
  on public.workspace_contacts(user_id);

-- A given system user may be linked to at most one contact per workspace.
-- Partial unique so the many unlinked (null) rows are unaffected.
create unique index if not exists workspace_contacts_workspace_user_unique
  on public.workspace_contacts(workspace_id, user_id)
  where user_id is not null;

-- Existing row-level RLS on workspace_contacts already governs this column
-- (policies are row-level, not column-level). No policy change required.
