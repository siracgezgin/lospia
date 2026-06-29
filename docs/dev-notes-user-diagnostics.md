# Dev notes — diagnosing a user / Auth cleanup

Internal only. Not exposed in the UI. Run against the local DB
(`docker exec -i supabase_db_<project> psql -U postgres -d postgres`) or via the
Supabase SQL editor on prod. **Read-only** unless noted.

## 1. Full picture for one e-mail

```sql
-- replace the e-mail
with u as (
  select id, email, created_at
  from auth.users
  where lower(email) = lower('asibirgolge@gmail.com')
)
select 'auth.users'        as source, u.id::text, u.email,           null as extra from u
union all
select 'profiles',          p.id::text, p.email, p.full_name           from public.profiles p join u on u.id = p.id
union all
select 'workspace_members', wm.id::text, wm.role, wm.workspace_id::text from public.workspace_members wm join u on u.id = wm.user_id
union all
select 'access_grant',      wi.id::text, wi.role, coalesce(wi.accepted_at::text,'pending') from public.workspace_invites wi join u on lower(wi.email)=lower(u.email)
union all
select 'department_members', dm.id::text, dm.role, dm.department_id::text from public.department_members dm join public.workspace_members wm on wm.id = dm.member_id join u on u.id = wm.user_id
union all
select 'task_completions',  tmc.id::text, null, tmc.task_id::text       from public.task_member_completions tmc join public.workspace_members wm on wm.id = tmc.member_id join u on u.id = wm.user_id
union all
select 'notifications',     n.id::text, null, n.created_at::text         from public.notifications n join u on u.id = n.user_id;
```

## 2. Every FK that references auth.users (should all have ON DELETE)

```sql
select conname, conrelid::regclass as tbl, pg_get_constraintdef(oid) as def
from pg_constraint where contype='f' and confrelid='auth.users'::regclass
order by 1;
```

## 3. Every FK that references profiles (the cascade chain from auth delete)

```sql
select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid) as def
from pg_constraint where contype='f' and confrelid='public.profiles'::regclass
order by 1;
```

A constraint definition **without** `ON DELETE` defaults to `NO ACTION`, which
blocks `delete from auth.users` whenever a referencing row exists. Migration
`20240129000000_auth_user_cleanup_constraints.sql` converted the four historical
ones (`tasks.created_by`, `workspaces.created_by`, `task_activity.user_id`,
`task_attachments.uploaded_by`) to `ON DELETE SET NULL`.

## 4. Normal team management (preferred — no Auth deletion needed)

Removing a person in **Settings → Üyeler → "Çalışma alanından kaldır"** runs
`removeWorkspaceMember`:
- deletes the `workspace_members` row (department assignments cascade away),
- deletes any team-access grant for that e-mail,
- keeps the Auth account and all task / activity history.

The person then hits the "AF Operasyon erişimi yok" screen. Re-adding the e-mail
in "Ekip erişimi" lets the existing Auth user back in on next login.

## 5. Hard-deleting an Auth user (rarely needed)

Only do this if the account must disappear entirely. After the migration above
it succeeds from **Dashboard → Authentication → Users** (or
`auth.admin.deleteUser` server-side with the service role). History rows are
preserved with their actor/creator columns set to NULL.
