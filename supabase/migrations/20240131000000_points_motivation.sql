-- =============================================================================
-- Puan & Motivasyon Sistemi  (Points & Motivation)
-- =============================================================================
-- A non-competitive, personal-motivation points system.
--   • Every task carries an "effort" (small / medium / large) → fixed points.
--   • Points only become FINAL ("earned") when an owner/admin moves the task
--     to "done" (Tamamlandı). Members never finalize their own points.
--   • Reopening a finalised task writes a negative "revoked" entry — earned
--     rows are never deleted; the ledger stays append-only.
--   • A user's balance is ALWAYS the SUM of their points_ledger rows — never a
--     denormalised column.
-- Members cannot see other members' points, task point values, or per-task
-- breakdowns in the UI (RLS additionally hides other members' ledger rows).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Task effort + points
-- ---------------------------------------------------------------------------
-- ADD COLUMN ... DEFAULT backfills every existing row with the default, so old
-- tasks become effort='medium' / points=3. No retroactive ledger is written
-- (see item 10 of the spec): only future "done" transitions award points.
alter table public.tasks
  add column if not exists effort_size text not null default 'medium',
  add column if not exists points_value int not null default 3,
  -- Completion cycle: bumped each time a finalised task is reopened, so the
  -- SAME task can be earned again after a genuine reopen → re-complete, while
  -- duplicate finalisations WITHIN one cycle stay blocked. (See functions below.)
  add column if not exists points_cycle int not null default 0;

alter table public.tasks
  drop constraint if exists tasks_effort_size_check;
alter table public.tasks
  add constraint tasks_effort_size_check
  check (effort_size in ('small', 'medium', 'large'));

alter table public.tasks
  drop constraint if exists tasks_points_value_check;
alter table public.tasks
  add constraint tasks_points_value_check
  check (points_value in (1, 3, 5));

-- ---------------------------------------------------------------------------
-- 2. points_ledger — append-only record of every point movement
-- ---------------------------------------------------------------------------
create table if not exists public.points_ledger (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  task_id          uuid references public.tasks(id) on delete set null,
  user_id          uuid not null references auth.users(id) on delete cascade,
  points_amount    int not null,
  transaction_type text not null,
  source_type      text not null default 'task',
  -- Completion cycle this row belongs to (mirrors tasks.points_cycle at write
  -- time). Lets a task be earned/revoked once PER cycle.
  cycle            int not null default 0,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  metadata         jsonb not null default '{}'::jsonb,
  constraint points_ledger_transaction_type_check
    check (transaction_type in ('earned', 'revoked', 'adjustment')),
  constraint points_ledger_source_type_check
    check (source_type in ('task', 'manual_adjustment'))
);

create index if not exists points_ledger_workspace_created_idx
  on public.points_ledger (workspace_id, created_at desc);
create index if not exists points_ledger_user_created_idx
  on public.points_ledger (user_id, created_at desc);
create index if not exists points_ledger_task_idx
  on public.points_ledger (task_id);

-- A user can only EARN once and be REVOKED once PER COMPLETION CYCLE of a task.
-- Including `cycle` means a reopen→re-complete (which bumps the cycle) writes a
-- fresh earned row, while repeating the same "done" never duplicates points.
create unique index if not exists points_ledger_earned_once_idx
  on public.points_ledger (workspace_id, task_id, user_id, transaction_type, cycle)
  where transaction_type = 'earned' and task_id is not null;
create unique index if not exists points_ledger_revoked_once_idx
  on public.points_ledger (workspace_id, task_id, user_id, transaction_type, cycle)
  where transaction_type = 'revoked' and task_id is not null;

-- ---------------------------------------------------------------------------
-- 3. RLS — admins read the whole workspace; members read only their own rows.
--    No insert/update/delete policies: clients can NEVER write the ledger.
--    All writes go through the SECURITY DEFINER functions below.
-- ---------------------------------------------------------------------------
alter table public.points_ledger enable row level security;

drop policy if exists "points_ledger: read own or admin" on public.points_ledger;
create policy "points_ledger: read own or admin"
  on public.points_ledger for select
  using (
    is_workspace_admin(workspace_id)
    or user_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 4. finalize_task_points — called after an admin moves a task to "done".
--    Awards each responsible participant the task's full points_value, tagged
--    with the task's CURRENT completion cycle.
--    Self-approval guard: the approver (auth.uid()) is never auto-awarded.
--    Idempotent within a cycle: the partial unique index prevents a second
--    "earned" row for the same (task, user, cycle).
-- ---------------------------------------------------------------------------
create or replace function public.finalize_task_points(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws      uuid;
  v_points  int;
  v_status  task_status;
  v_cycle   int;
  v_caller  uuid := auth.uid();
  v_awarded jsonb := '[]'::jsonb;
  v_skipped uuid := null;
  r record;
begin
  select workspace_id, points_value, status, points_cycle
    into v_ws, v_points, v_status, v_cycle
  from public.tasks where id = p_task_id;

  if v_ws is null then
    return jsonb_build_object('error', 'task_not_found');
  end if;

  -- Only owner/admin may finalise points (mirrors canCompleteTask in the app).
  if not is_workspace_admin(v_ws) then
    raise exception 'not authorized to finalize points';
  end if;

  -- Guard: only award when the task is actually "done".
  if v_status <> 'done' then
    return jsonb_build_object('error', 'task_not_done');
  end if;

  -- Responsible people = task participants, resolved to their auth user id.
  for r in
    select distinct wm.user_id
    from public.task_member_completions tmc
    join public.workspace_members wm on wm.id = tmc.member_id
    where tmc.task_id = p_task_id
      and wm.user_id is not null
  loop
    -- Self-approval: the person who finalised the task is not auto-awarded.
    if r.user_id = v_caller then
      v_skipped := r.user_id;
      continue;
    end if;

    insert into public.points_ledger
      (workspace_id, task_id, user_id, points_amount,
       transaction_type, source_type, cycle, created_by, metadata)
    values
      (v_ws, p_task_id, r.user_id, v_points,
       'earned', 'task', v_cycle, v_caller,
       jsonb_build_object('effort_points', v_points, 'cycle', v_cycle))
    on conflict (workspace_id, task_id, user_id, transaction_type, cycle)
      where transaction_type = 'earned' and task_id is not null
      do nothing;

    if found then
      v_awarded := v_awarded
        || jsonb_build_object('user_id', r.user_id, 'points', v_points);
    end if;
  end loop;

  return jsonb_build_object(
    'awarded', v_awarded,
    'skipped_self', v_skipped,
    'points_value', v_points,
    'cycle', v_cycle
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. revoke_task_points — called after a finalised task leaves "done".
--    Mirrors each "earned" row of the CURRENT cycle with a negative "revoked"
--    row, then bumps the task's points_cycle so a future re-completion can earn
--    again. Earned rows are never deleted; the ledger stays append-only.
--    Idempotent within a cycle via the partial unique index.
-- ---------------------------------------------------------------------------
create or replace function public.revoke_task_points(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws       uuid;
  v_status   task_status;
  v_cycle    int;
  v_earned_n int;
  v_caller   uuid := auth.uid();
  v_revoked  jsonb := '[]'::jsonb;
  r record;
begin
  select workspace_id, status, points_cycle into v_ws, v_status, v_cycle
  from public.tasks where id = p_task_id;

  if v_ws is null then
    return jsonb_build_object('error', 'task_not_found');
  end if;

  -- Any workspace member may trigger a revoke (e.g. a member legitimately
  -- reopening their own task). The function only ever reverses points that were
  -- already earned for THIS task/cycle, so it cannot fabricate balances.
  if not is_workspace_member(v_ws) then
    raise exception 'not authorized to revoke points';
  end if;

  -- Guard: only revoke once the task is no longer "done".
  if v_status = 'done' then
    return jsonb_build_object('error', 'still_done');
  end if;

  -- Nothing earned in the current cycle → no-op (keeps repeat calls idempotent
  -- and prevents the cycle counter from drifting on stray double-invocations).
  select count(*) into v_earned_n
  from public.points_ledger
  where task_id = p_task_id and transaction_type = 'earned' and cycle = v_cycle;
  if v_earned_n = 0 then
    return jsonb_build_object('revoked', v_revoked, 'cycle', v_cycle);
  end if;

  for r in
    select pl.user_id, pl.points_amount
    from public.points_ledger pl
    where pl.task_id = p_task_id
      and pl.transaction_type = 'earned'
      and pl.cycle = v_cycle
  loop
    insert into public.points_ledger
      (workspace_id, task_id, user_id, points_amount,
       transaction_type, source_type, cycle, created_by, metadata)
    values
      (v_ws, p_task_id, r.user_id, -r.points_amount,
       'revoked', 'task', v_cycle, v_caller,
       jsonb_build_object('reason', 'task_reopened', 'cycle', v_cycle))
    on conflict (workspace_id, task_id, user_id, transaction_type, cycle)
      where transaction_type = 'revoked' and task_id is not null
      do nothing;

    if found then
      v_revoked := v_revoked
        || jsonb_build_object('user_id', r.user_id, 'points', r.points_amount);
    end if;
  end loop;

  -- Open a new completion cycle so a later re-completion earns fresh points.
  -- Bumped once per reopen (this function only runs on a done → … transition).
  update public.tasks
    set points_cycle = points_cycle + 1
  where id = p_task_id;

  return jsonb_build_object('revoked', v_revoked, 'cycle', v_cycle);
end;
$$;

-- Both functions are SECURITY DEFINER and self-authorise via is_workspace_*.
grant execute on function public.finalize_task_points(uuid) to authenticated;
grant execute on function public.revoke_task_points(uuid)  to authenticated;
