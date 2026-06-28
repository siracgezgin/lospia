-- =============================================================================
-- AF Operasyon Pilot: invite-only workspace provisioning
-- =============================================================================
-- Replaces the personal-workspace fallback in provision_workspace() with an
-- explicit error so the app can show the "invite required" message rather than
-- silently creating an empty solo workspace for uninvited users.
-- Existing invited users are unaffected (invite path runs before this check).
-- =============================================================================

create or replace function provision_workspace(
  p_full_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_email      text;
  v_ws_id      uuid;
  v_invite_id  uuid;
  v_invite_role text;
  v_result     jsonb;
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

  -- 2. Check for existing workspace membership (returning user)
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

  -- 3. Check for a pending invite matching this email
  select id, workspace_id, role into v_invite_id, v_ws_id, v_invite_role
  from public.workspace_invites
  where lower(email) = lower(v_email)
    and accepted_at is null
  order by created_at desc
  limit 1;

  if v_invite_id is not null then
    -- Join the invited workspace
    insert into public.workspace_members (workspace_id, user_id, role)
    values (v_ws_id, v_user_id, v_invite_role);

    update public.workspace_invites
    set accepted_at = now()
    where id = v_invite_id;

    select to_jsonb(w.*) into v_result
    from public.workspaces w
    where w.id = v_ws_id;
    return v_result;
  end if;

  -- 4. No invite found — pilot is invite-only, return error sentinel
  return jsonb_build_object('error', 'no_invite');
end;
$$;

revoke execute on function provision_workspace(text) from public;
grant execute on function provision_workspace(text) to authenticated;
