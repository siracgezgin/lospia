-- ---------------------------------------------------------------------------
-- Takvimin SOL SÜTUNU artık veri — koda gömülü değil.
--
-- Aslı Hanım (2026-08-28), takvimin sol sütununu göstererek:
--   "Buraya neden müdahale edemiyorum?"
--
-- ÜRETİM / MARKETING / SALES / SİSTEM-AI şerit adları, saatleri ve renkleri
-- `lib/planning/bands.ts` içinde SABİTTİ. Yani ekip bir şeridin adını
-- değiştiremiyor, saatini kaydıramıyor, yeni bir saat açamıyordu — takvim
-- kendi takvimleri değildi.
--
-- Bu tablo o sütunu düzenlenebilir kılar. BOŞSA kod varsayılanları geçerlidir
-- (lib/planning/bands.ts): migration veri doldurmaz, mevcut takvim aynen açılır;
-- yönetici ilk düzenlemeyi yaptığında tüm şeritler bir kez buraya yazılır.
--
-- `columns` — şeridin gün başlıkları (Pzt…Paz, 7 eleman). Boş dize = o gün o
-- şeritte toplantı yok. Haftanın iskeleti bundan kurulur.
-- ---------------------------------------------------------------------------

create table if not exists public.planning_bands (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  position     int  not null default 0,
  slot         text not null default '09:00',      -- New York duvar saati
  category     text not null default 'uretim',     -- renk paterni
  label        text not null default '',           -- şerit başlığı
  -- Konu satırı sayısı ARTIK ÇİZİMDE KULLANILMIYOR: ızgara dolu satırları
  -- çizip altına bir boş satır ekliyor (2026-08-29). Kolon ileride "en çok
  -- konu" sınırı olarak gerekebilir diye duruyor; arayüzde ayarı yok.
  topic_rows   int  not null default 3,
  columns      jsonb not null default '[]'::jsonb, -- 7 gün başlığı
  created_by   uuid references auth.users(id) on delete set null,
  updated_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists planning_bands_workspace_idx
  on public.planning_bands (workspace_id, position);

comment on table public.planning_bands is
  'Haftalık takvimin sol sütunu: şerit adı, saat ve renk. Boşsa lib/planning/bands.ts varsayılanları geçerli.';

-- ── RLS — üye OKUR, yönetici YAZAR (planning_meetings ile aynı model) ───────
alter table public.planning_bands enable row level security;

drop policy if exists "planning_bands: member read" on public.planning_bands;
create policy "planning_bands: member read"
  on public.planning_bands for select
  using (is_workspace_member(workspace_id));

drop policy if exists "planning_bands: admin insert" on public.planning_bands;
create policy "planning_bands: admin insert"
  on public.planning_bands for insert
  with check (is_workspace_admin(workspace_id));

drop policy if exists "planning_bands: admin update" on public.planning_bands;
create policy "planning_bands: admin update"
  on public.planning_bands for update
  using (is_workspace_admin(workspace_id))
  with check (is_workspace_admin(workspace_id));

drop policy if exists "planning_bands: admin delete" on public.planning_bands;
create policy "planning_bands: admin delete"
  on public.planning_bands for delete
  using (is_workspace_admin(workspace_id));

grant select, insert, update, delete on public.planning_bands to authenticated;
grant all on public.planning_bands to service_role;
