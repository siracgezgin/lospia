-- ============================================================================
-- Maliyet tablosu — "Hakan Usta Üretim Listesi" 23.07 son hâli
-- ----------------------------------------------------------------------------
-- Kaynak: Üretim Föyleri. 21 Temmuz 2026.xlsx → "Üretim Adetleri2307" sayfası.
-- Excel'deki 11 satırın üretim adetleri + birim fiyatları uygulamaya işlenir;
-- Maliyet tablosu (/collection/maliyet) ile föylerin Beden Dağılımı bölümü
-- TEK kaynaktan beslendiği için ikisi de aynı anda güncellenmiş olur.
--
-- Üç bölüm:
--   1) Beden adı düzeltmesi: "Oversize" / "Tek Beden" → "One Size" (Excel'deki
--      ONE SIZE kolonunun karşılığı; kod tarafında da tek ad — lib/collection/cost.ts).
--   2) Mevcut 8 föyün üretim adeti + birim fiyatı.
--   3) Föyü henüz açılmamış 3 ürünün (Şile Bezi Bluz / Şile Bezi Göynek /
--      Çizgili Göynek) eklenmesi — hepsi ONE SIZE.
--
-- Excel'de birleşik hücreler: Dantel Bluz, Dantel Etek ve Astar Şort satırlarında
-- adet XS+S ve M+L kolonlarına ORTAK yazılmış → föyde "XS-S" / "M-L" kolonları.
--
-- Genel toplam (KDV hariç): ₺233.400
-- Not: Excel'in alt kısmındaki numune listesi ve 1.800 TL kargo gideri bu
-- tabloya dahil DEĞİL (Aslı Hanım'ın notundaki 244 bin TL onlarla birlikte).
--
-- İdempotent: tekrar çalıştırılabilir; eşleşen föy yoksa hiçbir şey yapmaz.
-- ============================================================================

-- ── 1) Beden adı: eski tek-beden adları → "One Size" ─────────────────────────
update public.production_sheets s
set size_distribution = jsonb_set(
  s.size_distribution,
  '{sizes}',
  (
    select coalesce(
      jsonb_agg(
        case
          when lower(btrim(e.val)) in ('oversize', 'over size', 'onesize', 'tek beden', 'tekbeden')
            then to_jsonb('One Size'::text)
          else to_jsonb(e.val)
        end
        order by e.ord
      ),
      '[]'::jsonb
    )
    from jsonb_array_elements_text(s.size_distribution -> 'sizes')
      with ordinality as e(val, ord)
  )
)
where jsonb_typeof(s.size_distribution -> 'sizes') = 'array'
  and exists (
    select 1
    from jsonb_array_elements_text(s.size_distribution -> 'sizes') as x(val)
    where lower(btrim(x.val)) in ('oversize', 'over size', 'onesize', 'tek beden', 'tekbeden')
  );

-- ── 2) Mevcut föyler: üretim adeti + birim fiyat ─────────────────────────────
-- pattern  : föy başlığı (Excel adı ile birebir aynı değil — "Dantel Bluz"
--            föyde "Beyaz Dantel Bluz", "Astar Şort" ise "Vual Bej Şort Astar")
-- anti     : yanlış eşleşmeyi engelleyen dışlama ('' = dışlama yok)
--            "Çizgili Yelek" ile "Ekru Çizgili Yelek" ayrışsın diye.
update public.production_sheets s
set
  size_distribution = c.dist,
  -- Mevcut alanlar (satın alma / web satış / not) korunur; currency yoksa TL.
  pricing = jsonb_build_object('currency', 'TL')
            || coalesce(s.pricing, '{}'::jsonb)
            || jsonb_build_object('unit_price', c.unit_price)
from (
  values
    -- Dantel Bluz — 56 adet × ₺500
    ('%dantel bluz%', '',
     '{"sizes":["XS-S","M-L","XL"],"rows":[{"label":"Üretim adeti","values":["20","20","16"],"total":"56"}]}'::jsonb,
     '500'),
    -- Dantel Etek — 48 adet × ₺500 (beden etiketi 1/2/3 korunur)
    ('%dantel etek%', '',
     '{"sizes":["XS-S","M-L","XL"],"rows":[{"label":"Beden etiketi","values":["1","2","3"],"total":""},{"label":"Üretim adeti","values":["18","18","12"],"total":"48"}]}'::jsonb,
     '500'),
    -- Ekru Çizgili Etek — 12 adet × ₺500
    ('%ekru%etek%', '',
     '{"sizes":["XS","S","M","L","XL"],"rows":[{"label":"Üretim adeti","values":["","3","3","6",""],"total":"12"}]}'::jsonb,
     '500'),
    -- Ekru Çizgili Yelek — 41 adet × ₺600
    ('%ekru%yelek%', '',
     '{"sizes":["XS","S","M","L","XL"],"rows":[{"label":"Üretim adeti","values":["","11","11","11","8"],"total":"41"}]}'::jsonb,
     '600'),
    -- Siyah Yelek — 12 adet × ₺600
    ('%siyah yelek%', '',
     '{"sizes":["XS","S","M","L","XL"],"rows":[{"label":"Üretim adeti","values":["","3","3","3","3"],"total":"12"}]}'::jsonb,
     '600'),
    -- Denim Yelek — 50 adet × ₺600
    ('%denim yelek%', '',
     '{"sizes":["XS","S","M","L","XL"],"rows":[{"label":"Üretim adeti","values":["","18","13","13","6"],"total":"50"}]}'::jsonb,
     '600'),
    -- Çizgili Yelek — 19 adet × ₺600 (Ekru Çizgili Yelek hariç)
    ('%çizgili yelek%', '%ekru%',
     '{"sizes":["XS","S","M","L","XL"],"rows":[{"label":"Üretim adeti","values":["","6","5","5","3"],"total":"19"}]}'::jsonb,
     '600'),
    -- Astar Şort — 55 adet × ₺200
    ('%şort%', '',
     '{"sizes":["XS-S","M-L","XL"],"rows":[{"label":"Üretim adeti","values":["20","20","15"],"total":"55"}]}'::jsonb,
     '200')
) as c(pattern, anti, dist, unit_price)
where s.title ilike c.pattern
  and (c.anti = '' or s.title not ilike c.anti);

-- ── 3) Föyü olmayan 3 ONE SIZE ürünü ekle ────────────────────────────────────
-- Maliyet tablosu production_sheets'ten beslendiği için Excel'deki bu üç satırın
-- da bir föyü olmalı. Sadece föy kaydı olmayan workspace'lere eklenir.
insert into public.production_sheets
  (workspace_id, title, status, product_kind, producer, description,
   season, delivery_date, category, subcategory, size_distribution, pricing,
   created_by, updated_by)
select
  w.workspace_id,
  n.title,
  'active',
  n.kind,
  'Hakan Günaydın',
  n.title,
  '2026 RESORT',
  '21.07.2026',
  'ready_to_wear',
  'shirts_tops',
  format(
    '{"sizes":["One Size"],"rows":[{"label":"Üretim adeti","values":["%s"],"total":"%s"}]}',
    n.qty, n.qty
  )::jsonb,
  jsonb_build_object('unit_price', n.unit_price, 'currency', 'TL'),
  w.admin_id,
  w.admin_id
from (
  select
    p.workspace_id,
    -- Föyü "kim girdi" izi: önce admin, yoksa owner; ikisi de yoksa null.
    (select wm.user_id
       from public.workspace_members wm
      where wm.workspace_id = p.workspace_id
        and wm.role in ('admin', 'owner')
      order by (wm.role = 'admin') desc, wm.joined_at
      limit 1) as admin_id
  from public.production_sheets p
  group by p.workspace_id
) as w
cross join (
  values
    ('Şile Bezi Bluz',   'Bluz',   '27', '400'),
    ('Şile Bezi Göynek', 'Göynek', '69', '600'),
    ('Çizgili Göynek',   'Göynek', '60', '650')
) as n(title, kind, qty, unit_price)
where not exists (
  select 1
  from public.production_sheets x
  where x.workspace_id = w.workspace_id
    and x.title ilike n.title
);
