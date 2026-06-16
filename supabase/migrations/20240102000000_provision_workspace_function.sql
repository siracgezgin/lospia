-- =============================================================================
-- provision_workspace(p_full_name text)
-- =============================================================================
-- Called by the app layout when an authenticated user has no workspace.
-- SECURITY DEFINER so it can bypass the workspace_members RLS check for the
-- first-member bootstrap (is_workspace_admin returns false until the row exists).
-- auth.uid() still reflects the *calling* user inside a security definer function
-- because Supabase reads it from the JWT claim, not from current_user.
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
  v_user_id  uuid := auth.uid();
  v_email    text;
  v_ws_id    uuid;
  v_name     text;
  v_slug     text;
  v_result   jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Resolve email from auth.users
  select email into v_email from auth.users where id = v_user_id;

  -- 1. Upsert profile (trigger may have already created it; this is idempotent)
  insert into public.profiles (id, email, full_name)
  values (v_user_id, v_email, p_full_name)
  on conflict (id) do update
    set full_name = coalesce(excluded.full_name, profiles.full_name),
        email     = excluded.email,
        updated_at = now();

  -- 2. Check for existing workspace membership
  select wm.workspace_id into v_ws_id
  from public.workspace_members wm
  where wm.user_id = v_user_id
  limit 1;

  if v_ws_id is not null then
    -- Already provisioned — return existing workspace
    select to_jsonb(w.*) into v_result
    from public.workspaces w
    where w.id = v_ws_id;
    return v_result;
  end if;

  -- 3. Build workspace name and slug for new user
  v_name := coalesce(nullif(trim(p_full_name), ''), split_part(v_email, '@', 1))
            || ' Çalışma Alanı';

  v_slug := lower(
              regexp_replace(
                coalesce(nullif(trim(p_full_name), ''), split_part(v_email, '@', 1)),
                '[^a-z0-9]+', '-', 'g'
              )
            )
            || '-'
            || floor(extract(epoch from now()))::text;

  -- 4. Create workspace (RLS allows insert when auth.uid() is not null)
  insert into public.workspaces (name, slug, created_by)
  values (v_name, v_slug, v_user_id)
  returning id into v_ws_id;

  -- 5. Add creator as owner — bypassed by SECURITY DEFINER
  --    (is_workspace_admin fails here because no members exist yet)
  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_ws_id, v_user_id, 'owner');

  -- Return new workspace as JSON
  select to_jsonb(w.*) into v_result
  from public.workspaces w
  where w.id = v_ws_id;

  return v_result;
end;
$$;

-- Grant execute to authenticated users only
revoke execute on function provision_workspace(text) from public;
grant execute on function provision_workspace(text) to authenticated;
