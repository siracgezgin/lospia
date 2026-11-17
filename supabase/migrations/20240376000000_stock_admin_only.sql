-- ---------------------------------------------------------------------------
-- STOK — şimdilik YALNIZ YÖNETİCİ (17.11.2026)
--
-- Sıraç: "Bu kısım şu anlık sadece yöneticilere açık olsun; Aslı Hanım görüp
-- onayladıktan sonra diğerlerine açabiliriz."
--
-- Menüden ve sayfadan gizlemek yetmez: üye, adresi yazarak ya da API'den
-- tabloları okuyabilirdi. Bu yüzden VERİ düzeyinde de kapatılır — üye
-- politikaları kalkar, yerine yönetici politikaları gelir. `stock_levels`
-- görünümü security_invoker olduğu için kendiliğinden aynı kurala uyar.
--
-- EKİBE AÇARKEN: yeni bir migration ile buradaki "admin" politikaları
-- 20240373'teki "member" politikalarıyla değiştirilir (ve registry'de
-- access "all", sayfada requireModuleMember, lib/actions/stock.ts'te
-- STOCK_ADMIN_ONLY = false yapılır).
-- ---------------------------------------------------------------------------

-- Ürünler
drop policy if exists "stock_products: member read"   on public.stock_products;
drop policy if exists "stock_products: member insert" on public.stock_products;
drop policy if exists "stock_products: member update" on public.stock_products;
drop policy if exists "stock_products: admin read"    on public.stock_products;
drop policy if exists "stock_products: admin insert"  on public.stock_products;
drop policy if exists "stock_products: admin update"  on public.stock_products;
create policy "stock_products: admin read"
  on public.stock_products for select using (is_workspace_admin(workspace_id));
create policy "stock_products: admin insert"
  on public.stock_products for insert with check (is_workspace_admin(workspace_id));
create policy "stock_products: admin update"
  on public.stock_products for update
  using (is_workspace_admin(workspace_id)) with check (is_workspace_admin(workspace_id));

-- Hareketler
drop policy if exists "stock_movements: member read"   on public.stock_movements;
drop policy if exists "stock_movements: member insert" on public.stock_movements;
drop policy if exists "stock_movements: admin read"    on public.stock_movements;
drop policy if exists "stock_movements: admin insert"  on public.stock_movements;
create policy "stock_movements: admin read"
  on public.stock_movements for select using (is_workspace_admin(workspace_id));
create policy "stock_movements: admin insert"
  on public.stock_movements for insert
  with check (is_workspace_admin(workspace_id) and created_by = auth.uid());

-- Yerler
drop policy if exists "stock_locations: member read" on public.stock_locations;
drop policy if exists "stock_locations: admin read"  on public.stock_locations;
create policy "stock_locations: admin read"
  on public.stock_locations for select using (is_workspace_admin(workspace_id));
