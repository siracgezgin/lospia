-- Add responsible_contact_id to tasks so a non-auth workspace contact
-- can be the responsible person (separate from assignee_id which is auth-only).
alter table public.tasks
  add column if not exists responsible_contact_id uuid
  references public.workspace_contacts(id) on delete set null;

create index if not exists tasks_responsible_contact_id_idx
  on public.tasks(responsible_contact_id);
