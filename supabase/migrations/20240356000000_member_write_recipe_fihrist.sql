-- ÜYE DE DOLDURUR: reçete satırları ve fihrist kaydı (Sıraç, 24.09.2026:
-- "Reçete, fihrist kaydı ve arşivleme de üyeye açılsın").
--
-- Föyün kendisi 20240212'den beri işbirlikçi: "herhangi bir üye herhangi bir
-- föyü düzenleyebilir (Aslı'nın 'önce Gül girer, sonra Selen girer' akışı)".
-- Reçete ve fihrist o akışın parçası ama yönetici kilidindeydi — Selen Hanım
-- föyü doldururken kumaşı reçeteye ekleyemiyor, listede olmayan ustayı
-- açamıyordu. Kilit işin kendisini durduruyordu.
--
-- ÇİZGİ ŞURADA: föyün KENDİ verisi üyeye açık, çalışma alanının ORTAK
-- sözlüğünde silme yöneticide.
--   · Reçete satırı tek föye aittir → üye ekler, düzeltir, siler. (Silmeyi
--     kapatmak tutarsız olurdu: üye tüketimi zaten 0 yazabiliyor, sonuç aynı;
--     geriye yalnız basınca "yetkiniz yok" diyen bir çöp kutusu kalırdı.)
--   · Usta kaydı BİRDEN ÇOK föye bağlıdır (Hakan Usta'ya bağlı 12 föy vardı);
--     silmek başkasının verisindeki bağı koparır → silme yöneticide kalıyor.
--
-- workspace_materials (hammadde kütüphanesi) ve workspace_suppliers BU
-- MİGRATION'IN DIŞINDA: onlar çalışma alanının ortak sözlüğü, tek föyün verisi
-- değil. İstenirse ayrıca açılır.

-- ── Reçete satırları: föyle aynı model ───────────────────────────────────
drop policy if exists "production_sheet_materials: admin insert" on public.production_sheet_materials;
create policy "production_sheet_materials: members insert"
  on public.production_sheet_materials for insert
  with check (is_workspace_member(workspace_id));

drop policy if exists "production_sheet_materials: admin update" on public.production_sheet_materials;
create policy "production_sheet_materials: members update"
  on public.production_sheet_materials for update
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

drop policy if exists "production_sheet_materials: admin delete" on public.production_sheet_materials;
create policy "production_sheet_materials: members delete"
  on public.production_sheet_materials for delete
  using (is_workspace_member(workspace_id));

-- ── Fihrist: üye ekler ve düzeltir, silemez ──────────────────────────────
drop policy if exists "workspace_manufacturers: admin insert" on public.workspace_manufacturers;
create policy "workspace_manufacturers: members insert"
  on public.workspace_manufacturers for insert
  with check (is_workspace_member(workspace_id));

drop policy if exists "workspace_manufacturers: admin update" on public.workspace_manufacturers;
create policy "workspace_manufacturers: members update"
  on public.workspace_manufacturers for update
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

-- Silme: yönetici. (Var olan "admin delete" politikası olduğu gibi kalıyor.)
