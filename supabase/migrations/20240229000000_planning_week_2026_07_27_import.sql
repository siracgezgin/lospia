-- ============================================================================
-- Planlama — Aktif Toplantı Takvimi'nin sisteme aktarımı (27 Tem – 2 Ağu 2026)
-- ----------------------------------------------------------------------------
-- Kaynak: docs/son/AF_Work - Toplantı Takvimi.csv (AF_Work.xlsx 2. sekme).
-- Aktarılanlar:
--   * 23 toplantı  → planning_meetings (gün × saat × kategori)
--   * 42 konu      → planning_topics   (toplantı altındaki "Konu 1..5")
--   * 63 açık konu → planning_open_items ("Tamamlanmamış Eksik Konular" +
--                    departman iş listesi + günlerin serbest notları)
--
-- "Kim" sütunu iki yerde birden yaşar: ham metin `kim` alanında (Meral, Hakan
-- Usta gibi sistemde kullanıcısı olmayan kişiler kaybolmasın), eşleşenler ise
-- participant_ids'e çözülür (baş harf: "SE" → Selen Ergül).
--
-- Idempotent: her satırın id'si içeriğinden türetilir (md5 → uuid) ve
-- `on conflict do nothing` kullanılır. Tekrar çalıştırmak ne mükerrer kayıt
-- üretir ne de sonradan yapılan elle düzenlemeleri ezer.
--
-- Aktarım bir FONKSİYONdur, çünkü iki farklı anda çalışması gerekir:
--   * prod / mevcut veritabanı → bu dosya uygulanırken hemen (workspace hazır),
--   * yerel `supabase db reset` → migration'lar seed.sql'den ÖNCE koştuğu için
--     workspace henüz yokken; seed.sql sonunda aynı fonksiyon çağrılır.
-- ============================================================================

-- ── Aktarım yardımcıları (dosyanın sonunda düşürülür) ───────────────────────

-- "Selen Ergül" → "SE". Tek kelimelik adlarda ilk iki harf.
create or replace function public._planning_initials(p_name text)
returns text language sql immutable as $$
  select case
    when coalesce(btrim(p_name), '') = '' then null
    when array_length(regexp_split_to_array(btrim(p_name), '\s+'), 1) = 1
      then upper(left(btrim(p_name), 2))
    else upper(
      left((regexp_split_to_array(btrim(p_name), '\s+'))[1], 1) ||
      left((regexp_split_to_array(btrim(p_name), '\s+'))
             [array_length(regexp_split_to_array(btrim(p_name), '\s+'), 1)], 1)
    )
  end;
$$;

-- Kısaltma veya ad → çalışma alanı üyesinin user id'si (yoksa null).
-- Sıra: tam ad = kod  >  baş harfler = kod  >  ad kodla başlıyor (≥3 harf).
create or replace function public._planning_person(p_ws uuid, p_code text)
returns uuid language sql stable as $$
  select p.id
  from public.workspace_members wm
  join public.profiles p on p.id = wm.user_id
  where wm.workspace_id = p_ws
    and coalesce(btrim(p.full_name), '') <> ''
    and coalesce(btrim(p_code), '') <> ''
    and (
      lower(btrim(p.full_name)) = lower(btrim(p_code))
      or public._planning_initials(p.full_name) = upper(btrim(p_code))
      or (length(btrim(p_code)) >= 3 and lower(p.full_name) like lower(btrim(p_code)) || ' %')
    )
  order by (lower(btrim(p.full_name)) = lower(btrim(p_code))) desc
  limit 1;
$$;

-- "SE, ND" → eşleşen üyelerin id dizisi (eşleşmeyen adlar `kim` metninde kalır).
create or replace function public._planning_kim_ids(p_ws uuid, p_kim text)
returns uuid[] language sql stable as $$
  select coalesce(array_agg(distinct s.id), '{}'::uuid[])
  from (
    select public._planning_person(p_ws, btrim(tok)) as id
    from unnest(string_to_array(coalesce(p_kim, ''), ',')) as tok
  ) s
  where s.id is not null;
$$;

create or replace function public.af_import_planning_week_2026_07_27()
returns text language plpgsql as $fn$
declare
  v_ws       uuid;
  v_actor    uuid;
  v_ws_count int;
  r          record;
  v_meetings int := 0;
  v_topics   int := 0;
  v_items    int := 0;
begin
  -- Hedef çalışma alanı: "AF Operasyon". Bulunamazsa ve sistemde TEK çalışma
  -- alanı varsa o; birden fazlaysa hiçbir şey yapılmaz (demo alanı kirlenmesin).
  select id into v_ws from public.workspaces where name = 'AF Operasyon' order by created_at limit 1;
  if v_ws is null then
    select count(*) into v_ws_count from public.workspaces;
    if v_ws_count = 1 then
      select id into v_ws from public.workspaces limit 1;
    end if;
  end if;
  if v_ws is null then
    return 'Planlama aktarımı atlandı: hedef çalışma alanı bulunamadı.';
  end if;

  select wm.user_id into v_actor
  from public.workspace_members wm
  where wm.workspace_id = v_ws
  order by case wm.role when 'owner' then 0 when 'admin' then 1 else 2 end, wm.joined_at
  limit 1;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 1. Toplantılar — gün × saat kutuları
  -- ═══════════════════════════════════════════════════════════════════════
  for r in
    select * from (values
      -- 09:00 — Üretim hattı
      ('2026-07-27'::text, '09:00'::text, 'uretim'::text,   'Ready to Wear'::text,            null::text,                                                                                     'SE, ND'::text),
      ('2026-07-28',       '09:00',       'uretim',         'One of a kind / Upcycle',        null,                                                                                           'SE'),
      ('2026-07-29',       '09:00',       'uretim',         'Aksesuar',                       null,                                                                                           'Nihal, Alev'),
      ('2026-07-30',       '09:00',       'uretim',         'Genel',                          'Rukiye Koleksiyon, Koleksiyon çalışma ve Hakan Usta Şalvar numune föyü',                       'EF, SE'),
      ('2026-07-31',       '09:00',       'uretim',         'Genel',                          'Rukiye Koleksiyon çalışma, Meral, Hakan Usta',                                                 'EF, SE'),
      ('2026-08-01',       '09:00',       'other',          'ETC / Uçak Bileti',              null,                                                                                           'ND'),
      -- 10:00 — AI / Marketing
      ('2026-07-27',       '10:00',       'ai',             'Lookbook',                       'Digital Footprint, Teamwork iş planlaması',                                                    'SG'),
      ('2026-07-28',       '10:00',       'marketing',      null,                             'Sosyal Medya takvim',                                                                          null),
      ('2026-07-29',       '10:00',       'ai',             'Sales & Marketing',              'Social Media / Instagram',                                                                     'SG'),
      ('2026-07-30',       '10:00',       'marketing',      null,                             null,                                                                                           'Ruki'),
      ('2026-07-31',       '10:00',       'ai',             'Genel FM',                       null,                                                                                           'SG'),
      ('2026-08-01',       '10:00',       'external',       null,                             null,                                                                                           null),  -- "DIŞ TOPLANTI" → kategori adı zaten bunu söylüyor
      -- 11:00 — Sales / Finans
      ('2026-07-27',       '11:00',       'sales',          'AFCOM',                          'Başlıklar Koleksiyon tamamlanması',                                                            'KY'),
      ('2026-07-28',       '11:00',       'sales',          'İç piyasa & İhracat',            null,                                                                                           'GÖ'),
      ('2026-07-29',       '11:00',       'sales',          'Bireysel Müşteri',               'Peştemal Foto, Kategori düzeltme, Taşlı etekleri açma, Yeni ürün Dekupe ekleme',                'KY'),
      ('2026-07-30',       '11:00',       'finance',        null,                             null,                                                                                           null),
      ('2026-07-31',       '11:00',       'sales',          'Satın Alma ve Genel',            'Bireysel Müşterileri iletişim',                                                                null),
      ('2026-08-01',       '11:00',       'external',       'KOOP',                           null,                                                                                           null),
      -- 12:00 — Sistem
      ('2026-07-27',       '12:00',       'system',         null,                             'Üretim Föy ve AFCOM Excel Çalışması',                                                          null),
      ('2026-07-28',       '12:00',       'system',         null,                             'Üretim Föy Çalışması',                                                                         null),
      ('2026-07-29',       '12:00',       'system',         null,                             'Üretim Föy Çalışması',                                                                         'SG, SE'),
      ('2026-07-30',       '12:00',       'system',         null,                             'Üretim Föy Çalışması, İmaj yaratımı',                                                          null),
      ('2026-07-31',       '12:00',       'system',         null,                             'Koleksiyon Föy Çalışması',                                                                     'KY')
    ) as t(d, slot, cat, title, content, kim)
  loop
    insert into public.planning_meetings (
      id, workspace_id, meeting_date, time_slot, category, title, content, kim,
      participant_ids, position, created_by, updated_by
    ) values (
      md5('af-plan-2026-07-27|' || r.d || '|' || r.slot)::uuid,
      v_ws, r.d::date, r.slot, r.cat, r.title, r.content, r.kim,
      public._planning_kim_ids(v_ws, r.kim), 0, v_actor, v_actor
    )
    on conflict (id) do nothing;
    if found then v_meetings := v_meetings + 1; end if;
  end loop;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 2. Konular — toplantı kutularının altındaki "Konu 1..5"
  -- ═══════════════════════════════════════════════════════════════════════
  for r in
    select * from (values
      -- Pazartesi 27 Temmuz
      ('2026-07-27'::text, '09:00'::text, 0, 'Elbise kalıp çalışması ve tshirt tasarımı'::text,                                                       'Meral, SE'::text),
      ('2026-07-27',       '09:00',       1, 'Stokta olan kumaşların koleksiyona bağlanması',                                                          null),
      ('2026-07-27',       '09:00',       2, 'Nakışlı elbisenin kalıp ve numune çalışması',                                                            null),
      ('2026-07-27',       '10:00',       0, 'Operasyona güncel üretim föyler girilecek',                                                              'SE, SG, ND'),
      ('2026-07-27',       '10:00',       1, 'Lookbook format bitsin',                                                                                 'SG, ND'),
      ('2026-07-27',       '10:00',       2, 'Operasyona koleksiyon ve maliyet girecek',                                                               null),
      ('2026-07-27',       '10:00',       3, 'Operasyona çalışma takvimi girecek',                                                                     null),
      ('2026-07-27',       '11:00',       0, 'Nihal Hoca''dan başlıkların hikayesi öğrenilecek ve web sitesine uygun halde içerik hazırlanacak',       null),
      -- Salı 28 Temmuz
      ('2026-07-28',       '09:00',       0, 'Ruki Koleksiyon çalışma',                                                                                'ND'),
      ('2026-07-28',       '09:00',       1, 'Beyaz denim 501 pantolon, şort, etek',                                                                   null),
      ('2026-07-28',       '09:00',       2, 'V yaka elbiseler taşlanmalı',                                                                            null),
      ('2026-07-28',       '10:00',       0, 'Haftalık paylasım planı ve içerik dağılımı',                                                             null),
      ('2026-07-28',       '10:00',       1, 'AF vizyonunu daha görünür kılacak içerikler',                                                            null),
      ('2026-07-28',       '10:00',       2, 'Zanaatkar hikayeleri / koleksiyon tanıtımı',                                                             null),
      ('2026-07-28',       '10:00',       3, 'Ölçümlenecek KPI''lar ve sonraki ayın hedefleri',                                                        null),
      ('2026-07-28',       '11:00',       0, 'Maçakızı satış raporları ve stok bilgisi',                                                               'GÖ'),
      ('2026-07-28',       '11:00',       1, 'Ginger & Lace İletişime geçme',                                                                          'GÖ'),
      -- Çarşamba 29 Temmuz
      ('2026-07-29',       '09:00',       0, 'Başlıklar, kemer',                                                                                       'Nihal'),
      ('2026-07-29',       '09:00',       1, 'BİZ Kolye',                                                                                              'ND'),
      ('2026-07-29',       '09:00',       2, 'Ella AFR satış, AF Yörük kolye',                                                                         'Alev'),
      ('2026-07-29',       '10:00',       0, 'Claude Instagram bağlanacak rapor',                                                                      'SG'),
      ('2026-07-29',       '10:00',       1, 'En başarılı içerik formatları',                                                                          null),
      ('2026-07-29',       '11:00',       0, 'Web sitesine giren ürünlerin detayları düzenlenecek',                                                    'KY'),
      ('2026-07-29',       '11:00',       1, 'Yeni ürünler web sitesine eklenecek',                                                                    'ND'),
      -- Perşembe 30 Temmuz
      ('2026-07-30',       '09:00',       0, 'Koleksiyon Arge',                                                                                        'GÖ'),
      ('2026-07-30',       '09:00',       1, 'Piyasa Fiyat araştırması & Maliyet Çalışması (Başlıklar, Yöynek aksesuar, Çizgili Nesrin Modeller)',     'GÖ'),
      ('2026-07-30',       '10:00',       0, 'Celebrity Styling çalışması raporlanacak',                                                               'SE'),
      ('2026-07-30',       '10:00',       1, 'Celebrity liste belirleme çalışması',                                                                    'EF'),
      ('2026-07-30',       '10:00',       2, 'AFR görsel düzenleme',                                                                                   null),
      ('2026-07-30',       '10:00',       3, 'AF Online / Instagram içerik çalışması',                                                                 'ND'),
      ('2026-07-30',       '10:00',       4, 'Celebrity ürün sözleşmesi paylasılması',                                                                 'ND'),
      ('2026-07-30',       '11:00',       0, 'Ruki ödeme tamamlansın',                                                                                 null),
      ('2026-07-30',       '11:00',       1, 'Berna ödeme tamamlansın',                                                                                null),
      ('2026-07-30',       '11:00',       2, 'Nihal Hoca ödeme tamamlansın',                                                                           null),
      -- Cuma 31 Temmuz
      ('2026-07-31',       '09:00',       0, 'Hanife Demir ile lala gömlek kumaş üretimi',                                                             null),
      ('2026-07-31',       '09:00',       1, 'Rukiye''de ki ürünlerin bitmesi ve revize edilecek ürünlerin hızlanıdırlması',                           null),
      ('2026-07-31',       '11:00',       0, 'Satın alma yaptığımız markalar rapor',                                                                   'KY'),
      ('2026-07-31',       '11:00',       1, 'Satın alma markalar online satışa sun',                                                                  'KY'),
      -- Cumartesi 1 Ağustos
      ('2026-08-01',       '10:00',       0, 'Feride NY Times',                                                                                        null),
      ('2026-08-01',       '10:00',       1, 'Beril Anatolian Roots',                                                                                  null),
      ('2026-08-01',       '10:00',       2, 'Alev Ella Beads',                                                                                        null),
      ('2026-08-01',       '11:00',       0, 'BİZ Kolye Maliyet',                                                                                      null)
    ) as t(d, slot, pos, txt, kim)
  loop
    insert into public.planning_topics (
      id, meeting_id, workspace_id, position, text, kim, participant_ids, created_by
    ) values (
      md5('af-plan-topic-2026-07-27|' || r.d || '|' || r.slot || '|' || r.pos)::uuid,
      md5('af-plan-2026-07-27|' || r.d || '|' || r.slot)::uuid,
      v_ws, r.pos, r.txt, r.kim, public._planning_kim_ids(v_ws, r.kim), v_actor
    )
    on conflict (id) do nothing;
    if found then v_topics := v_topics + 1; end if;
  end loop;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 3. Tamamlanmamış Eksik Konular + departman iş listesi + gün notları
  -- ═══════════════════════════════════════════════════════════════════════
  for r in
    select * from (values
      -- ── Kısmet Yalçın ────────────────────────────────────────────────────
      ('Kısmet Yalçın'::text, null::text,  0, 'Nakışlanacak ehramlar'::text),
      ('Kısmet Yalçın',       null,        1, 'The Nona çanta siparişi'),
      ('Kısmet Yalçın',       null,        2, 'Anatolia roots ürünlerinin sergilenmesi'),
      ('Kısmet Yalçın',       null,        3, 'Biz koop çanta charm siparişi'),
      ('Kısmet Yalçın',       null,        4, 'Carpanadan “Filinta Gibiyim” yazılacak'),
      ('Kısmet Yalçın',       null,        5, 'Ella Beads (Alev) ürünleri satın alma yapılacak'),
      ('Kısmet Yalçın',       null,        6, 'Online ürün düzeni'),
      ('Kısmet Yalçın',       null,        7, 'Başlıkların online açılması'),
      ('Kısmet Yalçın',       'sales',     8, 'Koleksiyon içerikleri excel hazırlama'),
      -- ── Selen Ergül ──────────────────────────────────────────────────────
      ('Selen Ergül',         null,        0, 'Üretim föylerinin tamamlanması ve Meral hanıma gönderilmesi'),
      ('Selen Ergül',         null,        1, 'Yeni sezon ürünler için styling yapılması'),
      ('Selen Ergül',         null,        2, 'Manken siparişinin tamamlanması'),
      ('Selen Ergül',         null,        3, 'Mağaza kalite kontrol ve styling'),
      ('Selen Ergül',         'uretim',    4, 'Üretim Föyü Çalışması'),
      -- ── EF ───────────────────────────────────────────────────────────────
      ('EF',                  null,        0, 'Eda baba aranacak'),
      ('EF',                  null,        1, 'Karsunun annesi birgül hanım aranacak (Cevahir''e ön görüşme için bilgi verildi)'),
      ('EF',                  null,        2, 'Kulplu çeyrek veya yarım altın alınacak'),
      -- ── Gül Özerdekli ────────────────────────────────────────────────────
      ('Gül Özerdekli',       null,        0, 'Nisa dan gelen basın dosyası okunacak'),
      ('Gül Özerdekli',       null,        1, 'NY time yazısının türkçe ve ing okunup kontrol edilecek'),
      ('Gül Özerdekli',       null,        2, 'Ny times yazısı Türk basını ile paylaşılacak'),
      ('Gül Özerdekli',       null,        3, 'Maliyet excel i hazırlanacak'),
      ('Gül Özerdekli',       null,        4, 'AF nin güncellediği gibi föyler düzenlenecek'),
      ('Gül Özerdekli',       null,        5, 'Manken siparişi verilecek'),
      ('Gül Özerdekli',       null,        6, 'Mağazada yapılacak etkinlikler ile ilgili Perran Hanım ve Esim Hanım ile çalışılacak.'),
      ('Gül Özerdekli',       null,        7, 'Hakan usta üretim takibi'),
      ('Gül Özerdekli',       null,        8, 'Maçakızı siparişleri ile ilgili bilgi alınacak'),
      ('Gül Özerdekli',       null,        9, 'Berk ile çekim için ufak bir görüşme'),
      ('Gül Özerdekli',       null,       10, 'Soner in istediği mood board hazırlanacak'),
      ('Gül Özerdekli',       null,       11, 'Çekim yeri listesi hazırlanacak'),
      ('Gül Özerdekli',       null,       12, 'Manken aranacak'),
      ('Gül Özerdekli',       null,       13, '15 adet look hazırlanıp Soner e gönderilecek.'),
      ('Gül Özerdekli',       null,       14, 'Broş için aksesuar hesaplanıp, siparişi verilecek'),
      ('Gül Özerdekli',       null,       15, 'Alev ile görüşülecek Fatih Altaylı röportajı organize edilecek'),
      ('Gül Özerdekli',       null,       16, 'Başlık üretim bilgileri girecek'),
      ('Gül Özerdekli',       null,       17, 'Başlıklar için Fiyat çalışılacak'),
      ('Gül Özerdekli',       null,       18, 'Başlıkların mağazaya gelmesi planlanacak'),
      ('Gül Özerdekli',       null,       19, 'Nihal Hoca ile görüşüldü cumartesi gününe kadar ürün listesi çıkaracak.'),
      ('Gül Özerdekli',       null,       20, 'AFR eski menüleri incelenecek mağaza nasıl daha canlandırılabilir planlanacak.'),
      ('Gül Özerdekli',       null,       21, 'Nakışçıdaki nakışlı üst Meral Hanım''a gönderilecek.'),
      ('Gül Özerdekli',       null,       22, 'Olgunlaşmadıki kumaşın üretim takibi ve video çekim talepleri'),
      ('Gül Özerdekli',       null,       23, 'Melis Ağazat ta ki ürünün takibi'),
      ('Gül Özerdekli',       null,       24, 'Baskılı ürünlerin üretim takibi'),
      ('Gül Özerdekli',       null,       25, 'Üretim dosyasının doldurulması'),
      ('Gül Özerdekli',       null,       26, 'Hakan ustanın ürettiklerinin listesin doldurulması ve kontrolü'),
      ('Gül Özerdekli',       null,       27, 'Üretime girecek ürünlerin föylerinin hazırlanması'),
      ('Gül Özerdekli',       null,       28, 'Mağazadaki teknik eksiklerin tamirinin takibi'),
      ('Gül Özerdekli',       null,       29, 'Gülsüm Hanım ile ilgil rapor hazırlanıp sunulacak'),
      ('Gül Özerdekli',       null,       30, 'şeffaf minik çıtçıt bulunacak'),
      ('Gül Özerdekli',       null,       31, 'AF markası ve diğer markalar karşılaştırılarak markamız için geliştirme raporu hazırlanacak'),
      ('Gül Özerdekli',       null,       32, 'Dubai deki müşteriyle ilgili bilgi toplanıp kendileriyle ön görüşme yapılacak'),
      ('Gül Özerdekli',       'uretim',   33, 'Koleksiyon Arge, Drop çalışması'),
      ('Gül Özerdekli',       'uretim',   34, 'Piyasa Fiyat araştırması & Maliyet & PSF Çalışması'),
      ('Gül Özerdekli',       'system',   35, 'Genel Sistem İyileştirme Raporlaması'),
      ('Gül Özerdekli',       'system',   36, 'İhracat Müşterileri ön araştırma'),
      -- ── Departman iş listesi (takvimin alt bloğu) ────────────────────────
      ('ND',                  'marketing', 0, 'İmaj Yaratımı'),
      ('ND',                  'tasarim',   1, 'Aksesuar Tasarımı'),
      ('SG',                  'ai',        0, 'Lookbook tasarımı'),
      -- ── Günlerin serbest notları (takvimde gün altındaki notlar) ─────────
      ('Genel',               null,        0, 'MANKEN DÜKKAN SİPARİŞİ'),
      ('Genel',               null,        1, 'ETİKET BEDEN EKRU ÇALIŞMA'),
      ('Genel',               null,        2, 'Kapfil trikolar bekliyor.'),
      ('Genel',               null,        3, 'Çizgili kumaşlar'),
      ('Genel',               null,        4, 'Hanife Demir gruba yazılan üretim mesajının ardından bireysel toplantı talep etti'),
      ('Genel',               null,        5, 'Yörük başlıkları Excel çalışması ve satış açılması')
    ) as t(owner, cat, pos, txt)
  loop
    insert into public.planning_open_items (
      id, workspace_id, owner_user_id, owner_label, text, category, position, created_by, updated_by
    ) values (
      md5('af-open-item|' || r.owner || '|' || r.pos)::uuid,
      v_ws,
      case when r.owner = 'Genel' then null else public._planning_person(v_ws, r.owner) end,
      r.owner, r.txt, r.cat, r.pos, v_actor, v_actor
    )
    on conflict (id) do nothing;
    if found then v_items := v_items + 1; end if;
  end loop;

  return format('Planlama aktarımı: %s toplantı, %s konu, %s açık konu eklendi.',
                v_meetings, v_topics, v_items);
end $fn$;

-- Mevcut veritabanında (prod / dolu yerel DB) hemen çalıştır. Boş bir DB'de
-- çalışma alanı henüz yoktur; orada seed.sql sonundaki çağrı devreye girer.
do $$
declare v_msg text;
begin
  select public.af_import_planning_week_2026_07_27() into v_msg;
  raise notice '%', v_msg;
end $$;

-- Bu fonksiyonlar yalnız aktarım içindir — uygulama rollerine kapalı olsun
-- (PostgREST üzerinden RPC olarak çağrılamasınlar). Migration/seed postgres
-- rolüyle koştuğu için aktarım etkilenmez.
revoke all on function public.af_import_planning_week_2026_07_27() from public, anon, authenticated;
revoke all on function public._planning_kim_ids(uuid, text)        from public, anon, authenticated;
revoke all on function public._planning_person(uuid, text)         from public, anon, authenticated;
revoke all on function public._planning_initials(text)             from public, anon, authenticated;
