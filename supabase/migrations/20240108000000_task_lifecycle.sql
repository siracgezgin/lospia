-- Add lifecycle timestamp columns to tasks.
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, DROP TRIGGER before CREATE.

alter table public.tasks
  add column if not exists completed_at timestamptz,
  add column if not exists archived_at  timestamptz,
  add column if not exists deleted_at   timestamptz;

-- Sparse indexes on workspace+lifecycle for efficient archive/trash queries
create index if not exists tasks_completed_at_idx
  on public.tasks(workspace_id, completed_at)
  where completed_at is not null;

create index if not exists tasks_archived_at_idx
  on public.tasks(workspace_id, archived_at)
  where archived_at is not null;

create index if not exists tasks_deleted_at_idx
  on public.tasks(workspace_id, deleted_at)
  where deleted_at is not null;

-- Auto-manage completed_at when status changes to/from 'done'.
-- Entering done: stamp now() if not already set.
-- Leaving done: clear the stamp.
create or replace function manage_completed_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    new.completed_at := coalesce(new.completed_at, now());
  elsif old.status = 'done' and new.status != 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_manage_completed_at on public.tasks;
create trigger tasks_manage_completed_at
  before update of status on public.tasks
  for each row execute function manage_completed_at();
