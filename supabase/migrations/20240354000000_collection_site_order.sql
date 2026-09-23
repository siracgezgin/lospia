-- SİTEDEKİ SIRA (Aslı Hanım, 23.09.2026: "Sitedeki gibi sıralansın ürünler").
--
-- Vitrin sırası bir merchandising kararıdır ve o karar SİTEDE veriliyor:
-- WooCommerce'in `menu_order` alanı. Panel o sırayı kendi başına uyduruyordu
-- (`updated_at` → 20240349'un otomatik doldurması), bu yüzden Koleksiyon ile
-- aslifilinta.com/collections/ready-to-wear birbirini tutmuyordu.
--
-- Doğrulandı (23.09.2026): Store API'ye `orderby=menu_order&order=asc` ile
-- sorulan KÜRESEL liste, her kategorinin kendi sayfasındaki sırayı da birebir
-- koruyor (163 ürün; ready-to-wear 91, loungewear 14 — ikisi de tuttu).
-- Bu yüzden ürün başına TEK bir sıra numarası yetiyor, kategori başına değil.
--
-- ── NEDEN YENİ KOLON, NEDEN `sort_order` KULLANILMIYOR ────────────────────
-- 20240349 mevcut föylerin HEPSİNE `sort_order` yazdı (n*1024). O değerler bir
-- insan kararı değil, o günkü `updated_at` sırasının kopyası. Dolayısıyla
-- "elle taşınmış" ile "otomatik doldurulmuş" birbirinden ayırt edilemiyor.
-- Eski sütunu sıfırlamak, bu arada gerçekten taşınmış kartları sessizce
-- kaybetmek olurdu. Onun yerine iki YENİ sütun geldi; `sort_order` olduğu gibi
-- duruyor ve yalnız GERİYE DÜŞÜŞ olarak okunuyor (web'de karşılığı olmayan,
-- hiç taşınmamış föyler yerinde kalsın diye).
--
--   web_order     → yalnız SİTEDEN ÇEKİŞ yazar. Her çekişte tazelenir.
--   manual_order  → yalnız SÜRÜKLE-BIRAK yazar. Çekiş buna asla dokunmaz,
--                   yani elle verilen sıra kalıcıdır (Sıraç'ın seçimi,
--                   23.09.2026). Kart menüsündeki "Sitedeki sıraya dön"
--                   bunu null'a çeker ve kart yine siteyi izler.
--
-- Sıra tek bir üretilmiş kolondan okunur ki hem sorgu hem de dizin tek olsun.

alter table public.production_sheets
  add column if not exists web_order    double precision,
  add column if not exists manual_order double precision;

comment on column public.production_sheets.web_order is
  'Sitedeki vitrin sırası — WooCommerce menu_order sıralamasındaki yeri. Yalnız siteden çekiş yazar.';
comment on column public.production_sheets.manual_order is
  'Elle sürükleyip bırakılan sıra. Siteden çekiş bu değere DOKUNMAZ; doluysa site sırasını ezer.';

-- Koleksiyon'un okuduğu tek sıra. `double precision`: iki kartın arasına
-- bırakılan kart, komşuların ortası olan kesirli bir sayı alıyor (bkz.
-- lib/actions/collection-order.ts) — tam sayı olsaydı araya sığmazdı.
alter table public.production_sheets
  drop column if exists list_order;
alter table public.production_sheets
  add column list_order double precision
  generated always as (coalesce(manual_order, web_order, sort_order)) stored;

comment on column public.production_sheets.list_order is
  'Koleksiyon sırası: elle taşıma > sitedeki sıra > eski sort_order. Türetilmiştir, elle yazılmaz.';

create index if not exists production_sheets_list_order_idx
  on public.production_sheets (workspace_id, list_order);
