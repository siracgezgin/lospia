-- =============================================================================
-- Task note workflow — note types, due-date confirmation, acknowledgements
-- =============================================================================
-- Turns task_notes from plain comments into operational notes:
--   * note_type              → info | action_required | handoff | approval_waiting
--   * metadata               → notify targets, assignment action, due-date audit
--   * due_date_at_note_time  → which delivery date was confirmed when noting
--   * action_status          → open | seen | claimed | closed (feed carry-over)
--   * task_note_acknowledgements → per-user "Gördüm" / "Üzerime aldım" records
--
-- FULLY ADDITIVE: no drops, no data rewrites, safe to re-run (idempotent).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- task_notes: new columns (all optional/defaulted → existing rows unaffected)
-- ---------------------------------------------------------------------------
alter table public.task_notes
  add column if not exists note_type text not null default 'info';

alter table public.task_notes
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.task_notes
  add column if not exists due_date_at_note_time date;

alter table public.task_notes
  add column if not exists action_status text not null default 'open';

-- Check constraints (ADD CONSTRAINT has no IF NOT EXISTS → guard via catalog)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'task_notes_note_type_check'
      and conrelid = 'public.task_notes'::regclass
  ) then
    alter table public.task_notes
      add constraint task_notes_note_type_check
      check (note_type in ('info', 'action_required', 'handoff', 'approval_waiting'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'task_notes_action_status_check'
      and conrelid = 'public.task_notes'::regclass
  ) then
    alter table public.task_notes
      add constraint task_notes_action_status_check
      check (action_status in ('open', 'seen', 'claimed', 'closed'));
  end if;
end;
$$;

-- Weekly feed query path: workspace + recency, and open-action carry-over
create index if not exists task_notes_workspace_type_status_idx
  on public.task_notes(workspace_id, note_type, action_status, created_at desc);

-- ---------------------------------------------------------------------------
-- task_note_acknowledgements — per-user seen/claimed receipts (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.task_note_acknowledgements (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id      uuid not null references public.tasks(id) on delete cascade,
  note_id      uuid not null references public.task_notes(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  action       text not null check (action in ('seen', 'claimed')),
  created_at   timestamptz not null default now(),
  unique (note_id, user_id, action)
);

create index if not exists task_note_acks_workspace_task_idx
  on public.task_note_acknowledgements(workspace_id, task_id);
create index if not exists task_note_acks_note_idx
  on public.task_note_acknowledgements(note_id);
create index if not exists task_note_acks_user_idx
  on public.task_note_acknowledgements(user_id);

-- ---------------------------------------------------------------------------
-- RLS — user writes/reads own receipts; admins read (and can clean up) all.
-- No user-side update/delete: receipts are an append-only audit surface.
-- ---------------------------------------------------------------------------
alter table public.task_note_acknowledgements enable row level security;

drop policy if exists "task_note_acks: member inserts own"
  on public.task_note_acknowledgements;
create policy "task_note_acks: member inserts own"
  on public.task_note_acknowledgements for insert
  with check (
    is_workspace_member(workspace_id)
    and user_id = (select auth.uid())
  );

drop policy if exists "task_note_acks: own or admin can select"
  on public.task_note_acknowledgements;
create policy "task_note_acks: own or admin can select"
  on public.task_note_acknowledgements for select
  using (
    user_id = (select auth.uid())
    or is_workspace_admin(workspace_id)
  );

drop policy if exists "task_note_acks: admin can delete"
  on public.task_note_acknowledgements;
create policy "task_note_acks: admin can delete"
  on public.task_note_acknowledgements for delete
  using (is_workspace_admin(workspace_id));

drop policy if exists "task_note_acks: admin can update"
  on public.task_note_acknowledgements;
create policy "task_note_acks: admin can update"
  on public.task_note_acknowledgements for update
  using (is_workspace_admin(workspace_id));

-- PostgREST must see the new columns/table immediately
notify pgrst, 'reload schema';
