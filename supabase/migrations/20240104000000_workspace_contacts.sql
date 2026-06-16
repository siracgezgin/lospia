-- =============================================================================
-- workspace_contacts: non-auth collaborator contacts per workspace
-- =============================================================================

create table public.workspace_contacts (
  id           uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null check (char_length(name) > 0 and char_length(name) <= 200),
  email        text,
  role_label   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger workspace_contacts_updated_at
  before update on public.workspace_contacts
  for each row execute function set_updated_at();

create index workspace_contacts_workspace_id_idx
  on public.workspace_contacts(workspace_id);

alter table public.workspace_contacts enable row level security;

-- Workspace members can view contacts in their workspace
create policy "workspace members can select contacts"
  on public.workspace_contacts for select
  using (
    workspace_id in (
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
  );

-- Workspace members can add contacts
create policy "workspace members can insert contacts"
  on public.workspace_contacts for insert
  with check (
    workspace_id in (
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
  );

-- Workspace members can update contacts
create policy "workspace members can update contacts"
  on public.workspace_contacts for update
  using (
    workspace_id in (
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
  );

-- Workspace members can delete contacts
create policy "workspace members can delete contacts"
  on public.workspace_contacts for delete
  using (
    workspace_id in (
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
  );
