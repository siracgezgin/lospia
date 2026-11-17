-- ---------------------------------------------------------------------------
-- STOK — tek yerde üç stok (9.11.2026 toplantısı, Aslı Hanım: "çok önemli")
--
-- Üç ayrı stok var: Market 212 İstanbul, Market 212 Çeşme ve online. Toplam
-- siteye elle giriliyor; mağazada satış olunca düşmüyor, stok yanlış görünüyor.
--
-- MODEL, eski stok programından (Dynamics 365 "Aslı Filinta Satış Merkezi",
-- 17.11.2026'da incelendi) alındı — iki sezon Çeşme'de çalışan mantık:
--   • DEFTER: her giriş/satış/iade/transfer/sayım bir HAREKET satırıdır.
--   • ELDEKİ ADET elle yazılmaz; hareketlerin TOPLAMIDIR (stock_levels).
--     Yanlış rakam "düzeltilmez", sayım hareketiyle kapatılır — geçmiş kalır.
-- Eskisinden farkı: yer BAŞTAN üç tane (program yalnız Çeşme'yi tanıyordu),
-- ürün föye ve sitedeki ürüne bağlanabilir.
--
-- Müşteri bilgisi BURADA YOK (KVKK): satış hareketi kimin aldığını tutmaz.
-- ---------------------------------------------------------------------------

-- ── Yerler ──────────────────────────────────────────────────────────────────
create table if not exists public.stock_locations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 120),
  -- store = mağaza · online = site · warehouse = depo/merkez
  kind         text not null default 'store' check (kind in ('store','online','warehouse')),
  position     int  not null default 0,
  created_at   timestamptz not null default now()
);
create unique index if not exists stock_locations_ws_name_uidx
  on public.stock_locations (workspace_id, name);

-- ── Ürünler ─────────────────────────────────────────────────────────────────
create table if not exists public.stock_products (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  -- Ürün kodu (AF_S008, KY20013…): site SKU'su ve eski programla ORTAK anahtar.
  code           text not null default '',
  barcode        text not null default '',
  name           text not null check (char_length(name) between 1 and 300),
  price          numeric(12,2),
  image_url      text not null default '',
  -- Bağlar isteğe bağlı: föy silinirse stok kaydı durur.
  sheet_id       uuid references public.production_sheets(id) on delete set null,
  web_product_id bigint,
  web_url        text not null default '',
  -- Ürün SİLİNMEZ (hareket geçmişi gider); listeden kaldırmak = active false.
  active         boolean not null default true,
  created_by     uuid references public.profiles(id) on delete set null,
  updated_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- Aynı kod iki kez açılmasın (boş kod serbest).
create unique index if not exists stock_products_ws_code_uidx
  on public.stock_products (workspace_id, lower(code)) where code <> '';
create index if not exists stock_products_ws_idx
  on public.stock_products (workspace_id, active, name);

drop trigger if exists set_stock_products_updated_at on public.stock_products;
create trigger set_stock_products_updated_at
  before update on public.stock_products
  for each row execute function set_updated_at();

-- ── Hareket defteri ─────────────────────────────────────────────────────────
create table if not exists public.stock_movements (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  product_id   uuid not null references public.stock_products(id) on delete cascade,
  -- Hareketi olan yer silinemez (restrict) — stok havada kalmasın.
  location_id  uuid not null references public.stock_locations(id) on delete restrict,
  -- Beden BÜYÜK HARF tutulur ("ONE SIZE"); eski programdaki "One Size" /
  -- "ONE SIZE" ikiliği aynı ürünü iki satıra bölüyordu.
  size         text not null check (char_length(size) between 1 and 30 and size = upper(size)),
  -- giris · satis · iade · transfer · sayim · cikis
  kind         text not null check (kind in ('giris','satis','iade','transfer','sayim','cikis')),
  -- İŞARETLİ adet: giriş/iade +, satış/çıkış −, transfer bir yerde − ötekinde +,
  -- sayım farkı ne ise o.
  qty          int  not null check (qty <> 0),
  unit_price   numeric(12,2),
  note         text not null default '',
  -- Transferin iki bacağı aynı kimliği taşır.
  transfer_id  uuid,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists stock_movements_product_idx
  on public.stock_movements (workspace_id, product_id);
create index if not exists stock_movements_recent_idx
  on public.stock_movements (workspace_id, created_at desc);

-- ── Eldeki adet = hareketlerin toplamı ──────────────────────────────────────
-- security_invoker: görünüm, bakanın RLS'iyle çalışır (tabloların politikası
-- geçerli kalır; görünüm arka kapı olmaz).
create or replace view public.stock_levels
with (security_invoker = true) as
select workspace_id, product_id, location_id, size, sum(qty)::int as qty
from public.stock_movements
group by workspace_id, product_id, location_id, size;

-- ── RLS — ekip okur ve işler; yer tanımı ve hareket silme yöneticide ────────
alter table public.stock_locations enable row level security;
alter table public.stock_products  enable row level security;
alter table public.stock_movements enable row level security;

drop policy if exists "stock_locations: member read" on public.stock_locations;
create policy "stock_locations: member read"
  on public.stock_locations for select using (is_workspace_member(workspace_id));
drop policy if exists "stock_locations: admin insert" on public.stock_locations;
create policy "stock_locations: admin insert"
  on public.stock_locations for insert with check (is_workspace_admin(workspace_id));
drop policy if exists "stock_locations: admin update" on public.stock_locations;
create policy "stock_locations: admin update"
  on public.stock_locations for update
  using (is_workspace_admin(workspace_id)) with check (is_workspace_admin(workspace_id));
drop policy if exists "stock_locations: admin delete" on public.stock_locations;
create policy "stock_locations: admin delete"
  on public.stock_locations for delete using (is_workspace_admin(workspace_id));

drop policy if exists "stock_products: member read" on public.stock_products;
create policy "stock_products: member read"
  on public.stock_products for select using (is_workspace_member(workspace_id));
drop policy if exists "stock_products: member insert" on public.stock_products;
create policy "stock_products: member insert"
  on public.stock_products for insert with check (is_workspace_member(workspace_id));
drop policy if exists "stock_products: member update" on public.stock_products;
create policy "stock_products: member update"
  on public.stock_products for update
  using (is_workspace_member(workspace_id)) with check (is_workspace_member(workspace_id));
drop policy if exists "stock_products: admin delete" on public.stock_products;
create policy "stock_products: admin delete"
  on public.stock_products for delete using (is_workspace_admin(workspace_id));

drop policy if exists "stock_movements: member read" on public.stock_movements;
create policy "stock_movements: member read"
  on public.stock_movements for select using (is_workspace_member(workspace_id));
-- Hareketi yazan kendi adına yazar. GÜNCELLEME POLİTİKASI YOK: defter satırı
-- değiştirilmez; yanlış kayıt ters hareketle ya da yöneticinin silmesiyle kapanır.
drop policy if exists "stock_movements: member insert" on public.stock_movements;
create policy "stock_movements: member insert"
  on public.stock_movements for insert
  with check (is_workspace_member(workspace_id) and created_by = auth.uid());
drop policy if exists "stock_movements: admin delete" on public.stock_movements;
create policy "stock_movements: admin delete"
  on public.stock_movements for delete using (is_workspace_admin(workspace_id));

grant select, insert, update, delete on public.stock_locations to authenticated;
grant select, insert, update, delete on public.stock_products  to authenticated;
grant select, insert, delete         on public.stock_movements to authenticated;
grant select                         on public.stock_levels    to authenticated;
grant all on public.stock_locations, public.stock_products, public.stock_movements to service_role;
grant select on public.stock_levels to service_role;

-- ── Başlangıç: üç yer ───────────────────────────────────────────────────────
-- Yalnız GERÇEK çalışma alanına (föyü olan). Adlar yönetici tarafından
-- değiştirilebilir; tekrar çalışınca var olanı ezmez.
insert into public.stock_locations (workspace_id, name, kind, position)
select w.id, d.name, d.kind, d.position
from public.workspaces w
cross join (values
  ('Market 212 İstanbul', 'store',  0),
  ('Market 212 Çeşme',    'store',  1),
  ('Online',              'online', 2)
) as d(name, kind, position)
where exists (select 1 from public.production_sheets s where s.workspace_id = w.id)
on conflict (workspace_id, name) do nothing;
