-- ============================================================================
-- FÖYDE WEB İÇERİĞİ + WEB SİTESİ BAĞI
--
-- Aslı Hanım (2026-09-17, sesli):
--   "Ready to Wear kategorisine girdiğimiz zaman… bunların dekupe imajlarını
--    da web sitesinden çekebilir miyiz? İçindeki bütün bilgilerle beraber.
--    Yani bir daha burayı sıfırdan hazırlamasak."
--   "Burada bunların ilk fotoğrafları dekupeler olacak… buraya girdiğimiz
--    zaman web sitesindeki bütün bilgileri gireceğimiz yer olsun. Çünkü ekip
--    hâlâ Excel'de çalışıyor: designer's note, size & fit… o formatı buraya
--    girilecek şekilde hazırlarsan onlar burada olsun."
--
-- WEB SİTESİ (aslifilinta.com, WooCommerce) her ürünün açıklamasını akordeon
-- bölümleriyle tutuyor: "Designer’s Note", "Size & Fit", "Details & Care"
-- (+ her üründe aynı olan "Delivery & Returns" ve "Assistance"). Ekibin AFCOM
-- Excel'indeki sütunlar da tam bunlar. Üçü föye AYRI ALAN olarak geliyor —
-- tek bir "açıklama" kutusuna yığmak, siteye geri yazılacağı gün hangi
-- paragrafın hangi bölüme ait olduğunu kaybettirirdi.
--
-- GÖRSELLER KOPYALANMIYOR. `web_images` yalnız sitenin kendi ADRESLERİNİ tutar;
-- bayt veritabanına ya da depoya girmez. Sıraç (2026-09-16): "gereksiz yer
-- kaplanmasın, DB dolmasın." Site zaten görseli sunuyor; föy onu gösterir.
--
-- `web_product_id` YENİDEN ÇEKMENİN ANAHTARI: sitedeki SKU'lar boş (161 üründe
-- 0), ad değişebilir. WooCommerce ürün kimliği değişmez; ikinci çekişte aynı
-- föy güncellenir, kopya açılmaz. Tekillik çalışma alanı başına.
--
-- İdempotent: add column if not exists + create index if not exists.
-- Tablo zaten var ve yetkileri tanımlı; yeni GRANT gerekmiyor.
-- ============================================================================

alter table public.production_sheets
  add column if not exists web_product_id bigint,
  add column if not exists web_url        text,
  add column if not exists web_name       text,
  add column if not exists designers_note text,
  add column if not exists size_fit       text,
  add column if not exists details_care   text,
  add column if not exists web_images     jsonb not null default '[]'::jsonb,
  add column if not exists web_synced_at  timestamptz;

create unique index if not exists production_sheets_web_product_idx
  on public.production_sheets (workspace_id, web_product_id)
  where web_product_id is not null;

comment on column public.production_sheets.web_images is
  'Web sitesindeki ürün görsellerinin ADRESLERİ (ilki dekupe). Bayt saklanmaz.';
comment on column public.production_sheets.web_product_id is
  'WooCommerce ürün kimliği — siteden yeniden çekerken aynı föyü bulmanın anahtarı.';
