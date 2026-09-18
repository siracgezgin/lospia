-- SOURCING — föyün "nereden geliyor" defteri.
--
-- Aslı Hanım (18.09.2026, iki sesli video):
--   "Benim buradaki üretim föyünde ihtiyacım olan şey sourcing bölümü.
--    Sourcing'e dikim, nakış, kumaş, düğme, aksesuar… fermuar belki
--    aksesuarın altına girebilir… astar olması gerekir… etiket olur, çünkü
--    bunların yıkama talimatı etiketle aynı firma."
--   "Selen Hanım kumaşı source olarak seçerse, nakış olarak nakışçıyı
--    seçerse, üretici olarak Sabri Bey'i seçerse biz aşağıda görürüz hangi
--    üretici, nereden kumaş geliyor."
--
-- ÇÖZDÜĞÜ SOMUT SORUN, kendi cümlesiyle: "Bu kumaş için dört tane ayrı yerden
-- kumaş önerisi geliyor. Ama biz karıştık, çünkü nereden ne geldiğini
-- bilmiyoruz." Yani bir kaleme BİRDEN ÇOK kaynak gelir ve içlerinden biri
-- üretime gider. Liste bu yüzden dizi, tek alan değil.
--
-- NUMUNE VE ÜRETİM KUMAŞI AYRI: "Üretim kumaşıyla numune kumaşı farklı
-- oluyor, onu da ayırmak lazım — numuneye beş ayrı kaynaktan kumaş gelebilir
-- ama üretime bir tanesiyle gitmemiz gerekiyor."
--
-- NEDEN JSONB, NEDEN AYRI TABLO DEĞİL: kayıt föyün kendisine ait ve yalnız
-- föyle birlikte okunuyor; ayrı tablo her föy açılışına bir sorgu daha
-- eklerdi. Tedarikçi bilgisi zaten `workspace_suppliers`'ta duruyor —
-- buradaki satır ona `supplier_id` ile bağlanır, ad ve kontak serbest metin
-- olarak da yazılabilir (henüz kayıtlı olmayan firma için).
--
-- Satır şekli:
--   { id, kind, supplier_id, supplier_name, contact, note,
--     photo: { url, path } | null, chosen: bool }

alter table public.production_sheets
  add column if not exists sourcing jsonb not null default '[]'::jsonb;

comment on column public.production_sheets.sourcing is
  'Kaynak listesi: hangi kalem hangi firmadan. Bir kaleme birden çok öneri girilebilir; üretime gideni `chosen` işaretler (Aslı Hanım, 18.09.2026).';
