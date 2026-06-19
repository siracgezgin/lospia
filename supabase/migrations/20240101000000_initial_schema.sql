-- =============================================================================
-- SpikOS TaskOS — Initial Schema
-- =============================================================================
-- Includes: all tables, indexes, triggers, RLS policies, storage config
-- Apply with: supabase db reset
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Utility: updated_at trigger function
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. profiles
--    Auto-created on auth.users insert via trigger below.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function set_updated_at();

-- Auto-create profile when a new auth user is inserted
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. workspaces
-- ---------------------------------------------------------------------------
create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  avatar_url  text,
  -- Optional: per-workspace Slack incoming webhook URL (feature-flagged)
  slack_webhook_url text,
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger set_workspaces_updated_at
  before update on public.workspaces
  for each row execute function set_updated_at();

create index workspaces_created_by_idx on public.workspaces(created_by);

-- ---------------------------------------------------------------------------
-- 3. workspace_members
-- ---------------------------------------------------------------------------
create type workspace_role as enum ('owner', 'admin', 'member');

create table public.workspace_members (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  role          workspace_role not null default 'member',
  joined_at     timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index workspace_members_workspace_idx on public.workspace_members(workspace_id);
create index workspace_members_user_idx      on public.workspace_members(user_id);

-- ---------------------------------------------------------------------------
-- 4. tasks
-- ---------------------------------------------------------------------------
create type task_status   as enum ('backlog','ready','in_progress','blocked','review','done','archived');
create type task_priority as enum ('low','medium','high','urgent');

create table public.tasks (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  title            text not null,
  description      text,
  status           task_status   not null default 'backlog',
  priority         task_priority not null default 'medium',
  assignee_id      uuid references public.profiles(id) on delete set null,
  due_date         date,
  start_date       date,
  tags             text[] not null default '{}',
  custom_fields    jsonb not null default '{}',
  -- fractional indexing for Kanban ordering (COLLATE "C" for correct string sort)
  fractional_index text collate "C" not null default 'a0',
  created_by       uuid not null references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger set_tasks_updated_at
  before update on public.tasks
  for each row execute function set_updated_at();

create index tasks_workspace_idx         on public.tasks(workspace_id);
create index tasks_assignee_idx          on public.tasks(assignee_id);
create index tasks_status_idx            on public.tasks(status);
create index tasks_due_date_idx          on public.tasks(due_date);
create index tasks_workspace_status_idx  on public.tasks(workspace_id, status);
create index tasks_fractional_index_idx  on public.tasks(workspace_id, status, fractional_index collate "C");

-- ---------------------------------------------------------------------------
-- 5. task_activity  (comments + system events combined)
-- ---------------------------------------------------------------------------
create type task_activity_type as enum (
  'comment',
  'status_change',
  'priority_change',
  'assignee_change',
  'title_change',
  'description_change',
  'due_date_change',
  'start_date_change',
  'tags_change',
  'custom_field_change',
  'timer_start',
  'timer_stop',
  'attachment_add',
  'attachment_remove',
  'created'
);

create table public.task_activity (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references public.profiles(id),
  type         task_activity_type not null,
  -- For comments: the comment body
  content      text,
  -- For system events: structured diff { from, to }
  metadata     jsonb,
  created_at   timestamptz not null default now()
);

create index task_activity_task_idx      on public.task_activity(task_id);
create index task_activity_workspace_idx on public.task_activity(workspace_id);
create index task_activity_user_idx      on public.task_activity(user_id);

-- ---------------------------------------------------------------------------
-- 6. time_entries
-- ---------------------------------------------------------------------------
create table public.time_entries (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  task_id          uuid references public.tasks(id) on delete set null,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  started_at       timestamptz not null default now(),
  stopped_at       timestamptz,
  duration_seconds integer,   -- populated on stop
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger set_time_entries_updated_at
  before update on public.time_entries
  for each row execute function set_updated_at();

create index time_entries_workspace_idx on public.time_entries(workspace_id);
create index time_entries_task_idx      on public.time_entries(task_id);
create index time_entries_user_idx      on public.time_entries(user_id);
create index time_entries_active_idx    on public.time_entries(user_id) where stopped_at is null;

-- Enforce one active timer per user
create or replace function enforce_one_active_timer()
returns trigger language plpgsql as $$
begin
  if new.stopped_at is null then
    if exists (
      select 1 from public.time_entries
      where user_id = new.user_id
        and stopped_at is null
        and id != coalesce(new.id, gen_random_uuid())
    ) then
      raise exception 'User already has an active timer running';
    end if;
  end if;
  return new;
end;
$$;

create trigger check_one_active_timer
  before insert or update on public.time_entries
  for each row execute function enforce_one_active_timer();

-- ---------------------------------------------------------------------------
-- 7. saved_views
-- ---------------------------------------------------------------------------
create table public.saved_views (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id     uuid references public.profiles(id) on delete set null,
  name         text not null,
  -- jsonb: { filters: {...}, sort: {...}, view_type: 'board'|'list' }
  config       jsonb not null default '{}',
  is_shared    boolean not null default false,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger set_saved_views_updated_at
  before update on public.saved_views
  for each row execute function set_updated_at();

create index saved_views_workspace_idx on public.saved_views(workspace_id);
create index saved_views_owner_idx     on public.saved_views(owner_id);

-- ---------------------------------------------------------------------------
-- 8. custom_field_definitions
-- ---------------------------------------------------------------------------
create type custom_field_type as enum ('text','number','select','boolean','date');

create table public.custom_field_definitions (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null,
  field_key    text not null,   -- key used in tasks.custom_fields jsonb
  field_type   custom_field_type not null,
  -- For 'select' type: list of allowed values
  options      jsonb,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, field_key)
);

create trigger set_custom_fields_updated_at
  before update on public.custom_field_definitions
  for each row execute function set_updated_at();

create index custom_field_defs_workspace_idx on public.custom_field_definitions(workspace_id);

-- ---------------------------------------------------------------------------
-- 9. task_attachments  (used only when UPLOADS feature flag is on)
-- ---------------------------------------------------------------------------
create table public.task_attachments (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  uploaded_by   uuid not null references public.profiles(id),
  file_name     text not null,
  file_size     integer not null,   -- bytes
  mime_type     text not null,
  -- Storage path: {workspace_id}/{task_id}/{id}
  storage_path  text not null unique,
  created_at    timestamptz not null default now()
);

create index task_attachments_task_idx      on public.task_attachments(task_id);
create index task_attachments_workspace_idx on public.task_attachments(workspace_id);

-- ---------------------------------------------------------------------------
-- 10. notifications
-- ---------------------------------------------------------------------------
create type notification_type as enum (
  'task_assigned',
  'task_mentioned',
  'task_comment',
  'task_status_changed',
  'task_due_soon',
  'workspace_invite'
);

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  type         notification_type not null,
  title        text not null,
  body         text,
  -- Reference to the entity that triggered the notification
  task_id      uuid references public.tasks(id) on delete set null,
  is_read      boolean not null default false,
  created_at   timestamptz not null default now()
);

create index notifications_user_idx          on public.notifications(user_id);
create index notifications_workspace_idx     on public.notifications(workspace_id);
create index notifications_unread_idx        on public.notifications(user_id) where is_read = false;

-- ---------------------------------------------------------------------------
-- 11. webhook_events  (Slack + email-to-task inbound log)
-- ---------------------------------------------------------------------------
create type webhook_source as enum ('slack', 'email', 'other');

create table public.webhook_events (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid references public.workspaces(id) on delete set null,
  source         webhook_source not null,
  raw_payload    jsonb not null,
  processed      boolean not null default false,
  created_task_id uuid references public.tasks(id) on delete set null,
  error          text,
  created_at     timestamptz not null default now()
);

create index webhook_events_workspace_idx  on public.webhook_events(workspace_id);
create index webhook_events_processed_idx on public.webhook_events(processed);

-- ---------------------------------------------------------------------------
-- Notification fan-out trigger: insert notification when task_activity is created
-- ---------------------------------------------------------------------------
create or replace function notify_on_task_activity()
returns trigger language plpgsql security definer as $$
declare
  v_assignee_id uuid;
  v_task_title  text;
begin
  -- Only fan out for relevant activity types
  if new.type not in ('comment', 'status_change', 'assignee_change') then
    return new;
  end if;

  select assignee_id, title
  into v_assignee_id, v_task_title
  from public.tasks
  where id = new.task_id;

  -- Notify assignee on comment (if not the commenter themselves)
  if new.type = 'comment' and v_assignee_id is not null and v_assignee_id != new.user_id then
    insert into public.notifications (workspace_id, user_id, type, title, body, task_id)
    values (
      new.workspace_id,
      v_assignee_id,
      'task_comment',
      'New comment on: ' || v_task_title,
      new.content,
      new.task_id
    );
  end if;

  -- Notify new assignee when task is assigned
  if new.type = 'assignee_change' then
    declare
      v_new_assignee uuid := (new.metadata->>'to')::uuid;
    begin
      if v_new_assignee is not null and v_new_assignee != new.user_id then
        insert into public.notifications (workspace_id, user_id, type, title, body, task_id)
        values (
          new.workspace_id,
          v_new_assignee,
          'task_assigned',
          'You were assigned: ' || v_task_title,
          null,
          new.task_id
        );
      end if;
    end;
  end if;

  return new;
end;
$$;

create trigger on_task_activity_created
  after insert on public.task_activity
  for each row execute function notify_on_task_activity();

-- ---------------------------------------------------------------------------
-- RPC functions for Dashboard (server-side aggregation)
-- ---------------------------------------------------------------------------

-- Tile 1: task counts by status for a workspace
create or replace function get_tasks_by_status(p_workspace_id uuid)
returns table(status task_status, count bigint)
language sql security definer
as $$
  select t.status, count(*) as count
  from public.tasks t
  where t.workspace_id = p_workspace_id
    and t.status != 'archived'
  group by t.status;
$$;

-- Tile 2: time logged this week (in seconds) for current user
create or replace function get_time_logged_this_week(p_workspace_id uuid, p_user_id uuid)
returns integer
language sql security definer
as $$
  select coalesce(sum(duration_seconds), 0)::integer
  from public.time_entries
  where workspace_id = p_workspace_id
    and user_id = p_user_id
    and started_at >= date_trunc('week', now());
$$;

-- Tile 3: overdue + due within 7 days tasks
create or replace function get_due_soon_tasks(p_workspace_id uuid)
returns table(
  id uuid, title text, status task_status, priority task_priority,
  due_date date, assignee_id uuid
)
language sql security definer
as $$
  select t.id, t.title, t.status, t.priority, t.due_date, t.assignee_id
  from public.tasks t
  where t.workspace_id = p_workspace_id
    and t.status not in ('done', 'archived')
    and t.due_date is not null
    and t.due_date <= current_date + interval '7 days'
  order by t.due_date asc
  limit 20;
$$;

-- Today's and this-week's time totals for a user on a task
create or replace function get_task_time_totals(p_task_id uuid, p_user_id uuid)
returns table(today_seconds integer, week_seconds integer)
language sql security definer
as $$
  select
    coalesce(sum(case when started_at >= current_date then duration_seconds end), 0)::integer as today_seconds,
    coalesce(sum(case when started_at >= date_trunc('week', now()) then duration_seconds end), 0)::integer as week_seconds
  from public.time_entries
  where task_id = p_task_id
    and user_id = p_user_id
    and stopped_at is not null;
$$;

-- =============================================================================
-- ROW LEVEL SECURITY
-- All policies use workspace_members for access checks on indexed columns.
-- =============================================================================

-- Helper: is the current user a member of this workspace?
create or replace function is_workspace_member(p_workspace_id uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = auth.uid()
  );
$$;

-- Helper: is the current user owner or admin of this workspace?
create or replace function is_workspace_admin(p_workspace_id uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

-- ---- profiles ----
alter table public.profiles enable row level security;
create policy "profiles: users can view own or workspace-shared profiles"
  on public.profiles for select using (
    id = auth.uid()
    or exists (
      select 1 from public.workspace_members wm
      where wm.user_id = profiles.id
        and is_workspace_member(wm.workspace_id)
    )
  );
create policy "profiles: users can update own profile"
  on public.profiles for update using (id = auth.uid());

-- ---- workspaces ----
alter table public.workspaces enable row level security;
create policy "workspaces: members can select"
  on public.workspaces for select using (is_workspace_member(id));
create policy "workspaces: owner/admin can update"
  on public.workspaces for update using (is_workspace_admin(id));
create policy "workspaces: authenticated users can create"
  on public.workspaces for insert with check (auth.uid() is not null);

-- ---- workspace_members ----
alter table public.workspace_members enable row level security;
create policy "workspace_members: members can view"
  on public.workspace_members for select using (is_workspace_member(workspace_id));
create policy "workspace_members: owner/admin can insert"
  on public.workspace_members for insert with check (is_workspace_admin(workspace_id));
create policy "workspace_members: owner/admin can update"
  on public.workspace_members for update using (is_workspace_admin(workspace_id));
create policy "workspace_members: owner/admin can delete"
  on public.workspace_members for delete using (is_workspace_admin(workspace_id));

-- ---- tasks ----
alter table public.tasks enable row level security;
create policy "tasks: members can select"
  on public.tasks for select using (is_workspace_member(workspace_id));
create policy "tasks: members can insert"
  on public.tasks for insert with check (is_workspace_member(workspace_id) and auth.uid() is not null);
create policy "tasks: members can update"
  on public.tasks for update using (is_workspace_member(workspace_id));
create policy "tasks: owner/admin can delete"
  on public.tasks for delete using (is_workspace_admin(workspace_id));

-- ---- task_activity ----
alter table public.task_activity enable row level security;
create policy "task_activity: members can select"
  on public.task_activity for select using (is_workspace_member(workspace_id));
create policy "task_activity: members can insert"
  on public.task_activity for insert with check (is_workspace_member(workspace_id) and user_id = auth.uid());

-- ---- time_entries ----
alter table public.time_entries enable row level security;
create policy "time_entries: members can select own entries"
  on public.time_entries for select using (is_workspace_member(workspace_id));
create policy "time_entries: members can insert own entries"
  on public.time_entries for insert with check (is_workspace_member(workspace_id) and user_id = auth.uid());
create policy "time_entries: users can update own entries"
  on public.time_entries for update using (user_id = auth.uid());
create policy "time_entries: users can delete own entries"
  on public.time_entries for delete using (user_id = auth.uid());

-- ---- saved_views ----
alter table public.saved_views enable row level security;
create policy "saved_views: members can select shared or own views"
  on public.saved_views for select using (
    is_workspace_member(workspace_id)
    and (is_shared = true or owner_id = auth.uid())
  );
create policy "saved_views: members can insert views"
  on public.saved_views for insert with check (is_workspace_member(workspace_id) and owner_id = auth.uid());
create policy "saved_views: owners can update own views"
  on public.saved_views for update using (owner_id = auth.uid());
create policy "saved_views: owners can delete own views"
  on public.saved_views for delete using (owner_id = auth.uid());

-- ---- custom_field_definitions ----
alter table public.custom_field_definitions enable row level security;
create policy "custom_fields: members can select"
  on public.custom_field_definitions for select using (is_workspace_member(workspace_id));
create policy "custom_fields: admin can insert"
  on public.custom_field_definitions for insert with check (is_workspace_admin(workspace_id));
create policy "custom_fields: admin can update"
  on public.custom_field_definitions for update using (is_workspace_admin(workspace_id));
create policy "custom_fields: admin can delete"
  on public.custom_field_definitions for delete using (is_workspace_admin(workspace_id));

-- ---- task_attachments ----
alter table public.task_attachments enable row level security;
create policy "task_attachments: members can select"
  on public.task_attachments for select using (is_workspace_member(workspace_id));
create policy "task_attachments: members can insert"
  on public.task_attachments for insert with check (is_workspace_member(workspace_id) and uploaded_by = auth.uid());
create policy "task_attachments: uploader/admin can delete"
  on public.task_attachments for delete using (
    uploaded_by = auth.uid() or is_workspace_admin(workspace_id)
  );

-- ---- notifications ----
alter table public.notifications enable row level security;
create policy "notifications: users can select own"
  on public.notifications for select using (user_id = auth.uid());
create policy "notifications: system can insert (security definer functions)"
  on public.notifications for insert with check (user_id = auth.uid() or auth.uid() is not null);
create policy "notifications: users can update own (mark read)"
  on public.notifications for update using (user_id = auth.uid());

-- ---- webhook_events ----
alter table public.webhook_events enable row level security;
create policy "webhook_events: admin can select"
  on public.webhook_events for select using (
    workspace_id is null or is_workspace_admin(workspace_id)
  );
-- Inserts happen via service role in API routes — no user-level insert policy needed

-- =============================================================================
-- Storage: task-attachments bucket
-- (Bucket creation must be done via Supabase dashboard or CLI; policies below
--  assume the bucket "task-attachments" exists.)
-- =============================================================================

-- Storage policies are defined in storage.objects table.
-- Workspace-scoped path: task-attachments/{workspace_id}/{task_id}/{file_id}

-- Allow workspace members to read attachments within their workspace
create policy "storage: members can read workspace attachments"
  on storage.objects for select using (
    bucket_id = 'task-attachments'
    and auth.uid() is not null
    and is_workspace_member((storage.foldername(name))[1]::uuid)
  );

-- Allow members to upload attachments into their workspace folder
create policy "storage: members can upload workspace attachments"
  on storage.objects for insert with check (
    bucket_id = 'task-attachments'
    and auth.uid() is not null
    and is_workspace_member((storage.foldername(name))[1]::uuid)
  );

-- Allow uploader or admin to delete attachments
create policy "storage: uploader or admin can delete attachments"
  on storage.objects for delete using (
    bucket_id = 'task-attachments'
    and auth.uid() is not null
    and (
      owner = auth.uid()
      or is_workspace_admin((storage.foldername(name))[1]::uuid)
    )
  );
