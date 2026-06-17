-- Fix saved views: rename old workflow-heavy names to simplified operational names.
-- Safe to re-run (idempotent UPDATEs; fresh-reset safe because seed.sql handles INSERTs).
--
-- On fresh "supabase db reset": migrations run first on an empty DB, these UPDATEs are
-- silent no-ops, then seed.sql inserts all 5 views correctly.
--
-- On an existing dev DB: these UPDATEs rename old views in-place and fix positions.
-- The DO block inserts "Bana atananlar" (0x34) only when a workspace already exists.

-- ── Rename + reposition existing views ──────────────────────────────────────

update public.saved_views set
  name     = 'Tüm işler',
  config   = '{"filters": {}, "sort": {"field": "due_date", "direction": "asc"}, "view_type": "board"}'::jsonb,
  position = 0
where id = '00000000-0000-0000-0000-000000000030';

update public.saved_views set
  name     = 'Bana atananlar',
  config   = '{"filters": {"assignee": "me"}, "sort": {"field": "due_date", "direction": "asc"}, "view_type": "board"}'::jsonb,
  position = 1
where id = '00000000-0000-0000-0000-000000000034';

update public.saved_views set
  name     = 'Bu hafta',
  config   = '{"filters": {"due_within_days": 7, "status": ["backlog","ready","in_progress","blocked","review"]}, "sort": {"field": "due_date", "direction": "asc"}, "view_type": "list"}'::jsonb,
  position = 2
where id = '00000000-0000-0000-0000-000000000031';

update public.saved_views set
  name     = 'Gecikenler',
  config   = '{"filters": {"overdue": true}, "sort": {"field": "due_date", "direction": "asc"}, "view_type": "list"}'::jsonb,
  position = 3
where id = '00000000-0000-0000-0000-000000000032';

update public.saved_views set
  name     = 'Tamamlananlar',
  config   = '{"filters": {"status": ["done"]}, "sort": {"field": "updated_at", "direction": "desc"}, "view_type": "list"}'::jsonb,
  position = 4
where id = '00000000-0000-0000-0000-000000000033';

-- ── Insert "Bana atananlar" on existing DBs (safe no-op on fresh reset) ─────

do $$
declare
  v_workspace_id uuid;
  v_owner_id     uuid;
begin
  select w.id, wm.user_id
  into   v_workspace_id, v_owner_id
  from   public.workspaces w
  join   public.workspace_members wm
         on wm.workspace_id = w.id and wm.role = 'owner'
  limit  1;

  if v_workspace_id is not null then
    insert into public.saved_views
      (id, workspace_id, owner_id, name, config, is_shared, position)
    values (
      '00000000-0000-0000-0000-000000000034',
      v_workspace_id,
      v_owner_id,
      'Bana atananlar',
      '{"filters": {"assignee": "me"}, "sort": {"field": "due_date", "direction": "asc"}, "view_type": "board"}'::jsonb,
      true,
      1
    )
    on conflict (id) do update set
      name     = excluded.name,
      config   = excluded.config,
      position = excluded.position;
  end if;
end $$;

-- All 4 original views are renamed by fixed ID above; no orphan cleanup needed.
