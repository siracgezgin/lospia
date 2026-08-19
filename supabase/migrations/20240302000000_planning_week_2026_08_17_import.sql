-- ============================================================================
-- Planlama — Aslı Hanım'ın güncel Toplantı Takvimi (17 – 23 Ağustos 2026)
-- ----------------------------------------------------------------------------
-- Kaynak: son/AF_Work - Toplantı Takvimi (1).csv  (AF_Work.xlsx 2. sekme)
-- Sayfanın DÖRT bloğu da olduğu gibi aktarılır:
--
--   1. Haftalık ızgara       → planning_meetings (21) + planning_topics (48)
--        ÜRETİM 09:00 · MARKETING 10:00 · SALES 11:00 · SİSTEM/AI 12:00
--        her kutunun altında Konu 1..5, her konunun yanında "Kim"
--   2. Tarih/Saat matrisi    → planning_week_matrix (Mon..Fri 09:00 × departman)
--   3. Kişi sütunları        → planning_open_items (rol alt-başlıklarıyla)
--   4. Operasyon Kurgusu     → planning_process_steps (6 adım)
--
-- ESKİ AKTARIM SİLİNİR: 27 Tem – 2 Ağu haftasının toplantıları (konularıyla) ve
-- o aktarımın açık konuları kaldırılır — kullanıcı kararı: "önceden yazdıklarını
-- silebilirsin". Elle eklenen satırlara dokunulmaz (yalnız aktarımın kendi
-- türetilmiş id'leri hedeflenir).
--
-- "Kim" iki yerde birden yaşar: ham metin `kim` alanında (Meral, Nihal Hoca gibi
-- sistemde kullanıcısı olmayan kişiler kaybolmasın), eşleşenler participant_ids'e
-- çözülür ("SE" → Selen Ergül).
--
-- Idempotent: her satırın id'si içeriğinden türetilir (md5 → uuid) +
-- `on conflict do nothing`. Aktarım bir FONKSİYONdur, çünkü iki anda çalışır:
--   * prod / dolu veritabanı → bu dosya uygulanırken hemen,
--   * yerel `supabase db reset` → migration'lar seed.sql'den ÖNCE koştuğu için
--     workspace henüz yokken; seed.sql sonunda aynı fonksiyon çağrılır.
-- ============================================================================

-- ── Aktarım yardımcıları (20240229 ile aynı; burada da tanımlı olsun) ────────

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

-- "SE, ND" / "SE; GÖ" → eşleşen üyelerin id dizisi.
create or replace function public._planning_kim_ids(p_ws uuid, p_kim text)
returns uuid[] language sql stable as $$
  select coalesce(array_agg(distinct s.id), '{}'::uuid[])
  from (
    select public._planning_person(p_ws, btrim(tok)) as id
    from unnest(regexp_split_to_array(coalesce(p_kim, ''), '[,;]')) as tok
  ) s
  where s.id is not null;
$$;

-- ── Aktarım ─────────────────────────────────────────────────────────────────

create or replace function public.af_import_planning_week_2026_08_17()
returns text language plpgsql as $fn$
declare
  v_ws       uuid;
  v_actor    uuid;
  v_ws_count int;
  r          record;
  v_meetings int := 0;
  v_topics   int := 0;
  v_matrix   int := 0;
  v_items    int := 0;
  v_steps    int := 0;
  v_purged   int := 0;
  v_n        int;
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
  -- 0. Eski aktarımı temizle (27 Tem – 2 Ağu haftası + o haftanın açık konuları)
  --    Yalnız aktarımın kendi türetilmiş id'leri silinir; elle eklenenler kalır.
  -- ═══════════════════════════════════════════════════════════════════════
  delete from public.planning_meetings                 -- konular cascade ile gider
  where workspace_id = v_ws
    and id in (
      select md5('af-plan-2026-07-27|' || to_char(d::date, 'YYYY-MM-DD') || '|' || s)::uuid
      from generate_series('2026-07-27'::date, '2026-08-02'::date, interval '1 day') d
      cross join unnest(array['09:00','10:00','11:00','12:00']) s
    );
  get diagnostics v_n = row_count; v_purged := v_purged + v_n;

  delete from public.planning_open_items
  where workspace_id = v_ws
    and id in (
      select md5('af-open-item|' || o || '|' || p)::uuid
      from unnest(array['Kısmet Yalçın','Selen Ergül','EF','Gül Özerdekli','ND','SG','Genel']) o
      cross join generate_series(0, 40) p
    );
  get diagnostics v_n = row_count; v_purged := v_purged + v_n;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 1. Toplantılar — gün × saat bandı (Excel'deki renkli departman şeritleri)
  --    09:00 ÜRETİM · 10:00 MARKETING · 11:00 SALES · 12:00 SİSTEM / AI
  -- ═══════════════════════════════════════════════════════════════════════
  for r in
    select * from (values
      -- ÜRETİM — 09:00
      ('2026-08-17'::text, '09:00'::text, 'uretim'::text,    'Ready to Wear'::text,           null::text, null::text),
      ('2026-08-18',       '09:00',       'uretim',          'One of a kind / Upcycle',       null,       null),
      ('2026-08-19',       '09:00',       'uretim',          'Accessories',                   null,       null),
      ('2026-08-20',       '09:00',       'uretim',          'Satın Alma',                    null,       null),
      ('2026-08-21',       '09:00',       'uretim',          'Rapor & Arge',                  null,       null),
      ('2026-08-22',       '09:00',       'uretim',          'Calls',                         null,       null),
      -- MARKETING — 10:00
      ('2026-08-17',       '10:00',       'marketing',       'Celebrity',                     null,       null),
      ('2026-08-18',       '10:00',       'marketing',       'Interviews',                    null,       null),
      ('2026-08-19',       '10:00',       'marketing',       'AI / Sales & Marketing',        null,       null),
      ('2026-08-20',       '10:00',       'marketing',       'Celebrity',                     null,       null),
      ('2026-08-21',       '10:00',       'marketing',       'Rapor & Arge',                  null,       null),
      ('2026-08-22',       '10:00',       'marketing',       'Outside Meetings',              null,       null),
      -- SALES — 11:00
      ('2026-08-17',       '11:00',       'sales',           'AFCOM',                         null,       null),
      ('2026-08-18',       '11:00',       'sales',           'İç piyasa & İhracat',           null,       null),
      ('2026-08-19',       '11:00',       'sales',           'Bireysel Müşteri',              null,       null),
      ('2026-08-20',       '11:00',       'sales',           'Finance',                       null,       null),
      ('2026-08-21',       '11:00',       'sales',           'Rapor & Arge',                  null,       null),
      ('2026-08-22',       '11:00',       'sales',           'KOOP',                          null,       null),
      -- SİSTEM / AI — 12:00
      ('2026-08-17',       '12:00',       'system',          'AFCOM',                         null,       null),
      ('2026-08-19',       '12:00',       'system',          'AF Operational System',         null,       null),
      ('2026-08-21',       '12:00',       'system',          'Filinta Methodogy',             null,       null)
    ) as t(d, slot, cat, title, content, kim)
  loop
    insert into public.planning_meetings (
      id, workspace_id, meeting_date, time_slot, category, title, content, kim,
      participant_ids, position, created_by, updated_by
    ) values (
      md5('af-plan-2026-08-17|' || r.d || '|' || r.slot)::uuid,
      v_ws, r.d::date, r.slot, r.cat, r.title, r.content, r.kim,
      public._planning_kim_ids(v_ws, r.kim), 0, v_actor, v_actor
    )
    on conflict (id) do nothing;
    if found then v_meetings := v_meetings + 1; end if;
  end loop;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 2. Konular — "Konu 1..5" satırları (position 0..4) + yanındaki "Kim"
  -- ═══════════════════════════════════════════════════════════════════════
  for r in
    select * from (values
      -- ── ÜRETİM 09:00 ───────────────────────────────────────────────────
      ('2026-08-17'::text, '09:00'::text, 0, 'AFCOM excel dosyasının finalize edilmesi ve online ürünlerin açılması'::text,                  'KY'::text),
      ('2026-08-17',       '09:00',       1, 'Celebrity görüşme kurgusu',                                                                    'SE'),
      ('2026-08-18',       '09:00',       0, 'Meral Hanım''daki elbisenin fittingi',                                                         'SE'),
      ('2026-08-19',       '09:00',       0, 'Başlık Koleksiyonu siyah numune çalışması, Kemer numune, diğer başlık önerileri, AF başlık',   'Nihal Hoca'),
      ('2026-08-19',       '09:00',       1, 'Yörük Aksesuar calısması kolye yapımı',                                                        'Nihal Hoca'),
      ('2026-08-19',       '09:00',       4, 'BİZ Koop Aksesuarları Numune Bitsin',                                                          'ND'),
      ('2026-08-22',       '09:00',       0, 'Ebubekir Bey',                                                                                 null),
      ('2026-08-22',       '09:00',       1, 'Hande Can',                                                                                    null),
      ('2026-08-22',       '09:00',       2, 'Bige Yalın',                                                                                   null),
      ('2026-08-22',       '09:00',       3, 'Volkan Eyüboğlu',                                                                              null),
      -- ── MARKETING 10:00 ────────────────────────────────────────────────
      ('2026-08-17',       '10:00',       0, 'Operasyona güncel üretim föyler girilecek',                                                    'SE, SG, ND'),
      ('2026-08-17',       '10:00',       1, null,                                                                                           'SG, ND'),
      ('2026-08-17',       '10:00',       2, 'Operasyona koleksiyon ve maliyet girecek',                                                     null),
      ('2026-08-17',       '10:00',       3, 'Operasyona çalışma takvimi girecek',                                                           null),
      ('2026-08-17',       '10:00',       4, 'Seçilen ünlüler için celeb look konfirme',                                                     'SG, EF'),
      ('2026-08-18',       '10:00',       0, 'IZIKAD ve Beril Hanımdaki kontak',                                                             'GÖ'),
      ('2026-08-19',       '10:00',       0, 'Claude Instagram bağlanacak rapor',                                                            'SG'),
      ('2026-08-19',       '10:00',       1, 'En başarılı içerik formatları',                                                                null),
      ('2026-08-20',       '10:00',       0, 'Celebrity Styling raporlaması, yeni celebrity seçimi, ürün sözleşmesi',                        'SE'),
      ('2026-08-20',       '10:00',       1, null,                                                                                           'EF'),
      ('2026-08-20',       '10:00',       2, 'AFR görsel düzenleme',                                                                         null),
      ('2026-08-20',       '10:00',       3, 'AFCOM / Instagram içerik çalışması',                                                       'ND'),
      ('2026-08-21',       '10:00',       0, 'Özlem Özgörkey görüşme feedback',                                                              null),
      ('2026-08-21',       '10:00',       1, 'Eda baba /',                                                                                   null),
      ('2026-08-21',       '10:00',       2, 'Aytül - Celebrity sistemi',                                                                    null),
      ('2026-08-21',       '10:00',       3, 'Pınar Aytaş görüşme',                                                                          null),
      ('2026-08-22',       '10:00',       0, 'Feride NY Times',                                                                              null),
      ('2026-08-22',       '10:00',       1, 'Beril Anatolian Roots',                                                                        null),
      ('2026-08-22',       '10:00',       2, 'Alev Ella Beads',                                                                              null),
      ('2026-08-22',       '10:00',       3, 'Türkay Noğratlı',                                                                              null),
      -- ── SALES 11:00 ────────────────────────────────────────────────────
      ('2026-08-17',       '11:00',       0, 'Websitesi üzerinden çalışma',                                                                  null),
      ('2026-08-17',       '11:00',       1, 'Fotoğrafları revize etmek',                                                                    null),
      ('2026-08-17',       '11:00',       2, 'Başlık Koleksiyonu Kategori yazısı',                                                           'GÖ'),
      ('2026-08-18',       '11:00',       0, 'Ginger & Lace İletişime geçme',                                                                'GÖ'),
      ('2026-08-18',       '11:00',       1, 'Beymen',                                                                                       null),
      ('2026-08-19',       '11:00',       0, 'Web sitesine giren ürünlerin detayları düzenlenecek',                                          'KY'),
      ('2026-08-19',       '11:00',       1, 'Yeni ürünler web sitesine eklenecek',                                                          'ND'),
      ('2026-08-20',       '11:00',       0, 'Ruki ödeme tamamlansın',                                                                       null),
      ('2026-08-20',       '11:00',       1, 'Berna ödeme tamamlansın',                                                                      null),
      ('2026-08-20',       '11:00',       2, 'Nihal Hoca ödeme tamamlansın',                                                                 null),
      ('2026-08-21',       '11:00',       0, 'Ai / gercek çekim',                                                                            null),
      ('2026-08-22',       '11:00',       0, 'BİZ Kolye Maliyet',                                                                            null),
      -- ── SİSTEM / AI 12:00 ──────────────────────────────────────────────
      ('2026-08-17',       '12:00',       0, 'Lookbook tasarımı',                                                                            null),
      ('2026-08-19',       '12:00',       0, 'Operasyon sistemi geri bildirim',                                                              null)
    ) as t(d, slot, pos, txt, kim)
  loop
    insert into public.planning_topics (
      id, meeting_id, workspace_id, position, text, kim, participant_ids, created_by
    ) values (
      md5('af-plan-topic-2026-08-17|' || r.d || '|' || r.slot || '|' || r.pos)::uuid,
      md5('af-plan-2026-08-17|'       || r.d || '|' || r.slot)::uuid,
      v_ws, r.pos, r.txt, r.kim, public._planning_kim_ids(v_ws, r.kim), v_actor
    )
    on conflict (id) do nothing;
    if found then v_topics := v_topics + 1; end if;
  end loop;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 3. Tarih/Saat matrisi — takvimin altındaki departman ızgarası
  --    Sütun sırası Excel'deki gibi: Üretim · Sistem · Sales · Marketing ·
  --    (başlıksız AI sütunu) · Tasarım
  -- ═══════════════════════════════════════════════════════════════════════
  for r in
    select * from (values
      -- Pazartesi
      (0, 'uretim'::text,    0, 'Ready to Wear'::text,                                                                                'SE, Meral'::text),
      (0, 'system',          1, 'Genel Sistem İyileştirme Raporlaması',                                                                'GÖ'),
      (0, 'sales',           2, 'AFCOM Koleksiyon içerikleri excel hazırlama',                                                        'KY'),
      (0, 'marketing',       3, 'İmaj Yaratımı',                                                                                       'ND'),
      (0, 'ai',              4, null,                                                                                                  'SG'),
      (0, 'tasarim',         5, 'Aksesuar Tasarımı',                                                                                   'ND'),
      -- Salı
      (1, 'uretim',          0, 'One of a kind / Upcycle',                                                                             'SE, Ruki'),
      (1, 'system',          1, 'Koleksiyon Arge, Drop çalışması',                                                                     'GÖ'),
      (1, 'sales',           2, 'İhracat Müşterileri ön araştırma',                                                                    'GÖ'),
      -- Çarşamba
      (2, 'uretim',          0, 'Akseuar',                                                                                             'SE, Nihal'),
      (2, 'system',          1, 'Piyasa Fiyat araştırması & Maliyet & PSF Çalışması',                                                  'GÖ'),
      (2, 'sales',           2, 'Piyasa Fiyat araştırması & Maliyet Çalışması (Başlıklar, Yöynek aksesuar, Çizgili Nesrin Modeller,',  'GÖ'),
      -- Perşembe
      (3, 'uretim',          0, 'Satın Alma',                                                                                          'SE,KY'),
      (3, 'system',          1, 'Kumaş Arge',                                                                                          'EF'),
      -- Cuma
      (4, 'uretim',          0, 'Genel : Arge',                                                                                        'SE; GÖ')
    ) as t(wd, cat, pos, txt, kim)
  loop
    insert into public.planning_week_matrix (
      id, workspace_id, week_start, weekday, time_slot, category, text, kim,
      participant_ids, position, created_by, updated_by
    ) values (
      md5('af-plan-matrix-2026-08-17|' || r.wd || '|' || r.cat)::uuid,
      v_ws, '2026-08-17'::date, r.wd, '09:00', r.cat, r.txt, r.kim,
      public._planning_kim_ids(v_ws, r.kim), r.pos, v_actor, v_actor
    )
    on conflict (id) do nothing;
    if found then v_matrix := v_matrix + 1; end if;
  end loop;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 4. Kişi sütunları — "Tamamlanmamış Eksik Konular" (rol alt-başlıklarıyla)
  -- ═══════════════════════════════════════════════════════════════════════
  for r in
    select * from (values
      -- ── Kısmet Yalçın / Sales / Satın Alma ─────────────────────────────
      ('Kısmet Yalçın'::text, 'Sales / Satın Alma'::text,  0, 'The Nona çanta siparişi'::text),
      ('Kısmet Yalçın',       'Sales / Satın Alma',        1, 'Anatolia roots ürünlerinin sergilenmesi'),
      ('Kısmet Yalçın',       'Sales / Satın Alma',        2, 'Biz koop çanta charm siparişi'),
      ('Kısmet Yalçın',       'Sales / Satın Alma',        3, 'Carpanadan “Filinta Gibiyim” yazılacak'),
      ('Kısmet Yalçın',       'Sales / Satın Alma',        4, 'Ella Beads (Alev) ürünleri satın alma yapılacak'),
      ('Kısmet Yalçın',       'Sales / Satın Alma',        5, 'Manken siparişinin tamamlanması'),
      ('Kısmet Yalçın',       'Sales / Satın Alma',        6, 'Olgunlaşmadıki kumaşın üretim takibi ve video çekim talepleri (fotoğraf ve videolar Nisa aktaracak)'),
      ('Kısmet Yalçın',       'Sales / Satın Alma',        7, 'Mağazadaki teknik eksiklerin tamirinin takibi'),
      ('Kısmet Yalçın',       'Sales / Satın Alma',        8, 'Yelekler güncel fiyata çekilecek'),
      -- ── Kısmet Yalçın / Sales / AFCOM ──────────────────────────────────
      -- ("Online demiyoruz, online'ın her şeyi AFCOM demek." — 2026-08-19)
      ('Kısmet Yalçın',       'Sales / AFCOM',            100, 'Yeni ürün ekleme'),
      ('Kısmet Yalçın',       'Sales / AFCOM',            101, 'Başlık koleksiyonun sitede açılması için ürün bilgilerini almak, Başlıkların mağazaya gelmesi planlanacak, Nihal Hoca ile görüşüldü cumartesi gününe kadar ürün listesi çıkaracak.'),
      ('Kısmet Yalçın',       'Sales / AFCOM',            102, 'Potansiyel Eksikleri Raporlama'),
      ('Kısmet Yalçın',       'Sales / AFCOM',            103, 'Size chart GÖ ile birlikte web e girecek.'),
      -- ── Gül Özerdekli / Sales & Marketing ──────────────────────────────
      ('Gül Özerdekli',       'Sales & Marketing / Çekim, Basın, İhracat', 0, 'Ny times yazısı Türk basını ile paylaşılacak'),
      ('Gül Özerdekli',       'Sales & Marketing / Çekim, Basın, İhracat', 1, 'Alev ile görüşülecek Fatih Altaylı röportajı organize edilecek'),
      ('Gül Özerdekli',       'Sales & Marketing / Çekim, Basın, İhracat', 2, 'Mağazada yapılacak etkinlikler ile ilgili Perran Hanım ve Esim Hanım ile çalışılacak.'),
      ('Gül Özerdekli',       'Sales & Marketing / Çekim, Basın, İhracat', 3, 'Melis Ağazat ta ki ürünün takibi'),
      ('Gül Özerdekli',       'Sales & Marketing / Çekim, Basın, İhracat', 4, 'İhracat : Dubai deki müşteriyle ilgili bilgi toplanıp kendileriyle ön görüşme yapılacak'),
      ('Gül Özerdekli',       'Sales & Marketing / Çekim, Basın, İhracat', 5, 'Beril Hanım aranacak röportaj bilg.'),
      ('Gül Özerdekli',       'Sales & Marketing / Çekim, Basın, İhracat', 6, 'Websitesi için gerçek model ön araştırması'),
      ('Gül Özerdekli',       'Sales & Marketing / Çekim, Basın, İhracat', 7, 'Size Chart'),
      ('Gül Özerdekli',       'Sales & Marketing / Çekim, Basın, İhracat', 8, 'Low stock'),
      ('Gül Özerdekli',       'Sales & Marketing / Çekim, Basın, İhracat', 9, 'Designers note kod ekle, code ekleme işi ebubekir bey ile görüşme yapılacak'),
      -- ── Gül Özerdekli / ARGE ───────────────────────────────────────────
      ('Gül Özerdekli',       'ARGE / Piyasa Araştırması, PSF, Marka Stratejik Gelişim Raporu', 100, 'Gülsüm Hanım ile ilgil rapor hazırlanıp sunulacak'),
      ('Gül Özerdekli',       'ARGE / Piyasa Araştırması, PSF, Marka Stratejik Gelişim Raporu', 101, 'Başlıklar için Fiyat Arge'),
      ('Gül Özerdekli',       'ARGE / Piyasa Araştırması, PSF, Marka Stratejik Gelişim Raporu', 102, 'AF markası ve diğer markalar karşılaştırılarak markamız için geliştirme raporu hazırlanacak'),
      ('Gül Özerdekli',       'ARGE / Piyasa Araştırması, PSF, Marka Stratejik Gelişim Raporu', 103, 'Yörük Broş Fiyat Arge'),
      ('Gül Özerdekli',       'ARGE / Piyasa Araştırması, PSF, Marka Stratejik Gelişim Raporu', 104, 'Koleksiyon Arge'),
      ('Gül Özerdekli',       'ARGE / Piyasa Araştırması, PSF, Marka Stratejik Gelişim Raporu', 105, 'Nesrin Göynekler Arge'),
      -- ── Selen Ergül / Üretim ───────────────────────────────────────────
      ('Selen Ergül',         'Üretim',                    0, 'Üretim föylerinin tamamlanması ve Meral hanıma gönderilmesi'),
      ('Selen Ergül',         'Üretim',                    1, 'Nakışlanacak ehramlar'),
      ('Selen Ergül',         'Üretim',                    2, 'Kemer üretim föyü'),
      ('Selen Ergül',         'Üretim',                    3, 'Hakan usta üretim takibi'),
      ('Selen Ergül',         'Üretim',                    4, 'Hakan Usta ürünlerin teslimi'),
      ('Selen Ergül',         'Üretim',                    5, 'şeffaf minik çıtçıt bulunacak'),
      ('Selen Ergül',         'Üretim',                    6, 'Hakan ustanın ürettiklerinin listesin doldurulması ve kontrolü'),
      ('Selen Ergül',         'Üretim',                    7, 'Üretime girecek ürünlerin föylerinin hazırlanması'),
      ('Selen Ergül',         'Üretim',                    8, 'Göynek Baskısı üretim ve kalite kontrol takibi'),
      ('Selen Ergül',         'Üretim',                    9, 'Maliyet Çalışması'),
      ('Selen Ergül',         'Üretim',                   10, 'Stokta olan kumaşların koleksiyona bağlanması'),
      ('Selen Ergül',         'Üretim',                   11, 'Hanife Demir Kumaş Üretimi'),
      ('Selen Ergül',         'Üretim',                   12, 'Kapfil Trikolar ile ne üretelim'),
      ('Selen Ergül',         'Üretim',                   13, 'Bej ve mavi Cizgili kumaşlar ile üretim'),
      ('Selen Ergül',         'Üretim',                   14, 'Hakan Ustadaki bütün ürünler listeleme, Gül yapmıştı'),
      ('Selen Ergül',         'Üretim',                   15, 'V yaka elbiseler taşlanmalı'),
      -- ── Selen Ergül / Marketing ────────────────────────────────────────
      ('Selen Ergül',         'Marketing / Celebrity, Styling, görsel düzenleme', 100, 'Celebrity Styling raporlaması, yeni celebrity seçimi, ürün sözleşmesi'),
      ('Selen Ergül',         'Marketing / Celebrity, Styling, görsel düzenleme', 101, 'Yeni sezon ürünler için styling yapılması'),
      ('Selen Ergül',         'Marketing / Celebrity, Styling, görsel düzenleme', 102, 'Mağaza kalite kontrol ve styling'),
      ('Selen Ergül',         'Marketing / Celebrity, Styling, görsel düzenleme', 103, 'AFcom a Styling in yapılacak ürünlerin codları ve linkleri eklenecek'),
      ('Selen Ergül',         'Marketing / Celebrity, Styling, görsel düzenleme', 104, 'Afcom ölçülerde revize yapılacak. En, Boy ayrı ayrı yazılacak çarpı olarak verilmeyecek.'),
      -- ── Nisa D (rol başlığı yok) ───────────────────────────────────────
      ('Nisa D',              null,                        0, 'Beyaz denim 501 pantolon, şort, uzun etek taşlama'),
      ('Nisa D',              null,                        1, 'Maçakızı satış raporları ve stok bilgisi'),
      ('Nisa D',              null,                        2, 'Haftalık paylasım planı ve içerik dağılımı'),
      ('Nisa D',              null,                        3, 'Zanaatkar hikayeleri / koleksiyon tanıtımı'),
      ('Nisa D',              null,                        4, 'Ölçümlenecek KPI''lar ve sonraki ayın hedefleri'),
      ('Nisa D',              null,                        5, 'Lookbook format bitsin'),
      ('Nisa D',              null,                        6, 'Etiket ekru revizesi'),
      ('Nisa D',              null,                        7, 'Elbise kalıp çalışması ve tshirt tasarımı'),
      ('Nisa D',              null,                        8, 'Volkan Bey feedback'),
      ('Nisa D',              null,                        9, 'Dekupelerin arkaları yapılacak'),
      ('Nisa D',              null,                       10, 'Yeni ürünlerin kumas detayları cekilecek')
    ) as t(owner, role, pos, txt)
  loop
    insert into public.planning_open_items (
      id, workspace_id, owner_user_id, owner_label, owner_role, text, category,
      position, created_by, updated_by
    ) values (
      md5('af-open-item-2026-08-17|' || r.owner || '|' || coalesce(r.role, '-') || '|' || r.pos)::uuid,
      v_ws, public._planning_person(v_ws, r.owner), r.owner, r.role, r.txt, null,
      r.pos, v_actor, v_actor
    )
    on conflict (id) do nothing;
    if found then v_items := v_items + 1; end if;
  end loop;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 5. Operasyon Kurgusu — "Adımlar / Operasyon Kurgusu / Kim"
  -- ═══════════════════════════════════════════════════════════════════════
  for r in
    select * from (values
      (1, 'Ön Görüşme'::text,                    null::text,                    'EF'::text),
      (2, 'Fiyat ve Son Onaylama',               null,                          'AF'),
      (3, 'Arge',                                'Aksesuarın satış kutusu',     'GÖ'),
      (4, 'Tasarım ve Koleksiyon Süreci',        null,                          'AF'),
      (5, 'Üretim Süreci ve Kalite takibi',      null,                          'SE'),
      (6, 'Satın Alma ve Satış süreci',          null,                          'KY')
    ) as t(pos, title, note, kim)
  loop
    insert into public.planning_process_steps (
      id, workspace_id, position, title, note, kim, participant_ids, created_by, updated_by
    ) values (
      md5('af-process-step|' || r.pos)::uuid,
      v_ws, r.pos, r.title, r.note, r.kim,
      public._planning_kim_ids(v_ws, r.kim), v_actor, v_actor
    )
    on conflict (id) do nothing;
    if found then v_steps := v_steps + 1; end if;
  end loop;

  return format(
    'Planlama 17–23 Ağu aktarımı: %s toplantı, %s konu, %s matris satırı, %s açık konu, %s adım eklendi (%s eski satır silindi).',
    v_meetings, v_topics, v_matrix, v_items, v_steps, v_purged
  );
end $fn$;

-- Mevcut veritabanında (prod / dolu yerel DB) hemen çalıştır. Boş bir DB'de
-- çalışma alanı henüz yoktur; orada seed.sql sonundaki çağrı devreye girer.
do $$
declare v_msg text;
begin
  select public.af_import_planning_week_2026_08_17() into v_msg;
  raise notice '%', v_msg;
end $$;

-- Eski haftanın aktarım fonksiyonu artık gereksiz (seed.sql da yeni fonksiyonu
-- çağırıyor). Yardımcı fonksiyonlar (_planning_*) kalır — yeni aktarım kullanır.
drop function if exists public.af_import_planning_week_2026_07_27();

-- Bu fonksiyonlar yalnız aktarım içindir — uygulama rollerine kapalı olsun
-- (PostgREST üzerinden RPC olarak çağrılamasınlar).
revoke all on function public.af_import_planning_week_2026_08_17() from public, anon, authenticated;
revoke all on function public._planning_kim_ids(uuid, text)        from public, anon, authenticated;
revoke all on function public._planning_person(uuid, text)         from public, anon, authenticated;
revoke all on function public._planning_initials(text)             from public, anon, authenticated;
