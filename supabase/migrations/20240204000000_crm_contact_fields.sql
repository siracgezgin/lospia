-- =============================================================================
-- Lospia Operasyon Merkezi — Phase 1
-- CRM v0: additive, backward-compatible columns on workspace_contacts.
-- =============================================================================
-- workspace_contacts is already used for task responsible/contact mapping. This
-- migration ONLY adds optional (nullable) columns so the existing behaviour is
-- untouched. No drops, no renames, no NOT NULL on existing rows. Safe to run on
-- production; all reads/writes without these columns keep working exactly as
-- before.
-- =============================================================================

alter table public.workspace_contacts
  add column if not exists organization     text,
  add column if not exists segment          text,
  add column if not exists phone            text,
  add column if not exists source_channel   text,
  add column if not exists notes            text,
  add column if not exists last_contact_at  date,
  add column if not exists next_follow_up_at date,
  add column if not exists owner_id         uuid references public.profiles(id) on delete set null,
  add column if not exists crm_status       text,
  add column if not exists metadata         jsonb not null default '{}'::jsonb;

-- Lightweight lookup for the "takip listesi" (upcoming follow-ups) view.
create index if not exists workspace_contacts_next_follow_up_idx
  on public.workspace_contacts(workspace_id, next_follow_up_at);

create index if not exists workspace_contacts_segment_idx
  on public.workspace_contacts(workspace_id, segment);

-- Note: RLS policies from 20240104000000_workspace_contacts.sql already cover
-- these columns (they are row-level, not column-level). owner/admin and members
-- keep the same visibility. Column-level masking for sensitive fields can be
-- layered later without touching this migration.
