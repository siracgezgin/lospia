-- =============================================================================
-- Üretim Föyü — production_sheets
-- =============================================================================
-- Aslı Hanım'ın talebi: Excel'de tutulan üretim föyleri uygulamaya taşınsın.
-- Her ürün bir föy (başlık = ürün adı); altında ürün bilgileri, ölçüler, beden
-- dağılımı, kumaş/dikiş talimatları gibi YAPISAL alanlar. Ekip üyeleri (Gül,
-- Selen) AYNI föye veri girebilir; kimin oluşturduğu / son girdiği görünür.
--
-- Additive & güvenli: mevcut hiçbir tabloya dokunmaz, tamamen idempotent
-- (IF NOT EXISTS / DROP POLICY IF EXISTS), en baştan RLS açık. is_workspace_admin
-- / is_workspace_member / set_updated_at() helper'ları office-center migration'ı
-- ile aynı (20240207000000_office_center_foundation.sql).
--
-- İzin modeli (server action'lar bunu yansıtır; RLS DB-katmanı güvencesi):
--   member/admin → workspace'teki tüm föyleri görür VE düzenler (işbirlikçi giriş)
--   insert       → föyü oluşturan kendini created_by yazar
--   archive/statü→ server action ile admin'e bırakılır
--   delete       → admin her şeyi; üye yalnızca kendi draft'ını
-- =============================================================================

create table if not exists public.production_sheets (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,

  -- Başlık = ürün adı (ör. "Beyaz Dantel Etek"). Föyün kimliği bu.
  title              text not null check (char_length(title) between 1 and 300),
  status             text not null default 'active'
    check (status in ('draft','active','archived')),

  -- Ürün başlık alanları — serbest metin (Excel'de "21.07.2026" gibi giriliyor).
  product_code       text,
  product_kind       text,   -- ÜRÜN CİNSİ: Etek / Şalvar / Yelek ...
  producer           text,   -- ÜRETİCİ
  description        text,   -- ÜRÜNÜN AÇIKLAMASI
  season             text,   -- SEZON
  production_date    text,   -- ÜRETİM TARİHİ
  delivery_date      text,   -- TESLİM TARİHİ
  meterage           text,   -- 1 ÜRÜNE GİDEN METRAJ

  -- Tekrarlı bloklar (jsonb):
  --   measurements       [{ no, label, value }]
  --   delivered_items    [{ no, label, qty }]
  --   size_distribution  { sizes:[...], rows:[{ label, values:[...], total }] }
  --   photo_refs         [ ...url/açıklama ]
  measurements       jsonb not null default '[]'::jsonb,
  delivered_items    jsonb not null default '[]'::jsonb,
  size_distribution  jsonb not null default '{}'::jsonb,
  photo_refs         jsonb not null default '[]'::jsonb,

  -- Uzun metin bölümleri.
  wash_instruction   text,   -- YIKAMA TALİMATI
  fabric_lining      text,   -- KUMAŞ / ASTAR
  fabric_info        text,   -- KUMAŞ BİLGİSİ
  accessories_info   text,   -- AKSESUARLAR BİLGİSİ
  embellishments     text,   -- SÜSLEMELER VE AKSESUAR AÇIKLAMASI
  sewing_instruction text,   -- DİKİŞ TALİMATI
  workmanship_notes  text,   -- ÖZEL İŞÇİLİK NOTLARI
  qc_revision        text,   -- KALİTE KONTROL REVİZYON TARİHİ
  revision_notes     text,   -- REVİZYON NOTLARI
  production_waste   text,   -- ÜRETİM FİRE PAYI

  -- İz / denetim — "kimin girdiği" föy düzeyinde.
  created_by         uuid references public.profiles(id) on delete set null,
  updated_by         uuid references public.profiles(id) on delete set null,
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists set_production_sheets_updated_at on public.production_sheets;
create trigger set_production_sheets_updated_at
  before update on public.production_sheets
  for each row execute function set_updated_at();

create index if not exists production_sheets_workspace_idx
  on public.production_sheets(workspace_id, updated_at desc);
create index if not exists production_sheets_status_idx
  on public.production_sheets(workspace_id, status);

alter table public.production_sheets enable row level security;

-- SELECT: workspace'in her üyesi tüm föyleri görür (arşiv dahil; UI filtreler).
drop policy if exists "production_sheets: members read all" on public.production_sheets;
create policy "production_sheets: members read all"
  on public.production_sheets for select
  using (is_workspace_member(workspace_id));

-- INSERT: üye kendi adına oluşturur.
drop policy if exists "production_sheets: members insert" on public.production_sheets;
create policy "production_sheets: members insert"
  on public.production_sheets for insert
  with check (
    is_workspace_member(workspace_id)
    and (created_by is null or created_by = auth.uid())
  );

-- UPDATE: işbirlikçi — herhangi bir üye herhangi bir föyü düzenleyebilir
-- (Aslı'nın "önce Gül girer, sonra Selen girer" akışı). Statü/arşiv geçişleri
-- server action tarafında admin'e kısıtlanır.
drop policy if exists "production_sheets: members update" on public.production_sheets;
create policy "production_sheets: members update"
  on public.production_sheets for update
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

-- DELETE: admin her şeyi; üye yalnızca kendi draft'ını (UI arşivi tercih eder).
drop policy if exists "production_sheets: admin or draft author delete" on public.production_sheets;
create policy "production_sheets: admin or draft author delete"
  on public.production_sheets for delete
  using (
    is_workspace_admin(workspace_id)
    or (
      is_workspace_member(workspace_id)
      and created_by = auth.uid()
      and status = 'draft'
    )
  );
