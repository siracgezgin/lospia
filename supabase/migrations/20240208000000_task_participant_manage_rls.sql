-- =============================================================================
-- Align task_member_completions RLS with the app assignment-permission model
-- =============================================================================
-- The app rule (canManageTaskAssignment, enforced in setTaskParticipants):
--   • owner/admin manage responsible people on ANY task
--   • the task CREATOR manages their own task (incl. picking the initial
--     responsibles in the create modal)
--   • a CURRENT responsible participant may hand the task off
--   • a member can never add themselves to someone else's task (server gate)
--
-- The original insert/delete policies only allowed "admin, or your own
-- membership row". A non-admin creator picking OTHER people therefore hit an
-- RLS violation — and because it was a single batch insert, Postgres rejected
-- ALL rows (their own included) while activity/notifications were still
-- written: the task showed "Henüz sorumlu kişi atanmadı" despite the log.
-- This migration adds the creator / current-participant clauses. No schema
-- change, no new table.
--
-- SECURITY DEFINER helper: a policy on task_member_completions cannot query
-- its own table (RLS self-recursion); a definer function bypasses that — the
-- same pattern as is_workspace_member / is_workspace_admin.

create or replace function public.can_manage_task_participants(
  p_task_id uuid,
  p_workspace_id uuid,
  p_member_id uuid
) returns boolean
language sql security definer set search_path = public as $$
  select
    -- the actor must be the task's creator, a workspace admin, or a current
    -- responsible participant of this task…
    exists (
      select 1 from public.tasks t
      where t.id = p_task_id
        and t.workspace_id = p_workspace_id
        and (
          t.created_by = auth.uid()
          or public.is_workspace_admin(t.workspace_id)
          or exists (
            select 1
            from public.task_member_completions c
            join public.workspace_members wm on wm.id = c.member_id
            where c.task_id = t.id
              and wm.user_id = auth.uid()
          )
        )
    )
    -- …and the targeted membership row must belong to the same workspace
    -- (blocks cross-workspace member injection).
    and exists (
      select 1 from public.workspace_members wm2
      where wm2.id = p_member_id
        and wm2.workspace_id = p_workspace_id
    );
$$;

drop policy if exists "completions: insert own or admin" on public.task_member_completions;
create policy "completions: insert own, creator, responsible or admin"
  on public.task_member_completions for insert
  with check (
    can_manage_task_participants(task_id, workspace_id, member_id)
    or exists (
      select 1 from public.workspace_members wm
      where wm.id = task_member_completions.member_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "completions: delete own or admin" on public.task_member_completions;
create policy "completions: delete own, creator, responsible or admin"
  on public.task_member_completions for delete
  using (
    can_manage_task_participants(task_id, workspace_id, member_id)
    or exists (
      select 1 from public.workspace_members wm
      where wm.id = task_member_completions.member_id
        and wm.user_id = auth.uid()
    )
  );

-- The UPDATE policy ("completions: update own or admin") is intentionally
-- untouched: toggling a completion stays personal (own row) or admin-only.
