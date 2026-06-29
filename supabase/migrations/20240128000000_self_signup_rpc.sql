-- =============================================================================
-- Self-service signup via RPC (no service_role required)
-- =============================================================================
-- The AF Operasyon pilot lets a person sign up themselves with an allowed e-mail.
-- The previous flow created the auth user with the service_role admin API, which
-- fails in any environment where SUPABASE_SERVICE_ROLE_KEY is not configured
-- (the source of the "Hesap kurulumu henüz yapılandırılmamış" error in prod).
--
-- New model: the app calls supabase.auth.signUp() (Confirm Email is OFF, so no
-- e-mail is sent and there is no project-wide email rate limit), which yields an
-- authenticated session. It then calls accept_workspace_access_grant() — a
-- SECURITY DEFINER function that runs as the signed-in user, validates the
-- e-mail against the team-access allowlist (workspace_invites), upserts the
-- profile (carrying the latest display name), attaches the user to AF Operasyon
-- with the granted role, and marks the grant accepted. No service role anywhere.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Pre-signup gate: does this e-mail have an open team-access grant?
--    Callable by anon so the signup form can block non-allowed e-mails BEFORE
--    creating any auth user. Returns true only when an unaccepted grant exists.
-- ---------------------------------------------------------------------------
create or replace function public.check_email_access_grant(p_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspace_invites wi
    where lower(wi.email) = lower(trim(p_email))
      and wi.accepted_at is null
  );
$$;

revoke execute on function public.check_email_access_grant(text) from public;
grant execute on function public.check_email_access_grant(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Accept a team-access grant for the CURRENT authenticated user.
--    Runs after auth.signUp() (or login). Idempotent and safe to call repeatedly.
--    Returns: { workspace_id, role } on success, or { error: 'no_access' } when
--    the user is neither granted nor already a member.
-- ---------------------------------------------------------------------------
create or replace function public.accept_workspace_access_grant(p_full_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_email    text;
  v_name     text;
  v_ws_id    uuid;
  v_role     text;
  v_grant_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  -- Resolve and normalize the caller's e-mail from the auth schema.
  select lower(trim(email)) into v_email from auth.users where id = v_user_id;
  v_name := nullif(trim(coalesce(p_full_name, '')), '');

  -- Upsert profile. A fresh, non-empty display name (from the signup form)
  -- always overwrites the stored one so the latest name wins. When no name is
  -- supplied (e.g. plain login) the existing profile name is preserved.
  insert into public.profiles (id, email, full_name)
  values (v_user_id, v_email, v_name)
  on conflict (id) do update
    set email      = excluded.email,
        full_name  = coalesce(excluded.full_name, profiles.full_name),
        updated_at = now();

  -- (a) Consume a pending team-access grant for this e-mail, if one exists.
  select wi.id, wi.workspace_id, wi.role
    into v_grant_id, v_ws_id, v_role
  from public.workspace_invites wi
  where lower(wi.email) = v_email
    and wi.accepted_at is null
  order by wi.created_at desc
  limit 1;

  if v_grant_id is not null then
    -- Attach to the granted workspace with the granted role (duplicate-safe).
    insert into public.workspace_members (workspace_id, user_id, role)
    values (v_ws_id, v_user_id, v_role::workspace_role)
    on conflict (workspace_id, user_id) do nothing;

    update public.workspace_invites
    set accepted_at = now(),
        accepted_user_id = v_user_id
    where id = v_grant_id;

    return jsonb_build_object('workspace_id', v_ws_id, 'role', v_role);
  end if;

  -- (b) No open grant — but if the user is already a member, that's fine
  --     (returning user / grant already consumed on a prior attempt).
  select wm.workspace_id, wm.role::text
    into v_ws_id, v_role
  from public.workspace_members wm
  where wm.user_id = v_user_id
  order by wm.joined_at asc
  limit 1;

  if v_ws_id is not null then
    return jsonb_build_object('workspace_id', v_ws_id, 'role', v_role);
  end if;

  -- (c) Neither granted nor a member — access is not defined for this e-mail.
  return jsonb_build_object('error', 'no_access');
end;
$$;

revoke execute on function public.accept_workspace_access_grant(text) from public;
grant execute on function public.accept_workspace_access_grant(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Admin-set a member's display name.
--    profiles RLS only lets a user edit their OWN row, so correcting a stale
--    placeholder name (e.g. `Test"`) for another member needs a definer fn that
--    verifies the caller manages the same workspace as the target member.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_member_name(p_member_id uuid, p_full_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller    uuid := auth.uid();
  v_ws_id     uuid;
  v_target    uuid;
  v_name      text := nullif(trim(coalesce(p_full_name, '')), '');
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if v_name is null then
    raise exception 'İsim gerekli';
  end if;

  -- Resolve the target member's workspace + user.
  select wm.workspace_id, wm.user_id into v_ws_id, v_target
  from public.workspace_members wm
  where wm.id = p_member_id;

  if v_target is null then
    raise exception 'Üye bulunamadı';
  end if;

  -- Caller must be an owner/admin of that workspace.
  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = v_ws_id
      and wm.user_id = v_caller
      and wm.role in ('owner', 'admin')
  ) then
    raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
  end if;

  update public.profiles
  set full_name = v_name, updated_at = now()
  where id = v_target;
end;
$$;

revoke execute on function public.admin_set_member_name(uuid, text) from public;
grant execute on function public.admin_set_member_name(uuid, text) to authenticated;
