-- =============================================================================
-- Per-person task completion (AF Operasyon multi-participant workflow)
-- =============================================================================
-- A task can have several member participants. Each tracks their own completion.
-- When every participant has completed their part, the app moves the task to
-- "Kontrol / Onay" (review); only owner/admin approves it into final "done".
-- =============================================================================

create table if not exists public.task_member_completions (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id      uuid not null references public.tasks(id) on delete cascade,
  member_id    uuid not null references public.workspace_members(id) on delete cascade,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (task_id, member_id)
);

create index if not exists task_member_completions_task_idx
  on public.task_member_completions(task_id);
create index if not exists task_member_completions_member_idx
  on public.task_member_completions(workspace_id, member_id);

drop trigger if exists set_task_member_completions_updated_at on public.task_member_completions;
create trigger set_task_member_completions_updated_at
  before update on public.task_member_completions
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.task_member_completions enable row level security;

-- Members can read completions in their workspace.
create policy "completions: members read"
  on public.task_member_completions for select
  using (is_workspace_member(workspace_id));

-- Insert: admins for anyone; a member for their own membership row.
create policy "completions: insert own or admin"
  on public.task_member_completions for insert
  with check (
    is_workspace_admin(workspace_id)
    or exists (
      select 1 from public.workspace_members wm
      where wm.id = task_member_completions.member_id
        and wm.user_id = auth.uid()
    )
  );

-- Update: admins for anyone; a member for their own membership row.
create policy "completions: update own or admin"
  on public.task_member_completions for update
  using (
    is_workspace_admin(workspace_id)
    or exists (
      select 1 from public.workspace_members wm
      where wm.id = task_member_completions.member_id
        and wm.user_id = auth.uid()
    )
  );

-- Delete: admins for anyone; a member for their own membership row.
create policy "completions: delete own or admin"
  on public.task_member_completions for delete
  using (
    is_workspace_admin(workspace_id)
    or exists (
      select 1 from public.workspace_members wm
      where wm.id = task_member_completions.member_id
        and wm.user_id = auth.uid()
    )
  );
