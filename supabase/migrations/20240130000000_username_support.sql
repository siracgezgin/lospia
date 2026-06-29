-- =============================================================================
-- Username support for AF Operasyon signup / login
-- =============================================================================
-- Keeps the existing allowed-email security model and adds a username that the
-- admin defines per access grant. A person can join AF Operasyon only when BOTH
-- their e-mail AND username match an allowed access record. Login then accepts
-- either the username or the e-mail. Nothing about the e-mail model is removed:
-- e-mail stays required at signup and e-mail login keeps working.
--
-- Username rules (enforced in app + DB): lowercase, trimmed, 3–32 chars, only
-- letters / digits / dot / underscore / hyphen. ASCII only (no Turkish chars)
-- for stability.
--
-- Fully additive and idempotent: safe to apply to prod without a reset.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Schema: username columns + case-insensitive uniqueness
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists username text;

-- A claimed username is globally unique, case-insensitive. Partial so the many
-- legacy rows with NULL username don't collide.
create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username))
  where username is not null;

alter table public.workspace_invites
  add column if not exists username text;

-- At most one PENDING grant may claim a given username. Scoped to unaccepted
-- grants (like the existing e-mail index) so removing + re-adding a person, or
-- re-using a username after a grant is consumed, keeps working.
create unique index if not exists workspace_invites_username_lower_unique
  on public.workspace_invites (lower(username))
  where accepted_at is null and username is not null;

-- ---------------------------------------------------------------------------
-- 2. Pre-signup gate: validate the email + username pair.
--    Callable by anon so the signup form can branch the exact error BEFORE any
--    auth user is created. Returns a status string:
--      'ok'                -> e-mail allowed and username matches the grant
--      'email_not_allowed' -> no open grant for this e-mail
--      'username_mismatch' -> grant exists but the username doesn't match it
--      'username_taken'    -> the username is already claimed by someone else
-- ---------------------------------------------------------------------------
create or replace function public.check_signup_access(p_email text, p_username text)
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_email          text := lower(trim(coalesce(p_email, '')));
  v_username       text := lower(trim(coalesce(p_username, '')));
  v_grant_username text;
begin
  -- Latest pending grant for this e-mail (if any).
  select lower(trim(wi.username)) into v_grant_username
  from public.workspace_invites wi
  where lower(wi.email) = v_email
    and wi.accepted_at is null
  order by wi.created_at desc
  limit 1;

  if not found then
    return 'email_not_allowed';
  end if;

  if v_grant_username is null or v_grant_username <> v_username then
    return 'username_mismatch';
  end if;

  -- Username already claimed by a DIFFERENT person (a profile with another
  -- e-mail). The same person re-signing up with their own e-mail is allowed.
  if exists (
    select 1 from public.profiles p
    where lower(p.username) = v_username
      and lower(p.email) <> v_email
  ) then
    return 'username_taken';
  end if;

  return 'ok';
end;
$$;

revoke execute on function public.check_signup_access(text, text) from public;
grant execute on function public.check_signup_access(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Resolve a username to its e-mail for login (server-side only).
--    SECURITY DEFINER so it works without exposing the profiles table to anon,
--    and returns ONLY the e-mail so there is no broad enumeration surface.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_username_to_email(p_username text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select p.email
  from public.profiles p
  where lower(p.username) = lower(trim(p_username))
  limit 1;
$$;

revoke execute on function public.resolve_username_to_email(text) from public;
grant execute on function public.resolve_username_to_email(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Accept a team-access grant for the CURRENT user, now username-aware.
--    Extends the existing function with an optional p_username:
--      * signup  -> p_username supplied; the grant must match e-mail+username,
--                   and the profile's username is populated from the grant.
--      * login   -> p_username NULL; matches the grant by e-mail only (the
--                   existing attach behaviour) and back-fills username from the
--                   grant if the profile doesn't have one yet.
--    Returns { workspace_id, role } on success, { error: 'username_taken' } if
--    the username collides, or { error: 'no_access' } when nothing is defined.
-- ---------------------------------------------------------------------------
create or replace function public.accept_workspace_access_grant(
  p_full_name text default null,
  p_username  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id        uuid := auth.uid();
  v_email          text;
  v_name           text;
  v_username       text;
  v_ws_id          uuid;
  v_role           text;
  v_grant_id       uuid;
  v_grant_username text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select lower(trim(email)) into v_email from auth.users where id = v_user_id;
  v_name     := nullif(trim(coalesce(p_full_name, '')), '');
  v_username := nullif(lower(trim(coalesce(p_username, ''))), '');

  -- Consume a pending grant for this e-mail. When a username is supplied (signup)
  -- it must also match the grant's username.
  select wi.id, wi.workspace_id, wi.role, lower(trim(wi.username))
    into v_grant_id, v_ws_id, v_role, v_grant_username
  from public.workspace_invites wi
  where lower(wi.email) = v_email
    and wi.accepted_at is null
    and (v_username is null or lower(trim(wi.username)) = v_username)
  order by wi.created_at desc
  limit 1;

  -- Upsert profile. Display name: latest non-empty wins. Username: the grant's
  -- username is authoritative, but never overwrite an existing profile username.
  insert into public.profiles (id, email, full_name, username)
  values (v_user_id, v_email, v_name, coalesce(v_grant_username, v_username))
  on conflict (id) do update
    set email      = excluded.email,
        full_name  = coalesce(excluded.full_name, profiles.full_name),
        username   = coalesce(profiles.username, excluded.username),
        updated_at = now();

  if v_grant_id is not null then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (v_ws_id, v_user_id, v_role::workspace_role)
    on conflict (workspace_id, user_id) do nothing;

    update public.workspace_invites
    set accepted_at = now(),
        accepted_user_id = v_user_id
    where id = v_grant_id;

    return jsonb_build_object('workspace_id', v_ws_id, 'role', v_role);
  end if;

  -- No open grant — already a member? (returning user / grant already consumed)
  select wm.workspace_id, wm.role::text
    into v_ws_id, v_role
  from public.workspace_members wm
  where wm.user_id = v_user_id
  order by wm.joined_at asc
  limit 1;

  if v_ws_id is not null then
    return jsonb_build_object('workspace_id', v_ws_id, 'role', v_role);
  end if;

  return jsonb_build_object('error', 'no_access');
exception
  when unique_violation then
    -- The only user-facing unique constraint reachable here is the username one.
    return jsonb_build_object('error', 'username_taken');
end;
$$;

revoke execute on function public.accept_workspace_access_grant(text, text) from public;
grant execute on function public.accept_workspace_access_grant(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Admin-set a member's username (mirrors admin_set_member_name).
--    profiles RLS only lets a user edit their OWN row, so an owner/admin needs a
--    definer fn to set/correct another member's username. Validates format and
--    uniqueness server-side.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_member_username(p_member_id uuid, p_username text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller   uuid := auth.uid();
  v_ws_id    uuid;
  v_target   uuid;
  v_username text := lower(trim(coalesce(p_username, '')));
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if v_username !~ '^[a-z0-9._-]{3,32}$' then
    raise exception 'invalid_username';
  end if;

  select wm.workspace_id, wm.user_id into v_ws_id, v_target
  from public.workspace_members wm
  where wm.id = p_member_id;

  if v_target is null then
    raise exception 'Üye bulunamadı';
  end if;

  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = v_ws_id
      and wm.user_id = v_caller
      and wm.role in ('owner', 'admin')
  ) then
    raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.profiles p
    where lower(p.username) = v_username
      and p.id <> v_target
  ) then
    raise exception 'username_taken';
  end if;

  update public.profiles
  set username = v_username, updated_at = now()
  where id = v_target;
end;
$$;

revoke execute on function public.admin_set_member_username(uuid, text) from public;
grant execute on function public.admin_set_member_username(uuid, text) to authenticated;
