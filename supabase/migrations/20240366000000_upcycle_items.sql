-- ---------------------------------------------------------------------------
-- UPCYCLE YAPILACAKLAR LİSTESİ  (Gül Hanım · Nisa Hanım, 04.11.2026)
--
--   Aslı Hanım listenin AFO'ya "takvim gibi" girmesini istedi — kaynak:
--   "upcycle yapılacaklar listesi.xlsx" (sayfa "Upcycle 2610").
--
-- Excel'de TEK sayfa, İKİ bölüm var; burada da tek tablo, `section` ile:
--
--   urun     → Güncel Durum · Üretim Takibi · Ürün Adı · Renk · Ürün Kodu ·
--              Upcycle Öncesi / Sonrası Görsel · Açıklama · XS…One Size ·
--              (AFR Toplam Adet = bedenlerin toplamı, saklanmaz) · Market 212 ·
--              Perakende Satış Fiyatı (TL)
--   malzeme  → "MALZEME LİSTESİ": Güncel Durum · Üretim Takibi · Ürün Adı ·
--              Renk · Ürün Türü · Fotoğraf · Açıklama · Ürün Adeti
--
-- Liste YAŞAYAN bir listedir (Calendar gibi): değerlendirme / dönem kaydı
-- yok, çalışma alanı başına bir liste. "Güncelleme Tarihi" satırların
-- updated_at'ından okunur.
--
-- Fotoğraflar `production-sheets` kovasında, yol `{workspace_id}/upcycle/…`.
--
-- İZİN: ekip birlikte dolduruyor — her üye okur, ekler, düzenler. SİLME
-- yönetici ya da satırı açan kişi (Order Review ile aynı kural, 20240365).
-- ---------------------------------------------------------------------------

create table if not exists public.upcycle_items (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  section         text not null default 'urun' check (section in ('urun','malzeme')),
  position        int  not null default 0,
  -- "Güncel Durum" — serbest metin ("Onaylandı. Üretim listesine eklenecek.")
  status_note     text not null default '' check (char_length(status_note) <= 2000),
  -- "Üretim Takibi" — sorumlular ("Selen Hanım / Kısmet Hanım")
  owners          text not null default '' check (char_length(owners) <= 300),
  name            text not null default '' check (char_length(name) <= 300),
  color           text not null default '' check (char_length(color) <= 200),
  -- "Ürün Kodu (Yıl/Kategori/Renk)" — ürün bölümü
  code            text not null default '' check (char_length(code) <= 120),
  -- "Ürün Türü" (Nakış, Ribana…) — malzeme bölümü
  material_type   text not null default '' check (char_length(material_type) <= 200),
  description     text not null default '' check (char_length(description) <= 8000),
  -- {"XS":0,"S":0,"M":0,"L":0,"XL":0,"ONE":6} — eksik anahtar 0 sayılır.
  sizes           jsonb not null default '{}'::jsonb check (jsonb_typeof(sizes) = 'object'),
  market212       integer check (market212 is null or market212 >= 0),
  retail_price    numeric(14,2) check (retail_price is null or retail_price >= 0),
  -- "Ürün Adeti" — malzeme bölümü
  quantity        integer check (quantity is null or quantity >= 0),
  -- [{ "path": "…", "url": "…" }] — malzemede "Fotoğraf" before_photos'tadır.
  before_photos   jsonb not null default '[]'::jsonb check (jsonb_typeof(before_photos) = 'array'),
  after_photos    jsonb not null default '[]'::jsonb check (jsonb_typeof(after_photos) = 'array'),
  created_by      uuid references public.profiles(id) on delete set null,
  updated_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists upcycle_items_lookup_idx
  on public.upcycle_items (workspace_id, section, position);

comment on table public.upcycle_items is
  'Upcycle yapılacaklar listesi — Excel''in karşılığı (Gül Hanım, 04.11.2026).';

drop trigger if exists set_upcycle_items_updated_at on public.upcycle_items;
create trigger set_upcycle_items_updated_at
  before update on public.upcycle_items
  for each row execute function set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.upcycle_items enable row level security;

drop policy if exists "upcycle_items: member read" on public.upcycle_items;
create policy "upcycle_items: member read"
  on public.upcycle_items for select
  using (is_workspace_member(workspace_id));

drop policy if exists "upcycle_items: member insert" on public.upcycle_items;
create policy "upcycle_items: member insert"
  on public.upcycle_items for insert
  with check (is_workspace_member(workspace_id));

drop policy if exists "upcycle_items: member update" on public.upcycle_items;
create policy "upcycle_items: member update"
  on public.upcycle_items for update
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

drop policy if exists "upcycle_items: owner or admin delete" on public.upcycle_items;
create policy "upcycle_items: owner or admin delete"
  on public.upcycle_items for delete
  using (
    is_workspace_member(workspace_id)
    and (is_workspace_admin(workspace_id) or created_by = auth.uid())
  );

grant select, insert, update, delete on public.upcycle_items to authenticated;
grant all on public.upcycle_items to service_role;
