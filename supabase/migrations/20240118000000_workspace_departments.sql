-- =============================================================================
-- AF Operasyon — Departments as first-class objects
-- =============================================================================
-- workspace_departments: department tree (top-level + sub-departments)
-- department_members:    many-to-many — a person can belong to multiple depts
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. workspace_departments
-- ---------------------------------------------------------------------------
create table public.workspace_departments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  parent_id    uuid references public.workspace_departments(id) on delete cascade,
  name         text not null,
  description  text,
  color_key    text,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, parent_id, name)
);

create trigger set_workspace_departments_updated_at
  before update on public.workspace_departments
  for each row execute function set_updated_at();

create index workspace_departments_workspace_idx
  on public.workspace_departments(workspace_id);
create index workspace_departments_parent_idx
  on public.workspace_departments(workspace_id, parent_id);

-- ---------------------------------------------------------------------------
-- 2. department_members
-- ---------------------------------------------------------------------------
create table public.department_members (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  department_id uuid not null references public.workspace_departments(id) on delete cascade,
  member_id     uuid not null references public.workspace_members(id) on delete cascade,
  role          text not null default 'member'
    check (role in ('lead', 'member')),
  created_at    timestamptz not null default now(),
  unique (department_id, member_id)
);

create index department_members_workspace_idx
  on public.department_members(workspace_id);
create index department_members_department_idx
  on public.department_members(department_id);
create index department_members_member_idx
  on public.department_members(workspace_id, member_id);

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
alter table public.workspace_departments enable row level security;
alter table public.department_members    enable row level security;

-- workspace_departments: members read, admins write
create policy "departments: members can select"
  on public.workspace_departments for select
  using (is_workspace_member(workspace_id));

create policy "departments: admins can insert"
  on public.workspace_departments for insert
  with check (is_workspace_admin(workspace_id));

create policy "departments: admins can update"
  on public.workspace_departments for update
  using (is_workspace_admin(workspace_id));

create policy "departments: admins can delete"
  on public.workspace_departments for delete
  using (is_workspace_admin(workspace_id));

-- department_members: members read, admins write
create policy "dept_members: members can select"
  on public.department_members for select
  using (is_workspace_member(workspace_id));

create policy "dept_members: admins can insert"
  on public.department_members for insert
  with check (is_workspace_admin(workspace_id));

create policy "dept_members: admins can update"
  on public.department_members for update
  using (is_workspace_admin(workspace_id));

create policy "dept_members: admins can delete"
  on public.department_members for delete
  using (is_workspace_admin(workspace_id));

-- ---------------------------------------------------------------------------
-- 4. provision_af_departments()
-- ---------------------------------------------------------------------------
-- Idempotently seeds the AF Operasyon department tree for a given workspace.
-- Safe to call multiple times — ON CONFLICT DO NOTHING.
-- Call from server action after identifying the AF workspace.
-- ---------------------------------------------------------------------------
create or replace function provision_af_departments(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tasarim_id     uuid;
  v_uretim_id      uuid;
  v_satis_id       uuid;
  v_pazarlama_id   uuid;
  v_finans_id      uuid;
  v_marka_id       uuid;
begin
  -- ── Top-level departments ─────────────────────────────────────────────────

  insert into public.workspace_departments
    (workspace_id, parent_id, name, color_key, position)
  values
    (p_workspace_id, null, 'Tasarım & Yaratıcı Yön',      'purple',  0),
    (p_workspace_id, null, 'Üretim & Tedarik Zinciri',     'orange',  1),
    (p_workspace_id, null, 'Satış & Ticaret',              'blue',    2),
    (p_workspace_id, null, 'Pazarlama & İletişim',         'pink',    3),
    (p_workspace_id, null, 'Finans & Operasyon',           'green',   4),
    (p_workspace_id, null, 'Marka Yönetimi / CEO Katmanı', 'amber',   5)
  on conflict (workspace_id, parent_id, name) do nothing;

  -- Resolve top-level IDs (may have just been inserted or already existed)
  select id into v_tasarim_id   from public.workspace_departments
    where workspace_id = p_workspace_id and parent_id is null and name = 'Tasarım & Yaratıcı Yön';
  select id into v_uretim_id    from public.workspace_departments
    where workspace_id = p_workspace_id and parent_id is null and name = 'Üretim & Tedarik Zinciri';
  select id into v_satis_id     from public.workspace_departments
    where workspace_id = p_workspace_id and parent_id is null and name = 'Satış & Ticaret';
  select id into v_pazarlama_id from public.workspace_departments
    where workspace_id = p_workspace_id and parent_id is null and name = 'Pazarlama & İletişim';
  select id into v_finans_id    from public.workspace_departments
    where workspace_id = p_workspace_id and parent_id is null and name = 'Finans & Operasyon';
  select id into v_marka_id     from public.workspace_departments
    where workspace_id = p_workspace_id and parent_id is null and name = 'Marka Yönetimi / CEO Katmanı';

  -- ── Tasarım & Yaratıcı Yön sub-departments ───────────────────────────────
  insert into public.workspace_departments
    (workspace_id, parent_id, name, position)
  values
    (p_workspace_id, v_tasarim_id, 'Creative Direction',                        0),
    (p_workspace_id, v_tasarim_id, 'Tasarım',                                   1),
    (p_workspace_id, v_tasarim_id, 'Aksesuar Tasarım',                          2),
    (p_workspace_id, v_tasarim_id, 'Tekstil/kumaş araştırma & geliştirme',     3),
    (p_workspace_id, v_tasarim_id, 'Visual Merchandising',                      4),
    (p_workspace_id, v_tasarim_id, 'Trend & araştırma',                         5),
    (p_workspace_id, v_tasarim_id, 'Lookbook ve Katalog sistem kurma',           6)
  on conflict (workspace_id, parent_id, name) do nothing;

  -- ── Üretim & Tedarik Zinciri sub-departments ─────────────────────────────
  insert into public.workspace_departments
    (workspace_id, parent_id, name, position)
  values
    (p_workspace_id, v_uretim_id, 'Numune/prototip onaylanması',                0),
    (p_workspace_id, v_uretim_id, 'Üretim planlama',                            1),
    (p_workspace_id, v_uretim_id, 'Kalite kontrol',                             2),
    (p_workspace_id, v_uretim_id, 'Tedarikçi & kumaş/aksesuar satın alma',     3),
    (p_workspace_id, v_uretim_id, 'Lojistik & depo',                            4)
  on conflict (workspace_id, parent_id, name) do nothing;

  -- ── Satış & Ticaret sub-departments ──────────────────────────────────────
  insert into public.workspace_departments
    (workspace_id, parent_id, name, position)
  values
    (p_workspace_id, v_satis_id, 'Toptan satış',                                0),
    (p_workspace_id, v_satis_id, 'Perakende',                                   1),
    (p_workspace_id, v_satis_id, 'E-ticaret / online satış',                    2),
    (p_workspace_id, v_satis_id, 'Konsinye yönetimi',                           3),
    (p_workspace_id, v_satis_id, 'Müşteri ilişkileri / VIP / özel müşteri',    4)
  on conflict (workspace_id, parent_id, name) do nothing;

  -- ── Pazarlama & İletişim sub-departments ─────────────────────────────────
  insert into public.workspace_departments
    (workspace_id, parent_id, name, position)
  values
    (p_workspace_id, v_pazarlama_id, 'Marka iletişimi / PR',                    0),
    (p_workspace_id, v_pazarlama_id, 'Sosyal medya & dijital pazarlama',        1),
    (p_workspace_id, v_pazarlama_id, 'İçerik üretimi',                          2),
    (p_workspace_id, v_pazarlama_id, 'Etkinlik & defile organizasyonu',         3),
    (p_workspace_id, v_pazarlama_id, 'Influencer işbirlikleri',                 4)
  on conflict (workspace_id, parent_id, name) do nothing;

  -- ── Finans & Operasyon sub-departments ───────────────────────────────────
  insert into public.workspace_departments
    (workspace_id, parent_id, name, position)
  values
    (p_workspace_id, v_finans_id, 'Muhasebe & bütçe',                           0),
    (p_workspace_id, v_finans_id, 'Maliyetlendirme',                            1),
    (p_workspace_id, v_finans_id, 'Hukuk & sözleşmeler',                        2),
    (p_workspace_id, v_finans_id, 'İK',                                          3)
  on conflict (workspace_id, parent_id, name) do nothing;

  -- ── Marka Yönetimi / CEO Katmanı sub-departments ─────────────────────────
  insert into public.workspace_departments
    (workspace_id, parent_id, name, position)
  values
    (p_workspace_id, v_marka_id, 'Strateji & büyüme kararları',                 0),
    (p_workspace_id, v_marka_id, 'Ortaklıklar / lisanslama',                    1),
    (p_workspace_id, v_marka_id, 'Genel koordinasyon sistem kurma',              2)
  on conflict (workspace_id, parent_id, name) do nothing;
end;
$$;

revoke execute on function provision_af_departments(uuid) from public;
grant execute on function provision_af_departments(uuid) to authenticated;
