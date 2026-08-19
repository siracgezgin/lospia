-- Üretim Föyü revizeleri — Aslı Hanım'ın 2026-08-19 toplantısı.
--
-- 1) İki ayrı tarih:
--      "Bir ürünlerin teslim tarihi, bir de dikim teslim tarihi lazım."
--    delivery_date (ürün teslim) zaten var → sewing_delivery_date eklenir.
--
-- 2) Teknik çizim ÖN + ARKA:
--      "En üst sağda teknik çizim ön, teknik çizim arka olacak."
--    photo_refs JSONB olduğu için şema değişmez; yeni section değerleri
--    'technical_drawing_front' / 'technical_drawing_back' uygulama katmanında
--    tanımlıdır. Eski 'technical_drawing' kayıtları ÖN kabul edilir (aşağıda
--    veri taşınır) — hiçbir görsel kaybolmaz.
--
-- 3) Beden grubu satırı (XS-S=1, M-L=2, XL-XXL=3, One Size):
--    size_distribution JSONB'sine `groups` alanı olarak yazılır; şema değişmez.
--
-- İdempotent: kolon yalnız yoksa eklenir, veri taşıma yalnız eski değeri
-- olan satırlara dokunur.

alter table public.production_sheets
  add column if not exists sewing_delivery_date text;

comment on column public.production_sheets.sewing_delivery_date is
  'Dikim teslim tarihi — ürün teslim tarihinden ayrı. Aslı Hanım, 2026-08-19.';

-- Eski tek teknik çizim kayıtları "ön" olur.
update public.production_sheets
   set photo_refs = (
     select jsonb_agg(
       case
         when img->>'section' = 'technical_drawing'
           then jsonb_set(img, '{section}', '"technical_drawing_front"')
         else img
       end
     )
     from jsonb_array_elements(photo_refs) as img
   )
 where jsonb_typeof(photo_refs) = 'array'
   and photo_refs @> '[{"section": "technical_drawing"}]';

grant select, insert, update, delete on public.production_sheets to authenticated;
grant all on public.production_sheets to service_role;
