-- Workspace notes: a simple sticky-note lane on the board.
-- Not tasks — no status enum, no assignment, just title + body + position.

create table if not exists public.workspace_notes (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title        text not null default '',
  body         text,
  position     integer not null default 0,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists workspace_notes_workspace_id_idx
  on public.workspace_notes(workspace_id);

create trigger set_workspace_notes_updated_at
  before update on public.workspace_notes
  for each row execute function set_updated_at();

alter table public.workspace_notes enable row level security;

create policy "workspace members can view notes"
  on public.workspace_notes for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_notes.workspace_id
        and wm.user_id = auth.uid()
    )
  );

create policy "workspace members can create notes"
  on public.workspace_notes for insert
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_notes.workspace_id
        and wm.user_id = auth.uid()
    )
  );

create policy "workspace members can update notes"
  on public.workspace_notes for update
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_notes.workspace_id
        and wm.user_id = auth.uid()
    )
  );

create policy "workspace members can delete notes"
  on public.workspace_notes for delete
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_notes.workspace_id
        and wm.user_id = auth.uid()
    )
  );
