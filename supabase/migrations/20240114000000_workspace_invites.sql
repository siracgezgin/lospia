-- =============================================================================
-- workspace_invites: pending email invitations for workspace membership
-- =============================================================================
-- Owner-only: only workspace owners can create/cancel invites.
-- On signup, provision_workspace() checks for a pending invite matching the
-- new user's email and joins them to the invited workspace instead of creating
-- a new personal workspace.
-- =============================================================================

create table public.workspace_invites (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email        text not null,
  role         text not null check (role in ('admin', 'member', 'viewer')),
  invited_by   uuid references public.profiles(id) on delete set null,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- Case-insensitive email storage (always lower-case)
create index idx_workspace_invites_workspace  on public.workspace_invites(workspace_id);
create index idx_workspace_invites_email      on public.workspace_invites(lower(email));

-- At most one active (unaccepted) pending invite per workspace+email
create unique index idx_workspace_invites_active_unique
  on public.workspace_invites(workspace_id, lower(email))
  where accepted_at is null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.workspace_invites enable row level security;

-- Workspace members can view their own workspace's invites
create policy "workspace members can view invites"
  on public.workspace_invites for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_invites.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- Only owners can insert invites
create policy "owner can create invites"
  on public.workspace_invites for insert
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_invites.workspace_id
        and wm.user_id = auth.uid()
        and wm.role = 'owner'
    )
  );

-- Only owners can delete (cancel) invites
create policy "owner can cancel invites"
  on public.workspace_invites for delete
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_invites.workspace_id
        and wm.user_id = auth.uid()
        and wm.role = 'owner'
    )
  );

-- System can mark as accepted (via provision_workspace SECURITY DEFINER)
create policy "system can accept invites"
  on public.workspace_invites for update
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- Update provision_workspace to check for pending invites first
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

  -- 3. Check for a pending invite matching this email
  select id, workspace_id, role into v_invite_id, v_ws_id, v_invite_role
  from public.workspace_invites
  where lower(email) = lower(v_email)
    and accepted_at is null
  order by created_at desc
  limit 1;

  if v_invite_id is not null then
    -- Join the invited workspace instead of creating a personal one
    insert into public.workspace_members (workspace_id, user_id, role)
    values (v_ws_id, v_user_id, v_invite_role);

    -- Mark invite as accepted
    update public.workspace_invites
    set accepted_at = now()
    where id = v_invite_id;

    select to_jsonb(w.*) into v_result
    from public.workspaces w
    where w.id = v_ws_id;
    return v_result;
  end if;

  -- 4. No invite — create personal workspace (existing behavior)
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

  select to_jsonb(w.*) into v_result
  from public.workspaces w
  where w.id = v_ws_id;

  return v_result;
end;
$$;

revoke execute on function provision_workspace(text) from public;
grant execute on function provision_workspace(text) to authenticated;
