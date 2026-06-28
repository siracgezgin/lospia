-- =============================================================================
-- task_notes — user-visible notes on tasks ("Notlar" in UI)
-- =============================================================================
-- Separate from task_activity (which mixes comments + system events).
-- task_notes is purely user-authored prose notes, optionally pinned.
-- =============================================================================

create table public.task_notes (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id      uuid not null references public.tasks(id) on delete cascade,
  author_id    uuid references public.profiles(id) on delete set null,
  content      text not null,
  is_pinned    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger set_task_notes_updated_at
  before update on public.task_notes
  for each row execute function set_updated_at();

create index task_notes_workspace_created_idx
  on public.task_notes(workspace_id, created_at desc);
create index task_notes_task_created_idx
  on public.task_notes(task_id, created_at desc);
create index task_notes_task_pinned_idx
  on public.task_notes(task_id, is_pinned desc, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.task_notes enable row level security;

-- Workspace members can read notes
create policy "task_notes: members can select"
  on public.task_notes for select
  using (is_workspace_member(workspace_id));

-- Workspace members (non-viewer) can insert notes
create policy "task_notes: members can insert"
  on public.task_notes for insert
  with check (
    is_workspace_member(workspace_id)
    and author_id = (select auth.uid())
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = task_notes.workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role != 'viewer'
    )
  );

-- Author can edit their own note; admins can edit any
create policy "task_notes: author or admin can update"
  on public.task_notes for update
  using (
    author_id = (select auth.uid())
    or is_workspace_admin(workspace_id)
  );

-- Author can delete their own note; admins can delete any
create policy "task_notes: author or admin can delete"
  on public.task_notes for delete
  using (
    author_id = (select auth.uid())
    or is_workspace_admin(workspace_id)
  );

-- ---------------------------------------------------------------------------
-- Add 'task_note_added' to notification_type enum (safe: IF NOT EXISTS via DO)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_enum
    where enumlabel = 'task_note_added'
      and enumtypid = 'public.notification_type'::regtype
  ) then
    alter type public.notification_type add value 'task_note_added';
  end if;

  if not exists (
    select 1 from pg_enum
    where enumlabel = 'task_waiting_on'
      and enumtypid = 'public.notification_type'::regtype
  ) then
    alter type public.notification_type add value 'task_waiting_on';
  end if;
end;
$$;
