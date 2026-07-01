-- ============================================================================
-- Test-user cleanup — DRY RUN (READ ONLY)
-- ============================================================================
-- Purpose: identify leftover test/demo accounts (e.g. "Test Merkezi",
--          "yeni hesap", "test.uye", "testing") and report EXACTLY what would be
--          affected before anyone deletes anything in production.
--
-- SAFETY: This file contains ONLY SELECTs. It never modifies data. Run it, read
--         the output, and decide. Deletion is done from the app UI
--         (Ayarlar → Üyeler → Sil), which runs removeWorkspaceMemberAccount()
--         and safely re-attributes real task/history authorship to the owner.
--
-- How to run (local):
--   supabase db execute --file scripts/test-user-cleanup-dryrun.sql
-- How to run (prod, read-only): paste into the Supabase SQL editor and Run.
-- ============================================================================

-- Tune this list if the test accounts differ. Matching is case-insensitive on
-- profile full_name / username / email.
with test_candidates as (
  select
    p.id            as user_id,
    p.full_name,
    p.username,
    p.email,
    p.created_at
  from public.profiles p
  where
       p.full_name ilike any (array['%test merkezi%', '%yeni hesap%', '%testing%', 'test"%', '%deneme%'])
    or p.username  ilike any (array['test.uye', 'test_uye', 'testing', 'test%', 'yeni.hesap', 'deneme%'])
    or p.email     ilike any (array['%test%@lospia.local', '%testing%@lospia.local', '%deneme%@lospia.local'])
)
-- 1) The candidate accounts themselves ---------------------------------------
select 'CANDIDATE_USERS' as report, tc.user_id::text as id,
       tc.full_name, tc.username, tc.email, tc.created_at::text as extra
from test_candidates tc
order by tc.created_at;

-- 2) Workspace memberships that would be removed ------------------------------
select 'WORKSPACE_MEMBERS' as report, wm.id::text as id,
       wm.role as full_name, wm.workspace_id::text as username,
       p.email, null as extra
from public.workspace_members wm
join public.profiles p on p.id = wm.user_id
where wm.user_id in (select user_id from test_candidates)
  -- Never touch an owner via cleanup — surfaced so you can see it, but the app
  -- blocks owner deletion regardless.
order by wm.role;

-- 3) Department memberships that would be removed -----------------------------
select 'DEPARTMENT_MEMBERS' as report, dm.id::text as id,
       dm.department_id::text as full_name, dm.workspace_id::text as username,
       null as email, null as extra
from public.department_members dm
join public.workspace_members wm on wm.id = dm.member_id
where wm.user_id in (select user_id from test_candidates);

-- 4) Pending team-access grants (by e-mail) that would be revoked -------------
select 'PENDING_GRANTS' as report, wi.id::text as id,
       wi.username as full_name, wi.role as username, wi.email, null as extra
from public.workspace_invites wi
where wi.accepted_at is null
  and lower(wi.email) in (select lower(email) from test_candidates);

-- 5) FOOTPRINT: real content authored by these users --------------------------
-- These are RE-ATTRIBUTED to the acting owner on deletion (NOT deleted), so real
-- work is preserved. Counts let you confirm nothing important is at stake.
select 'FOOTPRINT_TASKS_CREATED'    as report, count(*)::text as id,
       null as full_name, null as username, null as email, null as extra
from public.tasks where created_by in (select user_id from test_candidates)
union all
select 'FOOTPRINT_TASKS_ASSIGNED', count(*)::text, null, null, null, null
from public.tasks where assignee_id in (select user_id from test_candidates)
union all
select 'FOOTPRINT_TASK_ACTIVITY', count(*)::text, null, null, null, null
from public.task_activity where user_id in (select user_id from test_candidates)
union all
select 'FOOTPRINT_WORKSPACE_NOTES', count(*)::text, null, null, null, null
from public.workspace_notes where created_by in (select user_id from test_candidates)
union all
select 'FOOTPRINT_TASK_NOTES', count(*)::text, null, null, null, null
from public.task_notes where author_id in (select user_id from test_candidates)
union all
select 'FOOTPRINT_ATTACHMENTS', count(*)::text, null, null, null, null
from public.attachments where uploaded_by in (select user_id from test_candidates)
union all
select 'FOOTPRINT_WORKSPACES_CREATED', count(*)::text, null, null, null, null
from public.workspaces where created_by in (select user_id from test_candidates);

-- 6) Per-user task-created breakdown (which real tasks would be re-attributed) -
select 'TASKS_BY_CANDIDATE' as report, t.id::text as id,
       t.title as full_name, tc.username, null as email,
       t.created_at::text as extra
from public.tasks t
join test_candidates tc on tc.user_id = t.created_by
order by tc.username, t.created_at;
