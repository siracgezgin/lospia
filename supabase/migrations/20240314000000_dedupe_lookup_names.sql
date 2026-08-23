-- ---------------------------------------------------------------------------
-- Mükerrer kayıt temizliği: usta / sezon / tedarikçi / malzeme
--
-- Aslı Hanım (2026-08-23): "Bu ikisi aynı." — Ayarlar'da "Hakan GÜNAYDIN" ve
-- "Hakan Günaydın" iki ayrı usta olarak duruyordu, ikisi de föylere bağlıydı.
--
-- KÖK NEDEN İKİ KATLI:
--   1) Tekil kısıt `unique (workspace_id, name)` büyük/küçük harfe DUYARLI, bu
--      yüzden aynı ismin iki yazımı yan yana yaşayabiliyordu. Üstelik sadece
--      lower() eklemek de yetmezdi: Türkçe'de "I" → "ı"dır, Postgres ise "i"
--      verir; "HAKAN GÜNAYDIN" ile "Hakan Günaydın" yine eşleşmezdi.
--   2) Backfill `select distinct btrim(producer)` yapıyordu; föylerde serbest
--      metin olarak iki farklı yazım varsa ikisini de kayda çeviriyordu.
--
-- Bu migration mevcut mükerrerleri BİRLEŞTİRİR ve tekrarını engeller.
-- Silme değil TAŞIMA: kaybeden kaydın bağlı olduğu her şey kazanana geçer,
-- sonra boşalan kayıt silinir. Hiçbir föy bağlantısı kaybolmaz.
--
-- KAZANAN SEÇİMİ (açıklanabilir olsun diye sırayla):
--   1. En çok föye bağlı olan  — veri ağırlığı orada.
--   2. Tamamı BÜYÜK HARF olmayan — "Hakan GÜNAYDIN" ham Excel çıktısı,
--      "Hakan Günaydın" insanın yazdığı hâli.
--   3. En eski kayıt — deterministik son karar.
-- Yönetici kazananı Ayarlar'dan yeniden adlandırabilir; karar geri alınabilir.
-- ---------------------------------------------------------------------------

-- ── 0. TÜRKÇE'YE UYGUN İSİM ANAHTARI ───────────────────────────────────────
-- lower() tek başına YETMİYOR: Türkçe'de büyük "I"nın küçüğü noktasız "ı"dır,
-- ama Postgres'in varsayılan harflemesi "I" → "i" (noktalı) verir. Sonuç:
--     lower('HAKAN GÜNAYDIN') = 'hakan günaydin'
--     lower('Hakan Günaydın') = 'hakan günaydın'   ← eşleşmez
-- Tam da Aslı Hanım'ın gösterdiği mükerrer bu yüzden yakalanmıyordu.
-- Bu yüzden I ailesi (İ, I, ı, i) tek harfe indirgenir. DİĞER Türkçe harfler
-- (ğ/g, ü/u, ş/s, ö/o, ç/c) BİLEREK katlanmaz: "Şacit" ile "Sacit" farklı
-- isimlerdir, onları birleştirmek veri kaybı olur.
create or replace function public.af_name_key(t text)
returns text language sql immutable as $fn$
  select lower(translate(btrim(coalesce(t, '')), 'İIıi', 'iiii'));
$fn$;

-- ── 1. ÜRETİCİLER (USTALAR) ────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select workspace_id, public.af_name_key(name) as k, array_agg(id) as ids
    from public.workspace_manufacturers
    group by workspace_id, public.af_name_key(name)
    having count(*) > 1
  loop
    declare
      v_keep uuid;
    begin
      select m.id into v_keep
      from public.workspace_manufacturers m
      where m.id = any(r.ids)
      order by
        (select count(*) from public.production_sheets ps where ps.manufacturer_id = m.id) desc,
        (m.name = upper(m.name)) asc,   -- false (karışık yazım) önce gelir
        m.created_at asc
      limit 1;

      update public.production_sheets
        set manufacturer_id = v_keep
        where manufacturer_id = any(r.ids) and manufacturer_id <> v_keep;

      -- Serbest metin alanı da kazananın adına hizalanır: eski föyler, Excel
      -- çıktısı ve Ödeme Tablosu hâlâ bu kolonu okuyor.
      update public.production_sheets ps
        set producer = m.name
        from public.workspace_manufacturers m
        where m.id = v_keep and ps.manufacturer_id = v_keep
          and coalesce(ps.producer, '') is distinct from m.name;

      delete from public.workspace_manufacturers
        where id = any(r.ids) and id <> v_keep;
    end;
  end loop;
end $$;

-- ── 2. SEZONLAR ────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select workspace_id, public.af_name_key(name) as k, array_agg(id) as ids
    from public.workspace_seasons
    group by workspace_id, public.af_name_key(name)
    having count(*) > 1
  loop
    declare
      v_keep uuid;
    begin
      select s.id into v_keep
      from public.workspace_seasons s
      where s.id = any(r.ids)
      order by
        (select count(*) from public.production_sheets ps where ps.season_id = s.id) desc,
        s.is_current desc,              -- aktif sezon kaybetmesin
        (s.name = upper(s.name)) asc,
        s.created_at asc
      limit 1;

      update public.production_sheets
        set season_id = v_keep
        where season_id = any(r.ids) and season_id <> v_keep;

      update public.production_sheets ps
        set season = s.name
        from public.workspace_seasons s
        where s.id = v_keep and ps.season_id = v_keep
          and coalesce(ps.season, '') is distinct from s.name;

      delete from public.workspace_seasons
        where id = any(r.ids) and id <> v_keep;
    end;
  end loop;
end $$;

-- ── 3. TEDARİKÇİLER ────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select workspace_id, public.af_name_key(name) as k, array_agg(id) as ids
    from public.workspace_suppliers
    group by workspace_id, public.af_name_key(name)
    having count(*) > 1
  loop
    declare
      v_keep uuid;
    begin
      select sp.id into v_keep
      from public.workspace_suppliers sp
      where sp.id = any(r.ids)
      order by
        (select count(*) from public.workspace_materials m where m.supplier_id = sp.id) desc,
        (sp.name = upper(sp.name)) asc,
        sp.created_at asc
      limit 1;

      update public.workspace_materials
        set supplier_id = v_keep
        where supplier_id = any(r.ids) and supplier_id <> v_keep;

      delete from public.workspace_suppliers
        where id = any(r.ids) and id <> v_keep;
    end;
  end loop;
end $$;

-- ── 4. MALZEMELER ──────────────────────────────────────────────────────────
-- Reçetede (sheet_id, material_id) tekil: birleştirme aynı föyde iki satır
-- üretebilir. Önce kazanana taşınabilecek olanlar taşınır, ÇAKIŞANLAR silinir
-- (aynı malzemenin aynı föyde iki kaydı zaten hatalı veri).
do $$
declare r record;
begin
  for r in
    select workspace_id, public.af_name_key(name) as k, array_agg(id) as ids
    from public.workspace_materials
    group by workspace_id, public.af_name_key(name)
    having count(*) > 1
  loop
    declare
      v_keep uuid;
    begin
      select m.id into v_keep
      from public.workspace_materials m
      where m.id = any(r.ids)
      order by
        (select count(*) from public.production_sheet_materials sm where sm.material_id = m.id) desc,
        m.is_active desc,
        (m.name = upper(m.name)) asc,
        m.created_at asc
      limit 1;

      delete from public.production_sheet_materials sm
        where sm.material_id = any(r.ids) and sm.material_id <> v_keep
          and exists (
            select 1 from public.production_sheet_materials k
            where k.sheet_id = sm.sheet_id and k.material_id = v_keep
          );

      update public.production_sheet_materials
        set material_id = v_keep
        where material_id = any(r.ids) and material_id <> v_keep;

      delete from public.workspace_materials
        where id = any(r.ids) and id <> v_keep;
    end;
  end loop;
end $$;

-- ── 5. TEKRARI ENGELLE ─────────────────────────────────────────────────────
-- Büyük/küçük harften bağımsız tekillik. Mevcut `unique (workspace_id, name)`
-- kısıtları duruyor; bu indeksler onların kaçırdığı durumu kapatıyor.
drop index if exists workspace_manufacturers_name_ci_idx;
create unique index workspace_manufacturers_name_ci_idx
  on public.workspace_manufacturers (workspace_id, public.af_name_key(name));

drop index if exists workspace_seasons_name_ci_idx;
create unique index workspace_seasons_name_ci_idx
  on public.workspace_seasons (workspace_id, public.af_name_key(name));

drop index if exists workspace_suppliers_name_ci_idx;
create unique index workspace_suppliers_name_ci_idx
  on public.workspace_suppliers (workspace_id, public.af_name_key(name));

drop index if exists workspace_materials_name_ci_idx;
create unique index workspace_materials_name_ci_idx
  on public.workspace_materials (workspace_id, public.af_name_key(name));
