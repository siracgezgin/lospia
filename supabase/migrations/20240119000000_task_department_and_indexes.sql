-- =============================================================================
-- Task model: add department_id + missing composite indexes
-- =============================================================================
-- start_date, waiting_on_member_id, waiting_on_contact_id, waiting_reason
-- already exist (added in 20240101 + 20240111). Only department_id is new.
-- =============================================================================

-- 1. Add department_id (FK to workspace_departments, nullable)
alter table public.tasks
  add column if not exists department_id uuid
    references public.workspace_departments(id) on delete set null;

-- 2. Indexes for new and previously missing access patterns
create index if not exists tasks_department_id_idx
  on public.tasks(department_id);

create index if not exists tasks_waiting_on_member_id_idx
  on public.tasks(waiting_on_member_id);

create index if not exists tasks_start_date_idx
  on public.tasks(start_date);

-- Composite indexes used by board / list queries
create index if not exists tasks_workspace_department_status_idx
  on public.tasks(workspace_id, department_id, status);

create index if not exists tasks_workspace_due_status_idx
  on public.tasks(workspace_id, due_date, status);

create index if not exists tasks_workspace_assignee_idx
  on public.tasks(workspace_id, assignee_id);

-- Notifications index (reads: unread by user ordered by time)
create index if not exists notifications_recipient_read_created_idx
  on public.notifications(user_id, is_read, created_at desc);

-- workspace_members fast lookup
create index if not exists workspace_members_workspace_user_idx
  on public.workspace_members(workspace_id, user_id);
