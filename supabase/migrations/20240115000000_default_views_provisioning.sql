-- =============================================================================
-- Default saved views provisioning
-- =============================================================================
-- Ensures every workspace (current and future) gets the 6 standard view tabs.
-- Strategy:
--   1. create_default_saved_views() — idempotent helper (no duplicates by name)
--   2. provision_workspace() updated to call it for new workspaces
--   3. Backfill loop: run it for every existing workspace
-- =============================================================================

-- ── Helper function ────────────────────────────────────────────────────────────

create or replace function create_default_saved_views(
  p_workspace_id uuid,
  p_owner_id     uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_names text[] := array[
    'Tüm işler',
    'Bana atananlar',
    'Bu hafta',
    'Gecikenler',
    'Tamamlananlar',
    'Onay bekleyenler'
  ];
  v_configs jsonb[] := array[
    '{"filters":{},"sort":{"field":"due_date","direction":"asc"},"view_type":"board"}'::jsonb,
    '{"filters":{"assignee":"me"},"sort":{"field":"due_date","direction":"asc"},"view_type":"board"}'::jsonb,
    '{"filters":{"due_within_days":7},"sort":{"field":"due_date","direction":"asc"},"view_type":"list"}'::jsonb,
    '{"filters":{"overdue":true},"sort":{"field":"due_date","direction":"asc"},"view_type":"list"}'::jsonb,
    '{"filters":{"status":["done"]},"sort":{"field":"updated_at","direction":"desc"},"view_type":"list"}'::jsonb,
    '{"filters":{"approval_required":true},"sort":{"field":"due_date","direction":"asc"},"view_type":"board"}'::jsonb
  ];
  i integer;
begin
  for i in 1..array_length(v_names, 1) loop
    -- Skip if a view with this name already exists for this workspace
    if not exists (
      select 1 from public.saved_views
      where workspace_id = p_workspace_id
        and name = v_names[i]
    ) then
      insert into public.saved_views (workspace_id, owner_id, name, config, is_shared, position)
      values (p_workspace_id, p_owner_id, v_names[i], v_configs[i], true, i - 1);
    end if;
  end loop;
end;
$$;

-- ── Update provision_workspace to provision views on new workspace creation ────

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
  v_name       text;
  v_slug       text;
  v_result     jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Resolve email from auth.users
  select email into v_email from auth.users where id = v_user_id;

  -- 1. Upsert profile
  insert into public.profiles (id, email, full_name)
  values (v_user_id, v_email, p_full_name)
  on conflict (id) do update
    set full_name  = coalesce(excluded.full_name, profiles.full_name),
        email      = excluded.email,
        updated_at = now();

  -- 2. Check for existing workspace membership
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
    insert into public.workspace_members (workspace_id, user_id, role)
    values (v_ws_id, v_user_id, v_invite_role);

    update public.workspace_invites
    set accepted_at = now()
    where id = v_invite_id;

    -- Provision default views if workspace doesn't have them yet
    -- (invited workspace was created by owner who already has views)
    -- No-op because create_default_saved_views skips existing names
    perform create_default_saved_views(v_ws_id, v_user_id);

    select to_jsonb(w.*) into v_result
    from public.workspaces w
    where w.id = v_ws_id;
    return v_result;
  end if;

  -- 4. No invite — create personal workspace
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

  insert into public.workspaces (name, slug, created_by)
  values (v_name, v_slug, v_user_id)
  returning id into v_ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_ws_id, v_user_id, 'owner');

  -- Provision the 6 default saved views for the new workspace
  perform create_default_saved_views(v_ws_id, v_user_id);

  select to_jsonb(w.*) into v_result
  from public.workspaces w
  where w.id = v_ws_id;

  return v_result;
end;
$$;

revoke execute on function provision_workspace(text) from public;
grant execute on function provision_workspace(text) to authenticated;

-- Grant the helper to the same role (called internally by SECURITY DEFINER functions)
revoke execute on function create_default_saved_views(uuid, uuid) from public;
grant execute on function create_default_saved_views(uuid, uuid) to authenticated;

-- ── Backfill: provision missing default views for all existing workspaces ──────

do $$
declare
  v_ws record;
begin
  for v_ws in
    select w.id as workspace_id, wm.user_id as owner_id
    from public.workspaces w
    join public.workspace_members wm
      on wm.workspace_id = w.id and wm.role = 'owner'
  loop
    perform create_default_saved_views(v_ws.workspace_id, v_ws.owner_id);
  end loop;
end $$;
