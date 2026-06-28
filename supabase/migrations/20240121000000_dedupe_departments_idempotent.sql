-- =============================================================================
-- AF Operasyon — Department idempotency fix
-- =============================================================================
-- Root cause of duplicate departments:
--   The original `unique (workspace_id, parent_id, name)` constraint does NOT
--   prevent duplicate TOP-LEVEL departments, because parent_id IS NULL and
--   Postgres treats NULLs as distinct. So `ON CONFLICT DO NOTHING` never fired
--   for top-level rows, and every provision call inserted 6 new parents.
--
-- This migration:
--   1. Deduplicates existing workspace_departments safely (repoints children,
--      tasks, and department_members to a canonical row, then deletes dupes).
--   2. Adds partial unique indexes that correctly handle the NULL parent case.
--   3. Rewrites provision_af_departments() to be truly idempotent via
--      anti-join inserts (independent of constraint inference).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Safe deduplication function (generic; one workspace or all)
-- ---------------------------------------------------------------------------
-- Canonical row = earliest created_at, tie-broken by id. References are moved
-- to the canonical row before duplicates are deleted. department_members moves
-- skip rows that would violate unique(department_id, member_id); leftover
-- colliding rows are removed by the ON DELETE CASCADE when the dup is deleted.
create or replace function dedupe_workspace_departments(p_workspace_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  -- ===== TOP-LEVEL duplicates (parent_id IS NULL) =====
  for r in
    select dup.id as dup_id, canon.canonical_id
    from (
      select id, workspace_id, lower(name) as lname,
             row_number() over (partition by workspace_id, lower(name)
                                order by created_at, id) as rn
      from workspace_departments
      where parent_id is null
        and (p_workspace_id is null or workspace_id = p_workspace_id)
    ) dup
    join (
      select workspace_id, lname, id as canonical_id
      from (
        select id, workspace_id, lower(name) as lname,
               row_number() over (partition by workspace_id, lower(name)
                                  order by created_at, id) as rn
        from workspace_departments
        where parent_id is null
          and (p_workspace_id is null or workspace_id = p_workspace_id)
      ) z
      where rn = 1
    ) canon
      on canon.workspace_id = dup.workspace_id and canon.lname = dup.lname
    where dup.rn > 1
  loop
    -- move children to the canonical parent
    update workspace_departments
       set parent_id = r.canonical_id
     where parent_id = r.dup_id;
    -- move tasks
    update tasks
       set department_id = r.canonical_id
     where department_id = r.dup_id;
    -- move non-colliding member assignments
    update department_members dm
       set department_id = r.canonical_id
     where dm.department_id = r.dup_id
       and not exists (
         select 1 from department_members x
         where x.department_id = r.canonical_id and x.member_id = dm.member_id
       );
    -- delete duplicate (cascades any colliding leftover member rows)
    delete from workspace_departments where id = r.dup_id;
  end loop;

  -- ===== CHILD-LEVEL duplicates (parent_id IS NOT NULL) =====
  -- Run after top-level merge so any children pulled onto a shared canonical
  -- parent are now collapsed by (workspace_id, parent_id, lower(name)).
  for r in
    select dup.id as dup_id, canon.canonical_id
    from (
      select id, workspace_id, parent_id, lower(name) as lname,
             row_number() over (partition by workspace_id, parent_id, lower(name)
                                order by created_at, id) as rn
      from workspace_departments
      where parent_id is not null
        and (p_workspace_id is null or workspace_id = p_workspace_id)
    ) dup
    join (
      select workspace_id, parent_id, lname, id as canonical_id
      from (
        select id, workspace_id, parent_id, lower(name) as lname,
               row_number() over (partition by workspace_id, parent_id, lower(name)
                                  order by created_at, id) as rn
        from workspace_departments
        where parent_id is not null
          and (p_workspace_id is null or workspace_id = p_workspace_id)
      ) z
      where rn = 1
    ) canon
      on canon.workspace_id = dup.workspace_id
     and canon.parent_id   = dup.parent_id
     and canon.lname       = dup.lname
    where dup.rn > 1
  loop
    -- move any grandchildren (defensive — AF tree is 2 levels)
    update workspace_departments
       set parent_id = r.canonical_id
     where parent_id = r.dup_id;
    update tasks
       set department_id = r.canonical_id
     where department_id = r.dup_id;
    update department_members dm
       set department_id = r.canonical_id
     where dm.department_id = r.dup_id
       and not exists (
         select 1 from department_members x
         where x.department_id = r.canonical_id and x.member_id = dm.member_id
       );
    delete from workspace_departments where id = r.dup_id;
  end loop;
end;
$$;

revoke execute on function dedupe_workspace_departments(uuid) from public;
grant execute on function dedupe_workspace_departments(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Clean existing duplicates across ALL workspaces (one-time data fix)
-- ---------------------------------------------------------------------------
select dedupe_workspace_departments(null);

-- ---------------------------------------------------------------------------
-- 3. Correct uniqueness via partial unique indexes
-- ---------------------------------------------------------------------------
-- Top-level: unique per workspace by case-insensitive name (parent_id IS NULL).
create unique index if not exists workspace_departments_top_unique
  on public.workspace_departments (workspace_id, lower(name))
  where parent_id is null;

-- Child: unique per (workspace, parent) by case-insensitive name.
create unique index if not exists workspace_departments_child_unique
  on public.workspace_departments (workspace_id, parent_id, lower(name))
  where parent_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Truly idempotent provision_af_departments()
-- ---------------------------------------------------------------------------
-- Uses anti-join inserts (WHERE NOT EXISTS on lower(name)) so re-runs never
-- create duplicates, independent of constraint/index inference quirks.
create or replace function provision_af_departments(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tasarim_id   uuid;
  v_uretim_id    uuid;
  v_satis_id     uuid;
  v_pazarlama_id uuid;
  v_finans_id    uuid;
  v_marka_id     uuid;
begin
  -- ── Top-level departments ────────────────────────────────────────────────
  insert into public.workspace_departments
    (workspace_id, parent_id, name, color_key, position)
  select p_workspace_id, null, v.name, v.color, v.pos
  from (values
    ('Tasarım & Yaratıcı Yön',      'purple', 0),
    ('Üretim & Tedarik Zinciri',    'orange', 1),
    ('Satış & Ticaret',             'blue',   2),
    ('Pazarlama & İletişim',        'pink',   3),
    ('Finans & Operasyon',          'green',  4),
    ('Marka Yönetimi / CEO Katmanı','amber',  5)
  ) as v(name, color, pos)
  where not exists (
    select 1 from public.workspace_departments d
    where d.workspace_id = p_workspace_id
      and d.parent_id is null
      and lower(d.name) = lower(v.name)
  );

  -- Resolve top-level IDs (case-insensitive)
  select id into v_tasarim_id   from public.workspace_departments
    where workspace_id = p_workspace_id and parent_id is null and lower(name) = lower('Tasarım & Yaratıcı Yön');
  select id into v_uretim_id    from public.workspace_departments
    where workspace_id = p_workspace_id and parent_id is null and lower(name) = lower('Üretim & Tedarik Zinciri');
  select id into v_satis_id     from public.workspace_departments
    where workspace_id = p_workspace_id and parent_id is null and lower(name) = lower('Satış & Ticaret');
  select id into v_pazarlama_id from public.workspace_departments
    where workspace_id = p_workspace_id and parent_id is null and lower(name) = lower('Pazarlama & İletişim');
  select id into v_finans_id    from public.workspace_departments
    where workspace_id = p_workspace_id and parent_id is null and lower(name) = lower('Finans & Operasyon');
  select id into v_marka_id     from public.workspace_departments
    where workspace_id = p_workspace_id and parent_id is null and lower(name) = lower('Marka Yönetimi / CEO Katmanı');

  -- ── Child departments (anti-join insert per parent) ──────────────────────
  insert into public.workspace_departments (workspace_id, parent_id, name, position)
  select p_workspace_id, v_tasarim_id, v.name, v.pos
  from (values
    ('Creative Direction', 0), ('Tasarım', 1), ('Aksesuar Tasarım', 2),
    ('Tekstil/kumaş araştırma & geliştirme', 3), ('Visual Merchandising', 4),
    ('Trend & araştırma', 5), ('Lookbook ve Katalog sistem kurma', 6)
  ) as v(name, pos)
  where not exists (
    select 1 from public.workspace_departments d
    where d.workspace_id = p_workspace_id and d.parent_id = v_tasarim_id
      and lower(d.name) = lower(v.name)
  );

  insert into public.workspace_departments (workspace_id, parent_id, name, position)
  select p_workspace_id, v_uretim_id, v.name, v.pos
  from (values
    ('Numune/prototip onaylanması', 0), ('Üretim planlama', 1),
    ('Kalite kontrol', 2), ('Tedarikçi & kumaş/aksesuar satın alma', 3),
    ('Lojistik & depo', 4)
  ) as v(name, pos)
  where not exists (
    select 1 from public.workspace_departments d
    where d.workspace_id = p_workspace_id and d.parent_id = v_uretim_id
      and lower(d.name) = lower(v.name)
  );

  insert into public.workspace_departments (workspace_id, parent_id, name, position)
  select p_workspace_id, v_satis_id, v.name, v.pos
  from (values
    ('Toptan satış', 0), ('Perakende', 1), ('E-ticaret / online satış', 2),
    ('Konsinye yönetimi', 3), ('Müşteri ilişkileri / VIP / özel müşteri', 4)
  ) as v(name, pos)
  where not exists (
    select 1 from public.workspace_departments d
    where d.workspace_id = p_workspace_id and d.parent_id = v_satis_id
      and lower(d.name) = lower(v.name)
  );

  insert into public.workspace_departments (workspace_id, parent_id, name, position)
  select p_workspace_id, v_pazarlama_id, v.name, v.pos
  from (values
    ('Marka iletişimi / PR', 0), ('Sosyal medya & dijital pazarlama', 1),
    ('İçerik üretimi', 2), ('Etkinlik & defile organizasyonu', 3),
    ('Influencer işbirlikleri', 4)
  ) as v(name, pos)
  where not exists (
    select 1 from public.workspace_departments d
    where d.workspace_id = p_workspace_id and d.parent_id = v_pazarlama_id
      and lower(d.name) = lower(v.name)
  );

  insert into public.workspace_departments (workspace_id, parent_id, name, position)
  select p_workspace_id, v_finans_id, v.name, v.pos
  from (values
    ('Muhasebe & bütçe', 0), ('Maliyetlendirme', 1),
    ('Hukuk & sözleşmeler', 2), ('İK', 3)
  ) as v(name, pos)
  where not exists (
    select 1 from public.workspace_departments d
    where d.workspace_id = p_workspace_id and d.parent_id = v_finans_id
      and lower(d.name) = lower(v.name)
  );

  insert into public.workspace_departments (workspace_id, parent_id, name, position)
  select p_workspace_id, v_marka_id, v.name, v.pos
  from (values
    ('Strateji & büyüme kararları', 0), ('Ortaklıklar / lisanslama', 1),
    ('Genel koordinasyon sistem kurma', 2)
  ) as v(name, pos)
  where not exists (
    select 1 from public.workspace_departments d
    where d.workspace_id = p_workspace_id and d.parent_id = v_marka_id
      and lower(d.name) = lower(v.name)
  );
end;
$$;

revoke execute on function provision_af_departments(uuid) from public;
grant execute on function provision_af_departments(uuid) to authenticated;
