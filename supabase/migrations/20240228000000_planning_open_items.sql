-- ============================================================================
-- Planlama — "Tamamlanmamış Eksik Konular" (planning_open_items)
-- ----------------------------------------------------------------------------
-- Aslı Hanım'ın Toplantı Takvimi sayfasının en altındaki blok: kişi kişi
-- sütunlar, altında bitmemiş işlerin serbest listesi. Takvimin aksine HAFTAYA
-- BAĞLI DEĞİLDİR — bir konu tamamlanana kadar durur, hafta değişince kaybolmaz.
-- Not defteri gibi çalışır; istenirse tek tıkla gerçek göreve dönüşür.
--
-- Sahiplik iki biçimde tutulur:
--   * owner_user_id — sistemde kullanıcısı olan kişi (sütun ona ait)
--   * owner_label   — sistemde kullanıcı yoksa serbest ad ("EF", "Genel")
-- İkisi de boşsa satır "Genel" sütununda görünür.
--
-- İzin modeli (takvimden farklı — burası not alma yeri):
--   okuma  → tüm üyeler
--   yazma  → yönetici her sütuna; üye KENDİ sütununa
--   silme  → yönetici veya satırı ekleyen
--
-- Idempotent: create-if-not-exists / drop-if-exists + create.
-- ============================================================================

create table if not exists public.planning_open_items (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  owner_user_id uuid references public.profiles(id) on delete set null,  -- sütun sahibi (üye)
  owner_label   text,                                   -- üye değilse serbest ad
  text          text not null,                          -- konu satırı
  category      text                                    -- opsiyonel departman rengi
    check (category is null or category in (
      'uretim','ai','sales','marketing','finance','external','system','tasarim','other'
    )),
  done          boolean not null default false,
  done_at       timestamptz,
  position      int not null default 0,
  task_id       uuid references public.tasks(id) on delete set null,  -- göreve dönüştürüldüyse
  created_by    uuid references public.profiles(id) on delete set null,
  updated_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists set_planning_open_items_updated_at on public.planning_open_items;
create trigger set_planning_open_items_updated_at
  before update on public.planning_open_items
  for each row execute function set_updated_at();

create index if not exists planning_open_items_workspace_idx
  on public.planning_open_items(workspace_id, done, position);
create index if not exists planning_open_items_owner_idx
  on public.planning_open_items(workspace_id, owner_user_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.planning_open_items enable row level security;

drop policy if exists "planning_open_items: members read" on public.planning_open_items;
create policy "planning_open_items: members read"
  on public.planning_open_items for select
  using (is_workspace_member(workspace_id));

-- Yazma: yönetici her sütuna, üye yalnız kendi sütununa.
drop policy if exists "planning_open_items: own or admin insert" on public.planning_open_items;
create policy "planning_open_items: own or admin insert"
  on public.planning_open_items for insert
  with check (
    is_workspace_member(workspace_id)
    and (is_workspace_admin(workspace_id) or owner_user_id = auth.uid())
  );

drop policy if exists "planning_open_items: own or admin update" on public.planning_open_items;
create policy "planning_open_items: own or admin update"
  on public.planning_open_items for update
  using (
    is_workspace_member(workspace_id)
    and (is_workspace_admin(workspace_id) or owner_user_id = auth.uid())
  )
  with check (
    is_workspace_member(workspace_id)
    and (is_workspace_admin(workspace_id) or owner_user_id = auth.uid())
  );

drop policy if exists "planning_open_items: admin or author delete" on public.planning_open_items;
create policy "planning_open_items: admin or author delete"
  on public.planning_open_items for delete
  using (
    is_workspace_admin(workspace_id)
    or (is_workspace_member(workspace_id) and created_by = auth.uid())
  );

-- Grants — migration up default privileges DML grant vermez (production_sheets
-- kök nedeni); açıkça veriyoruz. RLS asıl kapı.
grant select, insert, update, delete on public.planning_open_items to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Yeni kategori: "tasarim" (Aslı'nın takvimindeki Tasarım departmanı sütunu)
-- Mevcut check kısıtları isimsiz oluşturulduğu için varsayılan adla düşürülüp
-- yeniden kurulur; ada güvenmemek için "if exists".
-- ---------------------------------------------------------------------------
alter table public.planning_meetings  drop constraint if exists planning_meetings_category_check;
alter table public.planning_meetings  add constraint planning_meetings_category_check
  check (category in ('uretim','ai','sales','marketing','finance','external','system','tasarim','other'));

alter table public.planning_templates drop constraint if exists planning_templates_category_check;
alter table public.planning_templates add constraint planning_templates_category_check
  check (category in ('uretim','ai','sales','marketing','finance','external','system','tasarim','other'));
