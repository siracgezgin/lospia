-- =============================================================================
-- Task visibility — "Görev Görünürlüğü"
-- =============================================================================
-- Some tasks are financial / managerial / strategic / sensitive and must not be
-- visible to the whole team. A task now carries a `visibility`:
--   • 'workspace'  → everyone (the relevant team) — unchanged behaviour
--   • 'admin_only' → only owner/admin roles can see, manage, report, notify
--
-- This is enforced at the DATABASE level (RLS), never by UI-hiding alone. A
-- member who guesses a task id, a notes/activity/completion row, or an old
-- notification must still be blocked.
--
-- Idempotent and non-destructive: safe to re-run. Existing tasks default to
-- 'workspace', so current behaviour is preserved. Do NOT run
-- `supabase db reset` in production — apply with `supabase db push`.
-- =============================================================================

-- 1. Column + constraint -----------------------------------------------------
alter table public.tasks
  add column if not exists visibility text not null default 'workspace';

alter table public.tasks
  drop constraint if exists tasks_visibility_check;
alter table public.tasks
  add constraint tasks_visibility_check
  check (visibility in ('workspace', 'admin_only'));

-- 2. Indexes -----------------------------------------------------------------
create index if not exists tasks_workspace_visibility_idx
  on public.tasks (workspace_id, visibility);
create index if not exists tasks_workspace_status_visibility_idx
  on public.tasks (workspace_id, status, visibility);

-- 3. Access helper -----------------------------------------------------------
-- True when the current user may see a given task: they are a member of its
-- workspace AND (the task is workspace-wide OR they are an owner/admin).
-- SECURITY DEFINER so related-table policies can join to tasks without their
-- own RLS interfering, and so there is no recursion back into a tasks policy.
create or replace function public.can_access_task(p_task_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.tasks t
    where t.id = p_task_id
      and is_workspace_member(t.workspace_id)
      and (t.visibility = 'workspace' or is_workspace_admin(t.workspace_id))
  );
$$;

grant execute on function public.can_access_task(uuid) to authenticated;

-- 4. tasks RLS — members never see/update admin_only -------------------------
-- SELECT: members see only 'workspace' tasks; owner/admin see everything.
drop policy if exists "tasks: members can select" on public.tasks;
create policy "tasks: members can select"
  on public.tasks for select using (
    is_workspace_member(workspace_id)
    and (visibility = 'workspace' or is_workspace_admin(workspace_id))
  );

-- UPDATE: the SELECT `using` clause does not gate UPDATE, so without this a
-- member could mutate an admin_only row by guessing its id. Restrict the same
-- way. (Delete is already owner/admin-only.)
drop policy if exists "tasks: members can update" on public.tasks;
create policy "tasks: members can update"
  on public.tasks for update using (
    is_workspace_member(workspace_id)
    and (visibility = 'workspace' or is_workspace_admin(workspace_id))
  );

-- 5. Related tables — no indirect leak of admin_only tasks -------------------
-- Each row's task must be accessible to the current user. task_id is NOT NULL on
-- these tables, so a plain can_access_task() check is sufficient.
drop policy if exists "task_activity: members can select" on public.task_activity;
create policy "task_activity: members can select"
  on public.task_activity for select using (
    is_workspace_member(workspace_id) and can_access_task(task_id)
  );

drop policy if exists "task_notes: members can select" on public.task_notes;
create policy "task_notes: members can select"
  on public.task_notes for select using (
    is_workspace_member(workspace_id) and can_access_task(task_id)
  );

drop policy if exists "completions: members read" on public.task_member_completions;
create policy "completions: members read"
  on public.task_member_completions for select using (
    is_workspace_member(workspace_id) and can_access_task(task_id)
  );

drop policy if exists "task_activity_logs: members can select" on public.task_activity_logs;
create policy "task_activity_logs: members can select"
  on public.task_activity_logs for select using (
    is_workspace_member(workspace_id) and can_access_task(task_id)
  );

drop policy if exists "task_attachments: members can select" on public.task_attachments;
create policy "task_attachments: members can select"
  on public.task_attachments for select using (
    is_workspace_member(workspace_id) and can_access_task(task_id)
  );

-- notifications: a member must not read a notification that points at an
-- admin_only task — this closes the "old notification still references a now
-- hidden task" leak. task_id is nullable, so workspace-less / task-less
-- notifications stay visible to their owner.
drop policy if exists "notifications: users can select own" on public.notifications;
create policy "notifications: users can select own"
  on public.notifications for select using (
    user_id = auth.uid()
    and (task_id is null or can_access_task(task_id))
  );

-- 6. Points — admin_only tasks only ever award owner/admin people ------------
-- The app layer already prevents members from being responsible on admin_only
-- tasks, but finalise/repair are SECURITY DEFINER and must be safe on their own:
-- on an admin_only task they skip any responsible person who is not owner/admin
-- (e.g. legacy data), so a member can never gain points from a hidden task.
create or replace function public.finalize_task_points(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws         uuid;
  v_points     int;
  v_status     task_status;
  v_cycle      int;
  v_assignee   uuid;
  v_visibility text;
  v_caller     uuid := auth.uid();
  v_awarded    jsonb := '[]'::jsonb;
  v_skipped    uuid := null;
  r record;
begin
  select workspace_id, points_value, status, points_cycle, assignee_id, visibility
    into v_ws, v_points, v_status, v_cycle, v_assignee, v_visibility
  from public.tasks where id = p_task_id;

  if v_ws is null then
    return jsonb_build_object('error', 'task_not_found');
  end if;

  if not is_workspace_admin(v_ws) then
    raise exception 'not authorized to finalize points';
  end if;

  if v_status <> 'done' then
    return jsonb_build_object('error', 'task_not_done');
  end if;

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
    -- Admin_only safety: never award a non-admin on a hidden task.
    if v_visibility = 'admin_only' and not exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = v_ws and wm.user_id = r.user_id
        and wm.role in ('owner', 'admin')
    ) then
      continue;
    end if;

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

create or replace function public.repair_missing_task_points(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_tasks  int := 0;
  v_rows   int := 0;
  t record;
  r record;
begin
  if not is_workspace_admin(p_workspace_id) then
    raise exception 'not authorized to repair points';
  end if;

  for t in
    select id, points_value, points_cycle, assignee_id, visibility
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
      -- Admin_only safety: skip non-admin responsibles on hidden tasks.
      if t.visibility = 'admin_only' and not exists (
        select 1 from public.workspace_members wm
        where wm.workspace_id = p_workspace_id and wm.user_id = r.user_id
          and wm.role in ('owner', 'admin')
      ) then
        continue;
      end if;

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

-- 7. Reload PostgREST's schema cache --------------------------------------------
-- The new `visibility` column must be known to the API layer immediately. Without
-- this, a server query that filters `.eq("visibility","workspace")` (the member
-- path) hits an unknown column and returns nothing — which looks like "the member
-- suddenly sees no tasks" while the admin (no such filter) still works. Notifying
-- pgrst makes the column queryable the moment the migration is applied, in every
-- environment (db push / db reset / direct apply).
notify pgrst, 'reload schema';
