-- =============================================================================
-- Task ownership ⇄ points hardening
-- =============================================================================
-- Live testing surfaced two linked problems:
--   1. A task whose only "responsible" person is the legacy tasks.assignee_id
--      (no task_member_completions rows) earned NOBODY points when completed —
--      finalize_task_points only looked at participants. Members saw a done
--      task under "Bana atananlar" but a 0 balance.
--   2. Tasks completed before the points system shipped (or via the assignee-only
--      path) have no ledger rows at all.
--
-- Fix: make the canonical "responsible people" of a task = its participants,
-- FALLING BACK to assignee_id when there are no participant rows. This single
-- rule is applied in finalize_task_points (live) and a new admin-only
-- repair_missing_task_points (backfill). The app layer (queries.ts, the task
-- detail panel) uses the same participants ∪ assignee rule.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. finalize_task_points — now with assignee fallback
-- ---------------------------------------------------------------------------
-- Responsible people = participants resolved to auth users; if a task has no
-- participant rows at all, the legacy assignee_id is treated as the single
-- responsible person. The self-approval guard (never auto-award the approver)
-- and per-cycle idempotency are unchanged.
create or replace function public.finalize_task_points(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws       uuid;
  v_points   int;
  v_status   task_status;
  v_cycle    int;
  v_assignee uuid;
  v_caller   uuid := auth.uid();
  v_awarded  jsonb := '[]'::jsonb;
  v_skipped  uuid := null;
  r record;
begin
  select workspace_id, points_value, status, points_cycle, assignee_id
    into v_ws, v_points, v_status, v_cycle, v_assignee
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

  -- Responsible people = task participants, resolved to their auth user id;
  -- fall back to the legacy assignee when there are no participant rows.
  for r in
    select distinct wm.user_id
    from public.task_member_completions tmc
    join public.workspace_members wm on wm.id = tmc.member_id
    where tmc.task_id = p_task_id
      and wm.user_id is not null
    union
    select v_assignee
    where v_assignee is not null
      and not exists (
        select 1 from public.task_member_completions t2 where t2.task_id = p_task_id
      )
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

grant execute on function public.finalize_task_points(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. repair_missing_task_points — admin-only backfill for done tasks
-- ---------------------------------------------------------------------------
-- Walks every "done" task in the workspace and writes the missing "earned"
-- ledger rows for its responsible people (participants ∪ assignee fallback),
-- tagged with the task's CURRENT cycle. Idempotent: the partial unique index
-- means a second run inserts nothing. Repair rows carry metadata.repair = true.
-- Unlike live finalisation there is no self-approval skip — this fills genuine
-- historical gaps, and the admin clicking the button is not the original
-- approver of these already-completed tasks.
create or replace function public.repair_missing_task_points(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller    uuid := auth.uid();
  v_tasks     int := 0;
  v_rows      int := 0;
  t record;
  r record;
begin
  if not is_workspace_admin(p_workspace_id) then
    raise exception 'not authorized to repair points';
  end if;

  for t in
    select id, points_value, points_cycle, assignee_id
    from public.tasks
    where workspace_id = p_workspace_id
      and status = 'done'
  loop
    v_tasks := v_tasks + 1;
    for r in
      select distinct wm.user_id
      from public.task_member_completions tmc
      join public.workspace_members wm on wm.id = tmc.member_id
      where tmc.task_id = t.id
        and wm.user_id is not null
      union
      select t.assignee_id
      where t.assignee_id is not null
        and not exists (
          select 1 from public.task_member_completions t2 where t2.task_id = t.id
        )
    loop
      insert into public.points_ledger
        (workspace_id, task_id, user_id, points_amount,
         transaction_type, source_type, cycle, created_by, metadata)
      values
        (p_workspace_id, t.id, r.user_id, t.points_value,
         'earned', 'task', t.points_cycle, v_caller,
         jsonb_build_object('effort_points', t.points_value, 'cycle', t.points_cycle, 'repair', true))
      on conflict (workspace_id, task_id, user_id, transaction_type, cycle)
        where transaction_type = 'earned' and task_id is not null
        do nothing;
      if found then
        v_rows := v_rows + 1;
      end if;
    end loop;
  end loop;

  return jsonb_build_object('scanned_tasks', v_tasks, 'inserted_rows', v_rows);
end;
$$;

grant execute on function public.repair_missing_task_points(uuid) to authenticated;
