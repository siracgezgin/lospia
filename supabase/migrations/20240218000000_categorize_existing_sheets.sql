-- ============================================================================
-- Mevcut kategorisiz üretim föylerini web taksonomisine göre sınıflandır.
-- ----------------------------------------------------------------------------
-- Bu ürünler beden bazlı üretim adetleri taşıdığından (tek parça değil)
-- Ready to Wear kabul edilir. Alt kategori ürün cinsi/başlığından türetilir:
--   Bluz/Göynek/Gömlek → Shirts & Tops
--   Etek/Şalvar/Şort/Pantolon → Trousers & Skirts
--   Yelek/Ceket → Jackets & Vests
-- Yalnızca category IS NULL satırları etkiler (idempotent; elle atanana dokunmaz).
-- Not: "Şort" başlığı, cinsi yanlışlıkla "Yelek" olsa bile önce kontrol edilir.
-- ============================================================================

update public.production_sheets
set
  category = 'ready_to_wear',
  subcategory = case
    when title ilike '%şort%' or title ilike '%short%'
      then 'trousers_skirts'
    when product_kind ilike '%bluz%' or title ilike '%bluz%'
      or title ilike '%göynek%' or title ilike '%gömlek%' or title ilike '%gömlek%'
      then 'shirts_tops'
    when product_kind ilike '%etek%' or product_kind ilike '%şalvar%'
      or product_kind ilike '%pantolon%'
      or title ilike '%etek%' or title ilike '%şalvar%' or title ilike '%pantolon%'
      then 'trousers_skirts'
    when product_kind ilike '%yelek%' or product_kind ilike '%ceket%'
      or title ilike '%yelek%' or title ilike '%ceket%'
      then 'jackets_vests'
    else null
  end
where category is null;
