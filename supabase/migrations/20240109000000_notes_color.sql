-- Add color theme to workspace_notes.
-- Allowed values: 'yellow' | 'blue' | 'green' | 'purple' (enforced in app layer only).
alter table public.workspace_notes
  add column if not exists color text not null default 'yellow';
