-- ---------------------------------------------------------------------------
-- SİPARİŞ DEĞERLENDİRME  (Nisa Hanım, 29.10.2026)
--
--   "Bu sistemi takvim gibi rica etsem operasyon sistemine entegre edebilir
--    miyiz?" — kaynak: Asli_Filinta_Siparis_Degerlendirme.xlsx
--
-- Excel'in birebir karşılığı: bir DEĞERLENDİRME (sezon · tarih · sipariş /
-- referans) ve altında ürün SATIRLARI. Satır sütunları Excel'le aynı sırada:
--   No · Ürün Fotoğrafı (Orijinal) · İmalatçı Numunesi · Ürün Kodu ·
--   Ürün Grubu · Ürün Kritikleri / Deneme Notları · Aslı Notları (toplantı) ·
--   Kumaş / İçerik · Önerilen Renkler · Planlanan Adet · Birim Fiyat · Döviz ·
--   Karar / Durum
--
-- "ASLI NOTLAR 27.10 TOPLANTI" bir sütun değil bir GEÇMİŞTİR: Excel'de her
-- toplantıda başlığın tarihi değişiyor ve önceki not eziliyordu. Burada her
-- not kendi toplantı tarihiyle `meeting_notes` dizisine eklenir; eskisi kalır.
--
-- Fotoğraflar `production-sheets` kovasında (föy görselleriyle aynı kova ve
-- aynı politika), yol `{workspace_id}/siparis/{review_id}/…`. Hücre yalnız
-- yolu ve adresi tutar.
--
-- İZİN: ekip birlikte dolduruyor (kritik yazan, numune ekleyen, karar veren
-- farklı kişiler) — her üye okur, ekler, düzenler. SİLME yönetici ya da
-- kaydı açan kişi (AF Teamwork'teki sahiplik kuralı, 20240334).
-- ---------------------------------------------------------------------------

create table if not exists public.order_reviews (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- "Sipariş / Referans" — kutucuğun adı.
  title        text not null default '' check (char_length(title) <= 300),
  -- "Sezon / Koleksiyon" — Koleksiyon'un sezonuyla aynı kayıt; sezon
  -- silinirse değerlendirme kalır, sezonsuz görünür.
  season_id    uuid references public.workspace_seasons(id) on delete set null,
  -- "Tarih"
  review_date  date,
  created_by   uuid references public.profiles(id) on delete set null,
  updated_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists order_reviews_lookup_idx
  on public.order_reviews (workspace_id, review_date desc, created_at desc);

create table if not exists public.order_review_items (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  review_id       uuid not null references public.order_reviews(id) on delete cascade,
  position        int  not null default 0,
  code            text not null default '' check (char_length(code) <= 120),
  product_group   text not null default '' check (char_length(product_group) <= 500),
  critique        text not null default '' check (char_length(critique) <= 8000),
  -- [{ "id": "…", "date": "2026-10-27", "text": "…" }] — toplantı başına bir not.
  meeting_notes   jsonb not null default '[]'::jsonb check (jsonb_typeof(meeting_notes) = 'array'),
  fabric          text not null default '' check (char_length(fabric) <= 1000),
  colors          text not null default '' check (char_length(colors) <= 1000),
  planned_qty     integer check (planned_qty is null or planned_qty >= 0),
  unit_price      numeric(14,2) check (unit_price is null or unit_price >= 0),
  currency        text not null default 'TL' check (currency in ('TL','USD','EUR','GBP')),
  -- Excel'deki açılır listenin dört değeri.
  decision        text not null default 'degerlendirmede'
                  check (decision in ('degerlendirmede','onaylandi','revize','reddedildi')),
  -- [{ "path": "…", "url": "…" }]
  original_photos jsonb not null default '[]'::jsonb check (jsonb_typeof(original_photos) = 'array'),
  sample_photos   jsonb not null default '[]'::jsonb check (jsonb_typeof(sample_photos) = 'array'),
  created_by      uuid references public.profiles(id) on delete set null,
  updated_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists order_review_items_review_idx
  on public.order_review_items (review_id, position);
create index if not exists order_review_items_workspace_idx
  on public.order_review_items (workspace_id);

comment on table public.order_reviews is
  'Sipariş Değerlendirme — Excel şablonunun karşılığı (Nisa Hanım, 29.10.2026).';
comment on column public.order_review_items.meeting_notes is
  'Aslı Hanım''ın toplantı notları — her toplantı kendi tarihiyle eklenir, eskisi silinmez.';

drop trigger if exists set_order_reviews_updated_at on public.order_reviews;
create trigger set_order_reviews_updated_at
  before update on public.order_reviews
  for each row execute function set_updated_at();

drop trigger if exists set_order_review_items_updated_at on public.order_review_items;
create trigger set_order_review_items_updated_at
  before update on public.order_review_items
  for each row execute function set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.order_reviews enable row level security;
alter table public.order_review_items enable row level security;

drop policy if exists "order_reviews: member read" on public.order_reviews;
create policy "order_reviews: member read"
  on public.order_reviews for select
  using (is_workspace_member(workspace_id));

drop policy if exists "order_reviews: member insert" on public.order_reviews;
create policy "order_reviews: member insert"
  on public.order_reviews for insert
  with check (is_workspace_member(workspace_id));

drop policy if exists "order_reviews: member update" on public.order_reviews;
create policy "order_reviews: member update"
  on public.order_reviews for update
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

drop policy if exists "order_reviews: owner or admin delete" on public.order_reviews;
create policy "order_reviews: owner or admin delete"
  on public.order_reviews for delete
  using (
    is_workspace_member(workspace_id)
    and (is_workspace_admin(workspace_id) or created_by = auth.uid())
  );

drop policy if exists "order_review_items: member read" on public.order_review_items;
create policy "order_review_items: member read"
  on public.order_review_items for select
  using (is_workspace_member(workspace_id));

-- Satır, AYNI çalışma alanındaki bir değerlendirmeye eklenebilir.
drop policy if exists "order_review_items: member insert" on public.order_review_items;
create policy "order_review_items: member insert"
  on public.order_review_items for insert
  with check (
    is_workspace_member(workspace_id)
    and exists (
      select 1 from public.order_reviews r
      where r.id = review_id and r.workspace_id = order_review_items.workspace_id
    )
  );

drop policy if exists "order_review_items: member update" on public.order_review_items;
create policy "order_review_items: member update"
  on public.order_review_items for update
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

drop policy if exists "order_review_items: owner or admin delete" on public.order_review_items;
create policy "order_review_items: owner or admin delete"
  on public.order_review_items for delete
  using (
    is_workspace_member(workspace_id)
    and (is_workspace_admin(workspace_id) or created_by = auth.uid())
  );

grant select, insert, update, delete on public.order_reviews to authenticated;
grant select, insert, update, delete on public.order_review_items to authenticated;
grant all on public.order_reviews to service_role;
grant all on public.order_review_items to service_role;
