-- ============================================================================
-- Planlama — Aslı Hanım'ın "Toplantı Takvimi" sayfasının TAM karşılığı
-- ----------------------------------------------------------------------------
-- Kaynak: AF_Work.xlsx → "Toplantı Takvimi" sekmesi. Sayfa dört bloktan oluşur;
-- ilk ikisi zaten vardı, kalan ikisi bu migration ile geliyor:
--
--   1. Haftalık ızgara (gün × saat bandı × Konu 1..5)  → planning_meetings/_topics ✔
--   2. Tarih/Saat × departman matrisi (Mon..Fri 09:00) → planning_week_matrix    ← YENİ
--   3. Kişi sütunları + rol alt-başlıkları             → planning_open_items.owner_role ← YENİ
--   4. "Adımlar / Operasyon Kurgusu / Kim"             → planning_process_steps  ← YENİ
--
-- İzin modeli planlamanın geri kalanıyla aynı: tüm üyeler okur, yalnız yönetici
-- yazar (20240226_planning_admin_write kararı).
--
-- Idempotent: create-if-not-exists / drop-if-exists + create; yeni tablolara
-- açık GRANT (authenticated, service_role) — RLS asıl kapıdır.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. planning_open_items.owner_role — kişi sütununun altındaki rol başlığı
--    ("Sales / Satın Alma", "ARGE / Kumaş, Eğitim, Müşteri"). Excel'de bir
--    kişinin İKİ alt sütunu olabiliyor; ayrımı bu alan taşır.
-- ---------------------------------------------------------------------------
alter table public.planning_open_items add column if not exists owner_role text;

create index if not exists planning_open_items_owner_role_idx
  on public.planning_open_items(workspace_id, owner_label, owner_role);

-- ---------------------------------------------------------------------------
-- 2. planning_week_matrix — takvimin altındaki "Tarih/Saat × departman" bloğu
--    Satır = haftanın günü (Mon 09:00 … Fri 09:00), sütun = departman.
--    Haftaya bağlıdır (week_start = o haftanın pazartesisi).
-- ---------------------------------------------------------------------------
create table if not exists public.planning_week_matrix (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  week_start      date not null,                        -- haftanın pazartesisi
  weekday         int  not null check (weekday between 0 and 6),  -- 0=Pazartesi
  time_slot       text not null default '09:00',
  category        text not null
    check (category in (
      'uretim','ai','sales','marketing','finance','external','system','tasarim','other'
    )),
  text            text,
  kim             text,                                 -- ham "Kim" ("SE, Meral")
  participant_ids uuid[] not null default '{}',         -- çözülmüş üyeler
  position        int  not null default 0,
  created_by      uuid references public.profiles(id) on delete set null,
  updated_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists set_planning_week_matrix_updated_at on public.planning_week_matrix;
create trigger set_planning_week_matrix_updated_at
  before update on public.planning_week_matrix
  for each row execute function set_updated_at();

create index if not exists planning_week_matrix_week_idx
  on public.planning_week_matrix(workspace_id, week_start, weekday, position);

-- ---------------------------------------------------------------------------
-- 3. planning_process_steps — "Adımlar / Operasyon Kurgusu / Kim"
--    Haftaya bağlı DEĞİL: markanın sabit iş akışı (Ön Görüşme → … → Satış).
-- ---------------------------------------------------------------------------
create table if not exists public.planning_process_steps (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  position        int  not null default 0,              -- 1, 2, 3… (ekranda adım no)
  title           text not null,                        -- "Ön Görüşme"
  note            text,                                 -- yan not ("Aksesuarın satış kutusu")
  kim             text,                                 -- ham kısaltma ("EF", "AF")
  participant_ids uuid[] not null default '{}',
  created_by      uuid references public.profiles(id) on delete set null,
  updated_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists set_planning_process_steps_updated_at on public.planning_process_steps;
create trigger set_planning_process_steps_updated_at
  before update on public.planning_process_steps
  for each row execute function set_updated_at();

create index if not exists planning_process_steps_workspace_idx
  on public.planning_process_steps(workspace_id, position);

-- ---------------------------------------------------------------------------
-- 4. RLS — üye okur, yönetici yazar (planlamanın geri kalanıyla aynı)
-- ---------------------------------------------------------------------------
alter table public.planning_week_matrix   enable row level security;
alter table public.planning_process_steps enable row level security;

-- planning_week_matrix
drop policy if exists "planning_week_matrix: members read" on public.planning_week_matrix;
create policy "planning_week_matrix: members read"
  on public.planning_week_matrix for select
  using (is_workspace_member(workspace_id));

drop policy if exists "planning_week_matrix: admin insert" on public.planning_week_matrix;
create policy "planning_week_matrix: admin insert"
  on public.planning_week_matrix for insert
  with check (is_workspace_admin(workspace_id));

drop policy if exists "planning_week_matrix: admin update" on public.planning_week_matrix;
create policy "planning_week_matrix: admin update"
  on public.planning_week_matrix for update
  using (is_workspace_admin(workspace_id))
  with check (is_workspace_admin(workspace_id));

drop policy if exists "planning_week_matrix: admin delete" on public.planning_week_matrix;
create policy "planning_week_matrix: admin delete"
  on public.planning_week_matrix for delete
  using (is_workspace_admin(workspace_id));

-- planning_process_steps
drop policy if exists "planning_process_steps: members read" on public.planning_process_steps;
create policy "planning_process_steps: members read"
  on public.planning_process_steps for select
  using (is_workspace_member(workspace_id));

drop policy if exists "planning_process_steps: admin insert" on public.planning_process_steps;
create policy "planning_process_steps: admin insert"
  on public.planning_process_steps for insert
  with check (is_workspace_admin(workspace_id));

drop policy if exists "planning_process_steps: admin update" on public.planning_process_steps;
create policy "planning_process_steps: admin update"
  on public.planning_process_steps for update
  using (is_workspace_admin(workspace_id))
  with check (is_workspace_admin(workspace_id));

drop policy if exists "planning_process_steps: admin delete" on public.planning_process_steps;
create policy "planning_process_steps: admin delete"
  on public.planning_process_steps for delete
  using (is_workspace_admin(workspace_id));

-- ---------------------------------------------------------------------------
-- 5. Grants — migration up default privileges DML grant vermez; açıkça ver.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.planning_week_matrix   to authenticated, service_role;
grant select, insert, update, delete on public.planning_process_steps to authenticated, service_role;
