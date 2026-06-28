-- =============================================================================
-- Fix: invite acceptance failed with
--   "column \"role\" is of type workspace_role but expression is of type text"
-- =============================================================================
-- Root cause: provision_workspace() selected workspace_invites.role (text) into
-- a text variable and inserted it directly into workspace_members.role, which is
-- the enum workspace_role. Postgres does not implicitly cast a text *variable*
-- to an enum (only string literals), so the invite-join INSERT threw and the
-- invited user never became a member — they saw the workspace-setup failure and
-- the invite stayed pending.
--
-- This migration:
--   1. Recreates provision_workspace() with a validated text -> workspace_role
--      cast (fallback to 'member') and duplicate-safe membership insert. Keeps
--      the pilot invite-only behaviour (no blank workspace for uninvited users).
--   2. Adds repair_pending_workspace_invites() to retro-join any users whose
--      invite acceptance previously failed. Idempotent; safe to run repeatedly.
-- =============================================================================

-- Helper: map an arbitrary text role to a valid workspace_role (never trust raw).
create or replace function to_workspace_role(p_role text)
returns workspace_role
language sql
immutable
as $$
  select case
    when p_role in ('owner', 'admin', 'member', 'viewer') then p_role::workspace_role
    else 'member'::workspace_role
  end;
$$;

-- ---------------------------------------------------------------------------
-- 1. provision_workspace() — invite-only, with safe role cast
-- ---------------------------------------------------------------------------
create or replace function provision_workspace(
  p_full_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid := auth.uid();
  v_email       text;
  v_ws_id       uuid;
  v_invite_id   uuid;
  v_invite_role text;
  v_result      jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Resolve email from auth.users
  select email into v_email from auth.users where id = v_user_id;

  -- 1. Upsert profile (idempotent)
  insert into public.profiles (id, email, full_name)
  values (v_user_id, v_email, p_full_name)
  on conflict (id) do update
    set full_name = coalesce(excluded.full_name, profiles.full_name),
        email     = excluded.email,
        updated_at = now();

  -- 2. Returning member — hand back the existing workspace
  select wm.workspace_id into v_ws_id
  from public.workspace_members wm
  where wm.user_id = v_user_id
  limit 1;

  if v_ws_id is not null then
    select to_jsonb(w.*) into v_result
    from public.workspaces w
    where w.id = v_ws_id;
    return v_result;
  end if;

  -- 3. Pending invite for this email?
  select id, workspace_id, role into v_invite_id, v_ws_id, v_invite_role
  from public.workspace_invites
  where lower(email) = lower(v_email)
    and accepted_at is null
  order by created_at desc
  limit 1;

  if v_invite_id is not null then
    -- Join the invited workspace (validated cast; duplicate-safe)
    insert into public.workspace_members (workspace_id, user_id, role)
    values (v_ws_id, v_user_id, to_workspace_role(v_invite_role))
    on conflict (workspace_id, user_id) do nothing;

    update public.workspace_invites
    set accepted_at = now()
    where id = v_invite_id;

    select to_jsonb(w.*) into v_result
    from public.workspaces w
    where w.id = v_ws_id;
    return v_result;
  end if;

  -- 4. No invite — pilot is invite-only. Do NOT create a blank workspace.
  return jsonb_build_object('error', 'no_invite');
end;
$$;

revoke execute on function provision_workspace(text) from public;
grant execute on function provision_workspace(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. repair_pending_workspace_invites() — heal invites broken by the old bug
-- ---------------------------------------------------------------------------
-- For every pending invite whose email matches an existing profile, create the
-- missing membership (validated cast, duplicate-safe) and mark the invite
-- accepted. Returns the number of memberships created. Idempotent.
create or replace function repair_pending_workspace_invites()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r          record;
  v_created  integer := 0;
  v_inserted boolean;
begin
  for r in
    select inv.id as invite_id, inv.workspace_id, inv.role, p.id as user_id
    from public.workspace_invites inv
    join public.profiles p on lower(p.email) = lower(inv.email)
    where inv.accepted_at is null
  loop
    with ins as (
      insert into public.workspace_members (workspace_id, user_id, role)
      values (r.workspace_id, r.user_id, to_workspace_role(r.role))
      on conflict (workspace_id, user_id) do nothing
      returning 1
    )
    select exists (select 1 from ins) into v_inserted;

    if v_inserted then
      v_created := v_created + 1;
    end if;

    -- Mark accepted whether we inserted now or the membership already existed.
    update public.workspace_invites
    set accepted_at = now()
    where id = r.invite_id
      and accepted_at is null;
  end loop;

  return v_created;
end;
$$;

revoke execute on function repair_pending_workspace_invites() from public;
grant execute on function repair_pending_workspace_invites() to authenticated;
