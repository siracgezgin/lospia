-- ============================================================================
-- Hammadde kütüphanesi + Tedarikçi + Reçete (BOM)
-- ----------------------------------------------------------------------------
-- Aslı Hanım (2026-08-19):
--   "Maliyet şöyle hesaplanıyor: kumaşın fiyatına ayrı giriyorsun, dikim
--    fiyatına ayrı giriyorsun, fermuar fiyatına ayrı giriyorsun, ütü paketi
--    ayrı giriyorsun, kalıba ayrı giriyorsun… Öyle birim fiyat diye maliyet
--    hesaplanmıyor."
--
-- 2026-08-19'da maliyeti kalem kalem girilebilir yaptık. Ama kalemler ELLE
-- giriliyordu: aynı kumaş 40 föye 40 kez yazılıyor, kumaş fiyatı değişince
-- 40 föy tek tek güncelleniyordu.
--
-- Zedonk (rakip PLM/ERP) bunu üç nesneyle çözüyor ve biz de öyle yapıyoruz:
--   Supplier  → kumaşı kimden alıyoruz
--   Material  → kumaş/aksesuar bir kez tanımlanır, birim fiyatı TEK yerde
--   BOM       → föy ↔ malzeme + birim başına tüketim + fire
-- Böylece "kumaş" maliyeti artık elle girilen bir rakam değil:
--   tüketim × malzeme birim fiyatı × (1 + fire)
-- Malzemenin fiyatı değişince TÜM föylerin maliyeti kendiliğinden güncellenir.
--
-- İdempotent: create-if-not-exists / drop-if-exists + create.
-- ============================================================================

-- ── Tedarikçi ──────────────────────────────────────────────────────────────
create table if not exists public.workspace_suppliers (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  city          text,
  country       text,
  currency      text not null default 'TL',
  lead_time_days int,
  contact_name  text,
  phone         text,
  email         text,
  notes         text,
  is_active     boolean not null default true,
  position      int not null default 0,
  created_by    uuid references public.profiles(id) on delete set null,
  updated_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, name)
);

-- ── Hammadde ───────────────────────────────────────────────────────────────
create table if not exists public.workspace_materials (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  code          text,                       -- iç referans ("7685")
  name          text not null,              -- "Organic Cotton"
  -- Kategori, maliyet kalemine EŞLENİR: kumaş → "kumas", aksesuar/fermuar →
  -- "aksesuar"/"fermuar". Reçeteden gelen tutar doğru kaleme yazılsın diye.
  category      text not null default 'kumas'
    check (category in ('kumas','aksesuar','fermuar','tela','iplik','etiket','diger')),
  supplier_id   uuid references public.workspace_suppliers(id) on delete set null,
  composition   text,                       -- "%100 organik pamuk"
  width_cm      numeric(10,2),              -- kumaş eni
  unit          text not null default 'm'   -- m | adet | kg | takım
    check (unit in ('m','adet','kg','takım','paket')),
  unit_price    numeric(14,4),              -- birim fiyat — maliyetin kaynağı
  currency      text not null default 'TL',
  photo_url     text,
  notes         text,
  is_active     boolean not null default true,
  position      int not null default 0,
  created_by    uuid references public.profiles(id) on delete set null,
  updated_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, name)
);

-- ── Reçete (BOM) — föy ↔ malzeme ───────────────────────────────────────────
create table if not exists public.production_sheet_materials (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  sheet_id      uuid not null references public.production_sheets(id) on delete cascade,
  material_id   uuid not null references public.workspace_materials(id) on delete restrict,
  -- BİR ürün için gereken miktar (metre, adet…). Aslı Hanım'ın föydeki
  -- "1 ürüne giden metraj" alanının yapısal hâli.
  consumption   numeric(14,4) not null default 0,
  -- Fire payı yüzde. Föydeki "Üretim fire payı" alanının malzeme bazlı hâli.
  waste_pct     numeric(6,2) not null default 0,
  note          text,
  position      int not null default 0,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Aynı malzeme bir föyde iki kez satır açmasın.
  unique (sheet_id, material_id)
);

drop trigger if exists set_workspace_suppliers_updated_at on public.workspace_suppliers;
create trigger set_workspace_suppliers_updated_at
  before update on public.workspace_suppliers
  for each row execute function set_updated_at();

drop trigger if exists set_workspace_materials_updated_at on public.workspace_materials;
create trigger set_workspace_materials_updated_at
  before update on public.workspace_materials
  for each row execute function set_updated_at();

drop trigger if exists set_production_sheet_materials_updated_at on public.production_sheet_materials;
create trigger set_production_sheet_materials_updated_at
  before update on public.production_sheet_materials
  for each row execute function set_updated_at();

create index if not exists workspace_suppliers_workspace_idx
  on public.workspace_suppliers(workspace_id, is_active, position);
create index if not exists workspace_materials_workspace_idx
  on public.workspace_materials(workspace_id, is_active, category, position);
create index if not exists production_sheet_materials_sheet_idx
  on public.production_sheet_materials(sheet_id, position);
create index if not exists production_sheet_materials_material_idx
  on public.production_sheet_materials(workspace_id, material_id);

-- ---------------------------------------------------------------------------
-- RLS — üyeler okur, yönetici yazar (üretici/sezon ile aynı model).
-- Reçete satırları föyün parçasıdır; föy yazma modeliyle tutarlı olsun diye
-- yazma yine yöneticide.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'workspace_suppliers', 'workspace_materials', 'production_sheet_materials'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s: members read" on public.%I', t, t);
    execute format(
      'create policy "%s: members read" on public.%I for select using (is_workspace_member(workspace_id))', t, t);
    execute format('drop policy if exists "%s: admin insert" on public.%I', t, t);
    execute format(
      'create policy "%s: admin insert" on public.%I for insert with check (is_workspace_admin(workspace_id))', t, t);
    execute format('drop policy if exists "%s: admin update" on public.%I', t, t);
    execute format(
      'create policy "%s: admin update" on public.%I for update using (is_workspace_admin(workspace_id)) with check (is_workspace_admin(workspace_id))', t, t);
    execute format('drop policy if exists "%s: admin delete" on public.%I', t, t);
    execute format(
      'create policy "%s: admin delete" on public.%I for delete using (is_workspace_admin(workspace_id))', t, t);
    execute format(
      'grant select, insert, update, delete on public.%I to authenticated, service_role', t);
  end loop;
end $$;
