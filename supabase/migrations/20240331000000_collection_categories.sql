-- ---------------------------------------------------------------------------
-- KOLEKSİYON KATEGORİLERİ — artık koda gömülü değil, düzenlenebilir.
--
-- Sıraç (2026-08-29): "Kategori ekle neden yok? Ve kategori düzenleme, silme
-- veya föy düzenleme, silme gibi olması gereken ne varsa olmalı. Şu an eksik."
--
-- Bugüne kadar ağaç `lib/collection/taxonomy.ts` içinde sabitti
-- (aslifilinta.com menüsüyle birebir). Yeni bir ürün ailesi çıktığında —
-- Aslı Hanım'ın toplantıda saydığı çanta/takı gibi — kod değiştirmek
-- gerekiyordu.
--
-- ANAHTAR (key) DEĞİŞMEZ: production_sheets.category / .subcategory bu metni
-- taşır. Yeniden adlandırma yalnız `label`ı değiştirir; hiçbir föy kopmaz.
--
-- Tablo BOŞSA kod varsayılanları geçerlidir (bkz. lib/collection/taxonomy.ts).
-- İlk düzenlemede varsayılanların tamamı bir kez tabloya yazılır — yoksa
-- düzenlenmeyen kategoriler ekrandan kaybolurdu. Aynı desen planning_bands'te
-- de kullanıldı.
-- ---------------------------------------------------------------------------

create table if not exists public.workspace_product_categories (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  -- Föylerin taşıdığı kalıcı anahtar. Etiket değişse de bu sabit kalır.
  key           text not null,
  label         text not null,
  -- NULL = üst kategori. Doluysa üst kategorinin `key`i.
  parent_key    text,
  position      int  not null default 0,
  -- Kutucuk kimlik rengi (hex). Boşsa kod paletinden atanır.
  color_hex     text,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null
);

-- Anahtar çalışma alanı içinde tekildir: üst ve alt kategoriler aynı ad
-- uzayını paylaşır, çünkü föy iki alanı da düz metin olarak tutuyor.
create unique index if not exists workspace_product_categories_key_idx
  on public.workspace_product_categories (workspace_id, key);

create index if not exists workspace_product_categories_tree_idx
  on public.workspace_product_categories (workspace_id, parent_key, position);

alter table public.workspace_product_categories enable row level security;

-- Okuma: çalışma alanının her üyesi. Yazma: yalnız yönetici.
drop policy if exists wpc_select on public.workspace_product_categories;
create policy wpc_select on public.workspace_product_categories
  for select using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = workspace_product_categories.workspace_id
        and m.user_id = auth.uid()
    )
  );

drop policy if exists wpc_write on public.workspace_product_categories;
create policy wpc_write on public.workspace_product_categories
  for all using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = workspace_product_categories.workspace_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  ) with check (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = workspace_product_categories.workspace_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

grant select, insert, update, delete on public.workspace_product_categories to authenticated;
grant all on public.workspace_product_categories to service_role;
