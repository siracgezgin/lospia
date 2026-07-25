-- ============================================================================
-- Üretim Föyü — Kategori taksonomisi + Fiyat alanları
-- ----------------------------------------------------------------------------
-- 1) Web sitesi (aslifilinta.com) nav yapısı → föye kategori + alt kategori.
--    One-of-a-Kind / Ready to Wear / Shoes / Accessories ve alt kırılımları.
--    Liste bu kategorilere göre gruplanır/filtrelenir (web menüsü gibi).
-- 2) Fiyat: her föy = tek ürün → birim (üretim) fiyat + satın alma maliyeti +
--    web satış fiyatı. Toplam üretim maliyeti beden dağılımı toplamından
--    uygulama tarafında hesaplanır. Esnek olsun diye tek jsonb (size_distribution
--    ile aynı yaklaşım). Aslı'nın notu: asıl bilgi operasyondan gelir; web ileride
--    buradan çeker (ters değil) — şimdilik elle giriş.
-- ============================================================================

alter table public.production_sheets
  add column if not exists category    text,   -- 'one_of_a_kind' | 'ready_to_wear' | 'shoes' | 'accessories'
  add column if not exists subcategory text,   -- 'shirts_tops' | 'trousers_skirts' | 'jackets_vests' | ...
  add column if not exists pricing     jsonb not null default '{}'::jsonb;
  -- pricing shape: { unit_price, purchase_cost, web_sale_price, currency, notes }

create index if not exists production_sheets_category_idx
  on public.production_sheets(workspace_id, category);
