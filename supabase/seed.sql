-- =============================================================================
-- SpikOS TaskOS — Development Seed Data
-- =============================================================================
-- Applied automatically by: supabase db reset
--
-- Creates:
--   2 users (alice + bob) with profiles
--   1 workspace (spikos-dev)
--   2 workspace_members
--   3 custom field definitions
--   4 saved views
--   22 tasks spread across all statuses and priorities
--
-- Login credentials (local Supabase):
--   alice@taskos.local  / password: TaskOS2024!
--   bob@taskos.local    / password: TaskOS2024!
-- =============================================================================

-- Use fixed UUIDs so seed is idempotent
do $$
declare
  v_alice_id    uuid := '00000000-0000-0000-0000-000000000001';
  v_bob_id      uuid := '00000000-0000-0000-0000-000000000002';
  v_ws_id       uuid := '00000000-0000-0000-0000-000000000010';

  v_cf_text     uuid := '00000000-0000-0000-0000-000000000020';
  v_cf_select   uuid := '00000000-0000-0000-0000-000000000021';
  v_cf_bool     uuid := '00000000-0000-0000-0000-000000000022';

  v_sv_my_open  uuid := '00000000-0000-0000-0000-000000000030';
  v_sv_due_week uuid := '00000000-0000-0000-0000-000000000031';
  v_sv_blocked  uuid := '00000000-0000-0000-0000-000000000032';
  v_sv_high_pri uuid := '00000000-0000-0000-0000-000000000033';

begin

  -- -------------------------------------------------------------------------
  -- Auth users (Supabase internal — use auth admin API or raw insert for seed)
  -- -------------------------------------------------------------------------
  -- Insert directly into auth.users for local dev seed
  insert into auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_user_meta_data, raw_app_meta_data,
    role, aud,
    is_super_admin, is_sso_user
  ) values
  (
    v_alice_id,
    '00000000-0000-0000-0000-000000000000',
    'alice@taskos.local',
    crypt('TaskOS2024!', gen_salt('bf')),
    now(), now(), now(),
    '{"full_name": "Alice Yıldız"}'::jsonb,
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    'authenticated', 'authenticated',
    false, false
  ),
  (
    v_bob_id,
    '00000000-0000-0000-0000-000000000000',
    'bob@taskos.local',
    crypt('TaskOS2024!', gen_salt('bf')),
    now(), now(), now(),
    '{"full_name": "Bob Kaya"}'::jsonb,
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    'authenticated', 'authenticated',
    false, false
  )
  on conflict (id) do nothing;

  -- -------------------------------------------------------------------------
  -- Profiles (normally auto-created by trigger; seed explicitly for safety)
  -- -------------------------------------------------------------------------
  insert into public.profiles (id, email, full_name) values
    (v_alice_id, 'alice@taskos.local', 'Alice Yıldız'),
    (v_bob_id,   'bob@taskos.local',   'Bob Kaya')
  on conflict (id) do nothing;

  -- -------------------------------------------------------------------------
  -- Workspace
  -- -------------------------------------------------------------------------
  insert into public.workspaces (id, name, slug, created_by) values
    (v_ws_id, 'SpikOS Dev', 'spikos-dev', v_alice_id)
  on conflict (id) do nothing;

  -- -------------------------------------------------------------------------
  -- Workspace members
  -- -------------------------------------------------------------------------
  insert into public.workspace_members (workspace_id, user_id, role) values
    (v_ws_id, v_alice_id, 'owner'),
    (v_ws_id, v_bob_id,   'member')
  on conflict (workspace_id, user_id) do nothing;

  -- -------------------------------------------------------------------------
  -- Custom field definitions
  -- -------------------------------------------------------------------------
  insert into public.custom_field_definitions (id, workspace_id, name, field_key, field_type, options, position) values
  (
    v_cf_text, v_ws_id, 'External Link', 'external_link', 'text', null, 0
  ),
  (
    v_cf_select, v_ws_id, 'Team', 'team',
    'select',
    '["Frontend", "Backend", "Design", "DevOps"]'::jsonb,
    1
  ),
  (
    v_cf_bool, v_ws_id, 'Needs Review', 'needs_review', 'boolean', null, 2
  )
  on conflict (workspace_id, field_key) do nothing;

  -- -------------------------------------------------------------------------
  -- Saved views
  -- -------------------------------------------------------------------------
  insert into public.saved_views (id, workspace_id, owner_id, name, config, is_shared, position) values
  (
    v_sv_my_open, v_ws_id, v_alice_id, 'My open tasks',
    '{"filters": {"assignee": "me", "status": ["backlog","ready","in_progress","blocked","review"]}, "sort": {"field": "due_date", "direction": "asc"}, "view_type": "board"}'::jsonb,
    true, 0
  ),
  (
    v_sv_due_week, v_ws_id, v_alice_id, 'Due this week',
    '{"filters": {"due_within_days": 7, "status": ["backlog","ready","in_progress","blocked","review"]}, "sort": {"field": "due_date", "direction": "asc"}, "view_type": "list"}'::jsonb,
    true, 1
  ),
  (
    v_sv_blocked, v_ws_id, v_alice_id, 'Blocked',
    '{"filters": {"status": ["blocked"]}, "sort": {"field": "priority", "direction": "desc"}, "view_type": "list"}'::jsonb,
    true, 2
  ),
  (
    v_sv_high_pri, v_ws_id, v_alice_id, 'High priority',
    '{"filters": {"priority": ["high","urgent"]}, "sort": {"field": "due_date", "direction": "asc"}, "view_type": "board"}'::jsonb,
    true, 3
  )
  on conflict (id) do nothing;

  -- -------------------------------------------------------------------------
  -- Tasks (22 tasks across all 7 statuses)
  -- -------------------------------------------------------------------------
  insert into public.tasks (workspace_id, title, description, status, priority, assignee_id, due_date, start_date, tags, custom_fields, fractional_index, created_by) values

  -- BACKLOG (4)
  (v_ws_id, 'Design new onboarding flow',
   'Create wireframes and user journey for the new onboarding experience.',
   'backlog', 'high', v_alice_id,
   current_date + 14, current_date,
   '{ux,design}',
   '{"team": "Design", "external_link": "https://figma.com/stub"}'::jsonb,
   'a0', v_alice_id),

  (v_ws_id, 'Set up CI/CD pipeline',
   'Configure GitHub Actions for lint, test, and build on every PR.',
   'backlog', 'medium', v_bob_id,
   current_date + 21, null,
   '{devops,infra}',
   '{"team": "DevOps", "needs_review": false}'::jsonb,
   'a1', v_alice_id),

  (v_ws_id, 'Research billing integration',
   'Evaluate Stripe vs Paddle for subscription management.',
   'backlog', 'low', null,
   current_date + 30, null,
   '{billing,research}',
   '{}'::jsonb,
   'a2', v_bob_id),

  (v_ws_id, 'Write API documentation',
   'Document all public API endpoints with examples using OpenAPI.',
   'backlog', 'medium', null,
   current_date + 45, null,
   '{docs,api}',
   '{"team": "Backend"}'::jsonb,
   'a3', v_alice_id),

  -- READY (4)
  (v_ws_id, 'Implement Kanban drag-and-drop',
   'Use dnd-kit to enable card reordering within and across status columns.',
   'ready', 'urgent', v_alice_id,
   current_date + 3, current_date - 2,
   '{frontend,feature}',
   '{"team": "Frontend", "needs_review": true}'::jsonb,
   'a0', v_alice_id),

  (v_ws_id, 'Add dark mode support',
   'Implement Tailwind dark mode toggle; persist preference in localStorage.',
   'ready', 'low', v_bob_id,
   current_date + 10, null,
   '{frontend,ui}',
   '{"team": "Frontend"}'::jsonb,
   'a1', v_bob_id),

  (v_ws_id, 'Database backup strategy',
   'Set up automated nightly backups for production Postgres.',
   'ready', 'high', v_bob_id,
   current_date + 7, null,
   '{devops,database}',
   '{"team": "DevOps"}'::jsonb,
   'a2', v_alice_id),

  (v_ws_id, 'User profile settings page',
   'Allow users to update their name, avatar, and password.',
   'ready', 'medium', v_alice_id,
   current_date + 12, null,
   '{frontend,auth}',
   '{"team": "Frontend"}'::jsonb,
   'a3', v_alice_id),

  -- IN_PROGRESS (4)
  (v_ws_id, 'RLS policy audit',
   'Review all Row Level Security policies for correctness and performance.',
   'in_progress', 'urgent', v_alice_id,
   current_date + 2, current_date - 1,
   '{security,database}',
   '{"team": "Backend", "needs_review": true}'::jsonb,
   'a0', v_alice_id),

  (v_ws_id, 'Notification bell component',
   'Build header notification bell with unread badge and popover list.',
   'in_progress', 'medium', v_bob_id,
   current_date + 5, current_date,
   '{frontend,notifications}',
   '{"team": "Frontend"}'::jsonb,
   'a1', v_bob_id),

  (v_ws_id, 'Time tracking server actions',
   'Implement startTimer / stopTimer server actions with one-active-timer enforcement.',
   'in_progress', 'high', v_alice_id,
   current_date + 4, current_date - 1,
   '{backend,feature}',
   '{"team": "Backend"}'::jsonb,
   'a2', v_alice_id),

  (v_ws_id, 'TanStack Table list view',
   'Implement /list route with sorting and filtering using TanStack Table.',
   'in_progress', 'high', v_bob_id,
   current_date + 6, current_date,
   '{frontend,feature}',
   '{"team": "Frontend", "needs_review": false}'::jsonb,
   'a3', v_bob_id),

  -- BLOCKED (2)
  (v_ws_id, 'Email-to-task inbound route',
   'Blocked on DNS configuration for email routing. Route is written; awaiting MX records.',
   'blocked', 'medium', v_alice_id,
   current_date - 2, current_date - 7,
   '{backend,email,blocked}',
   '{"team": "Backend"}'::jsonb,
   'a0', v_alice_id),

  (v_ws_id, 'Mobile responsive layout',
   'Blocked: waiting for final design specs from the design team.',
   'blocked', 'high', v_bob_id,
   current_date + 1, current_date - 3,
   '{frontend,mobile,blocked}',
   '{"team": "Design"}'::jsonb,
   'a1', v_bob_id),

  -- REVIEW (2)
  (v_ws_id, 'Dashboard analytics tiles',
   'Three dashboard tiles using Recharts. Ready for review.',
   'review', 'high', v_alice_id,
   current_date + 1, current_date - 4,
   '{frontend,dashboard}',
   '{"team": "Frontend", "needs_review": true}'::jsonb,
   'a0', v_alice_id),

  (v_ws_id, 'Supabase SSR auth middleware',
   'Session-based middleware protecting /app routes. Review and merge.',
   'review', 'urgent', v_bob_id,
   current_date, current_date - 5,
   '{backend,auth,security}',
   '{"team": "Backend", "needs_review": true}'::jsonb,
   'a1', v_bob_id),

  -- DONE (4)
  (v_ws_id, 'Project scaffold (Phase 0)',
   'Next.js 16 project bootstrapped with all dependencies installed.',
   'done', 'medium', v_alice_id,
   current_date - 5, current_date - 7,
   '{infra,done}',
   '{"team": "DevOps"}'::jsonb,
   'a0', v_alice_id),

  (v_ws_id, 'Database schema design',
   'All 12 tables, indexes, triggers, and RLS policies written.',
   'done', 'urgent', v_alice_id,
   current_date - 3, current_date - 6,
   '{backend,database,done}',
   '{"team": "Backend"}'::jsonb,
   'a1', v_alice_id),

  (v_ws_id, 'Rename git branch master → main',
   'Completed before first commit.',
   'done', 'low', v_alice_id,
   current_date - 10, current_date - 10,
   '{infra,git}',
   '{"team": "DevOps"}'::jsonb,
   'a2', v_alice_id),

  (v_ws_id, 'Environment variable setup',
   '.env.example created with all feature flags. .env.local template ready.',
   'done', 'medium', v_bob_id,
   current_date - 8, current_date - 8,
   '{infra,config}',
   '{"team": "DevOps"}'::jsonb,
   'a3', v_bob_id),

  -- ARCHIVED (2)
  (v_ws_id, '[ARCHIVED] Old Trello board migration plan',
   'Superseded by TaskOS. Archived.',
   'archived', 'low', null,
   null, null,
   '{archived,planning}',
   '{}'::jsonb,
   'a0', v_alice_id),

  (v_ws_id, '[ARCHIVED] Spike: evaluate Linear API',
   'Decided to build our own instead. Archived for reference.',
   'archived', 'low', null,
   null, null,
   '{archived,research}',
   '{}'::jsonb,
   'a1', v_bob_id);

end $$;
