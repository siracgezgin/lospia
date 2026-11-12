-- ---------------------------------------------------------------------------
-- BÜLTEN PLANI — numaralı BLOKLAR (8.11.2026 toplantısı, Aslı Hanım)
--
--   "Aynı formatta koy. Yukarıya başlık koy, altına linkini koy, altına yazı
--    diye koy." · "Çoktan seçmeli vereceksin: story, kategori, ürün…
--    Metin de; onu başa koyarsan welcome metni olur." · "Bunları bir, iki,
--    üç, dört diye seçip yerlerini de değiştirebilirsin."
--
-- Hafta artık sabit bölümlerden (açılış, welcome, ürünler, story, sosyal)
-- değil, SIRALI bir blok listesinden oluşur. Her blok aynı kalıp:
--   { id, type, title, link, text, image_url, image_path, products[],
--     platform, button, ref }
--   type ∈ gorsel · metin · urun · kategori · story · sosyal
--
-- VERİ KAYBOLMAZ: eski bölüm kolonları SİLİNMEZ. Blokları boş olan her hafta
-- eski alanlarından 5 bloğa taşınır (Görsel → Metin → Ürün → Story → Sosyal
-- medya). Welcome metni 11.11 kararıyla haftalık bültende yok; `welcome`
-- kolonunda olduğu gibi durur, bloğa kopyalanmaz.
--
-- İdempotent: yalnız `blocks = '[]'` olan satır taşınır; ikinci çalıştırma
-- ekibin düzenlediği bloklara dokunmaz.
-- ---------------------------------------------------------------------------

alter table public.newsletter_weeks
  add column if not exists blocks jsonb not null default '[]'::jsonb;

update public.newsletter_weeks w
set blocks = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text, 'type', 'gorsel',
    'title', w.opening_title, 'link', w.opening_link, 'text', '',
    'image_url', w.opening_image_url, 'image_path', '', 'products', '[]'::jsonb,
    'platform', '', 'button', '', 'ref', ''),
  jsonb_build_object(
    'id', gen_random_uuid()::text, 'type', 'metin',
    'title', '', 'link', '', 'text', '',
    'image_url', '', 'image_path', '', 'products', '[]'::jsonb,
    'platform', '', 'button', '', 'ref', ''),
  jsonb_build_object(
    'id', gen_random_uuid()::text, 'type', 'urun',
    'title', w.products_title, 'link', w.products_link, 'text', '',
    'image_url', '', 'image_path', '', 'products', w.products,
    'platform', '', 'button', '', 'ref', ''),
  jsonb_build_object(
    'id', gen_random_uuid()::text, 'type', 'story',
    'title', '', 'link', w.story_url, 'text', w.story_text,
    'image_url', w.story_image_url, 'image_path', '', 'products', '[]'::jsonb,
    'platform', '', 'button', w.story_title, 'ref', ''),
  jsonb_build_object(
    'id', gen_random_uuid()::text, 'type', 'sosyal',
    'title', '', 'link', w.social_link, 'text', '',
    'image_url', w.social_image_url, 'image_path', '', 'products', '[]'::jsonb,
    'platform', w.social_platform, 'button', '', 'ref', '')
)
where w.blocks = '[]'::jsonb;
