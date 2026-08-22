-- ============================================================================
-- Üretici (Usta) — workspace_manufacturers
-- ----------------------------------------------------------------------------
-- Aslı Hanım (2026-08-19):
--   "Cihan Usta, o ustaları da öyle açacağız. Cihan diye bir fotoğraf, Hakan
--    diye bir olsa, ona gireceksin, bunlar açılacak — hangi ürünler orada
--    dikiliyor."
--
-- Bugüne kadar üretici `production_sheets.producer` içinde SERBEST METİNDİ.
-- Ödeme Tablosu o metne göre gruplandığı için "Hakan Günaydın" ile
-- "Hakan usta" iki ayrı usta oluyordu; teslim süresi, minimum adet ve para
-- birimi gibi bilgilerin tutulacağı yer hiç yoktu.
--
-- Zedonk (rakip PLM/ERP) incelemesinden alınan üç alan buraya eklendi:
--   lead_time_days  — "Lead Time: 30 days"
--   min_order_qty   — "Minimums: 50 units"
--   currency        — üretici kendi para biriminde fiyat verebilir
--
-- GERİYE UYUM: `producer` metni SİLİNMEZ. Migration mevcut metinlerden usta
-- kaydı üretir ve föyleri bağlar; eşleşmeyen bir şey kalırsa metin olduğu
-- yerde durur ve ekranda "eşleştirilmeyi bekliyor" olarak görünür.
--
-- İdempotent: create-if-not-exists / drop-if-exists + create.
-- ============================================================================

create table if not exists public.workspace_manufacturers (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  name            text not null,
  -- Aslı Hanım'ın istediği fotoğraf. Yoksa arayüz kişiye özel ikon çizer.
  photo_url       text,
  city            text,
  country         text,
  currency        text not null default 'TL',
  lead_time_days  int,          -- teslim süresi (gün)
  min_order_qty   int,          -- minimum sipariş adedi
  contact_name    text,
  phone           text,
  email           text,
  notes           text,
  is_active       boolean not null default true,
  position        int not null default 0,
  created_by      uuid references public.profiles(id) on delete set null,
  updated_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Aynı çalışma alanında aynı adla iki usta olmasın — birleştirmenin ve
  -- tekrar tekrar çalıştırmanın (idempotenlik) dayanağı bu.
  unique (workspace_id, name)
);

drop trigger if exists set_workspace_manufacturers_updated_at on public.workspace_manufacturers;
create trigger set_workspace_manufacturers_updated_at
  before update on public.workspace_manufacturers
  for each row execute function set_updated_at();

create index if not exists workspace_manufacturers_workspace_idx
  on public.workspace_manufacturers(workspace_id, is_active, position);

-- ── Föy → usta bağı ────────────────────────────────────────────────────────
alter table public.production_sheets
  add column if not exists manufacturer_id uuid
    references public.workspace_manufacturers(id) on delete set null;

create index if not exists production_sheets_manufacturer_idx
  on public.production_sheets(workspace_id, manufacturer_id);

comment on column public.production_sheets.manufacturer_id is
  'Üretici kaydı. producer metni geri uyum için korunur; ikisi doluysa bu kazanır.';

-- ---------------------------------------------------------------------------
-- RLS — koleksiyon/föy ile aynı model: üyeler okur, yönetici yazar.
-- (Üretici listesi fiyat ve iletişim taşır; herkesin düzenlemesi istenmez.)
-- ---------------------------------------------------------------------------
alter table public.workspace_manufacturers enable row level security;

drop policy if exists "workspace_manufacturers: members read" on public.workspace_manufacturers;
create policy "workspace_manufacturers: members read"
  on public.workspace_manufacturers for select
  using (is_workspace_member(workspace_id));

drop policy if exists "workspace_manufacturers: admin insert" on public.workspace_manufacturers;
create policy "workspace_manufacturers: admin insert"
  on public.workspace_manufacturers for insert
  with check (is_workspace_admin(workspace_id));

drop policy if exists "workspace_manufacturers: admin update" on public.workspace_manufacturers;
create policy "workspace_manufacturers: admin update"
  on public.workspace_manufacturers for update
  using (is_workspace_admin(workspace_id))
  with check (is_workspace_admin(workspace_id));

drop policy if exists "workspace_manufacturers: admin delete" on public.workspace_manufacturers;
create policy "workspace_manufacturers: admin delete"
  on public.workspace_manufacturers for delete
  using (is_workspace_admin(workspace_id));

-- Grants — migration up default privileges DML grant vermez (production_sheets
-- kök nedeni, 20240225 dersi); açıkça veriyoruz. RLS asıl kapı.
grant select, insert, update, delete on public.workspace_manufacturers to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Veri taşıma — mevcut `producer` metinlerinden usta kayıtları üret ve bağla.
--
-- Fonksiyona alındı çünkü YERELDE seed.sql migration'lardan SONRA koşar; o an
-- henüz hiç föy yoktur ve düz bir UPDATE hiçbir şeyi yakalamaz (20240229'daki
-- aynı ders). Prod'da migration mevcut veriye karşı koşar ve burada çağrılan
-- hâli işini görür; yerelde seed.sql sonunda ikinci kez çağrılır.
--
-- İdempotent: `on conflict do nothing` + `manufacturer_id is null` şartı.
-- Boşluk kırpılır; aynı ada sahip metinler TEK kayıtta birleşir.
-- ---------------------------------------------------------------------------
create or replace function public.af_backfill_manufacturers()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created int;
  v_linked  int;
begin
  insert into public.workspace_manufacturers (workspace_id, name)
  select distinct ps.workspace_id, btrim(ps.producer)
    from public.production_sheets ps
   where ps.producer is not null
     and btrim(ps.producer) <> ''
  on conflict (workspace_id, name) do nothing;
  get diagnostics v_created = row_count;

  update public.production_sheets ps
     set manufacturer_id = m.id
    from public.workspace_manufacturers m
   where ps.manufacturer_id is null
     and ps.producer is not null
     and m.workspace_id = ps.workspace_id
     and m.name = btrim(ps.producer);
  get diagnostics v_linked = row_count;

  return format('Üretici taşıma: %s usta eklendi, %s föy bağlandı.', v_created, v_linked);
end;
$$;

revoke execute on function public.af_backfill_manufacturers() from public, anon;
grant execute on function public.af_backfill_manufacturers() to service_role;

do $$
declare v_msg text;
begin
  select public.af_backfill_manufacturers() into v_msg;
  raise notice '%', v_msg;
end $$;
