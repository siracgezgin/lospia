-- ============================================================================
-- Renk varyantı (colourway)
-- ----------------------------------------------------------------------------
-- Zedonk (rakip fashion PLM/ERP) incelemesinden: orada bir ürünün kimliği
-- "Knot dress | Organic Cotton | Blue" — yani model × kumaş × RENK. Aynı
-- modelin üç rengi tek bir stilin varyantlarıdır.
--
-- Bizde her renk AYRI BİR FÖY. Aynı modelin 3 rengi için ölçüler, talimatlar,
-- beden dağılımı ve reçete üç kez elden geçiriliyor. Aslı Hanım'ın föy
-- disiplini şikâyetinin (2026-08-21: "üç kere oturtturdum") sessiz
-- sebeplerinden biri de bu: aynı bilgiyi üç kez yazan er geç birinde hata
-- yapar ya da formatı değiştirir.
--
-- Çözüm iki alan:
--   colorway         → rengin adı ("Mavi"). Föy kimliğinin üçüncü parçası.
--   parent_sheet_id  → varyantı ana föye bağlar; Koleksiyon'da gruplanır.
--
-- Föyler BAĞIMSIZ kalır: varyant ana föyden veri OKUMAZ, oluşturulurken bir
-- kez kopyalanır. Böylece bir varyantın ölçüsü değiştirilince diğerleri
-- bozulmaz — moda üretiminde renkler arası küçük farklar olağandır.
--
-- İdempotent: add column if not exists.
-- ============================================================================

alter table public.production_sheets
  add column if not exists colorway text,
  add column if not exists parent_sheet_id uuid
    references public.production_sheets(id) on delete set null;

comment on column public.production_sheets.colorway is
  'Renk adı — föy kimliğinin üçüncü parçası (model | kumaş | RENK).';
comment on column public.production_sheets.parent_sheet_id is
  'Varyantsa ana föy. Veri paylaşılmaz; yalnız gruplama içindir.';

create index if not exists production_sheets_parent_idx
  on public.production_sheets(workspace_id, parent_sheet_id);

grant select, insert, update, delete on public.production_sheets to authenticated;
grant all on public.production_sheets to service_role;
