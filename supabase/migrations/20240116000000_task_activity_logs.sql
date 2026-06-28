-- ============================================================================
-- Phase 2A — Activity Log / Audit Trail
-- Dedicated, append-only audit table for task lifecycle changes.
-- Separate from `task_activity` (which combines comments + notification events).
-- ============================================================================

create table public.task_activity_logs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id      uuid not null references public.tasks(id) on delete cascade,
  actor_id     uuid references public.profiles(id) on delete set null,
  action       text not null,
  field_name   text,
  old_value    jsonb,
  new_value    jsonb,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

-- Indexes for the common access patterns (workspace feed, per-task feed, per-actor)
create index task_activity_logs_workspace_created_idx
  on public.task_activity_logs (workspace_id, created_at desc);
create index task_activity_logs_task_created_idx
  on public.task_activity_logs (task_id, created_at desc);
create index task_activity_logs_actor_created_idx
  on public.task_activity_logs (actor_id, created_at desc);

-- ---- RLS ----
-- Mirrors the existing workspace_members-based style via the SECURITY DEFINER
-- helper is_workspace_member(), which avoids recursive policy evaluation.
alter table public.task_activity_logs enable row level security;

-- Workspace members can read logs for their own workspace only.
create policy "task_activity_logs: members can select"
  on public.task_activity_logs for select
  using (is_workspace_member(workspace_id));

-- Workspace members can insert logs only for their own workspace, and only as
-- themselves (actor_id must be the caller). No anonymous access, no cross-workspace.
create policy "task_activity_logs: members can insert"
  on public.task_activity_logs for insert
  with check (is_workspace_member(workspace_id) and actor_id = auth.uid());

-- No update / delete policies: the audit trail is append-only for clients.
-- (Rows are removed only via ON DELETE CASCADE when a task is hard-deleted.)
