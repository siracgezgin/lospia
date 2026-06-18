-- Workspace rules: daily checklist / SOPs visible to all team members.

create table if not exists public.workspace_rules (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 500),
  body         text,
  category     text,
  is_active    boolean not null default true,
  position     integer not null default 0,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists workspace_rules_workspace_id_idx
  on public.workspace_rules(workspace_id, position);

create trigger set_workspace_rules_updated_at
  before update on public.workspace_rules
  for each row execute function set_updated_at();

alter table public.workspace_rules enable row level security;

create policy "workspace members can view rules"
  on public.workspace_rules for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_rules.workspace_id
        and wm.user_id = auth.uid()
    )
  );

create policy "workspace members can manage rules"
  on public.workspace_rules for all
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_rules.workspace_id
        and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_rules.workspace_id
        and wm.user_id = auth.uid()
    )
  );
