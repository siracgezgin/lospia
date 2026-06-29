-- =============================================================================
-- Repair auth.users delete behaviour (cleanup constraints)
-- =============================================================================
-- Deleting a user in Supabase Dashboard → Authentication → Users failed with
-- "Database error deleting user". Root cause: profiles.id references
-- auth.users(id) ON DELETE CASCADE, so deleting an auth user tries to delete the
-- profile row — but four public FKs pointed at profiles(id) with the default
-- NO ACTION rule and on NOT NULL columns, which RESTRICTED the cascade whenever
-- the user had ever created a task / workspace / activity / attachment:
--
--   tasks.created_by              → tasks_created_by_fkey            (NO ACTION)
--   workspaces.created_by         → workspaces_created_by_fkey       (NO ACTION)
--   task_activity.user_id         → task_activity_user_id_fkey       (NO ACTION)
--   task_attachments.uploaded_by  → task_attachments_uploaded_by_fkey(NO ACTION)
--
-- These are all HISTORICAL / audit references. We must preserve the rows (the
-- task, the workspace, the activity entry, the attachment) and merely forget who
-- the actor was. So we make each column nullable and recreate the FK with
-- ON DELETE SET NULL. No data is deleted; no other FK is weakened.
--
-- Membership / identity tables already cascade correctly and are NOT touched:
--   profiles.id                   → CASCADE   (auth user delete removes profile)
--   workspace_members.user_id     → CASCADE   (removes membership)
--   notifications.user_id         → CASCADE
--   time_entries.user_id          → CASCADE
--   department_members.member_id  → CASCADE via workspace_members
-- And the remaining history references already use SET NULL:
--   tasks.assignee_id, task_activity_logs.actor_id, task_notes.author_id,
--   saved_views.owner_id, workspace_invites.*, workspace_notes.created_by,
--   workspace_rules.created_by, tasks.waiting_on_member_id
--
-- Fully idempotent: safe to re-run, safe to apply to prod without a reset.
-- =============================================================================

-- ── tasks.created_by → SET NULL ──────────────────────────────────────────────
alter table public.tasks
  alter column created_by drop not null;

alter table public.tasks
  drop constraint if exists tasks_created_by_fkey;

alter table public.tasks
  add constraint tasks_created_by_fkey
  foreign key (created_by)
  references public.profiles(id)
  on delete set null;

-- ── workspaces.created_by → SET NULL ─────────────────────────────────────────
-- Deleting the workspace creator must never delete the workspace itself.
alter table public.workspaces
  alter column created_by drop not null;

alter table public.workspaces
  drop constraint if exists workspaces_created_by_fkey;

alter table public.workspaces
  add constraint workspaces_created_by_fkey
  foreign key (created_by)
  references public.profiles(id)
  on delete set null;

-- ── task_activity.user_id → SET NULL ─────────────────────────────────────────
-- Audit trail: keep the activity row, forget the actor.
alter table public.task_activity
  alter column user_id drop not null;

alter table public.task_activity
  drop constraint if exists task_activity_user_id_fkey;

alter table public.task_activity
  add constraint task_activity_user_id_fkey
  foreign key (user_id)
  references public.profiles(id)
  on delete set null;

-- ── task_attachments.uploaded_by → SET NULL ──────────────────────────────────
alter table public.task_attachments
  alter column uploaded_by drop not null;

alter table public.task_attachments
  drop constraint if exists task_attachments_uploaded_by_fkey;

alter table public.task_attachments
  add constraint task_attachments_uploaded_by_fkey
  foreign key (uploaded_by)
  references public.profiles(id)
  on delete set null;
