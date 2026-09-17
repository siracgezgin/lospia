-- KOLEKSİYON ↔ WEB SİTESİ: iki yönlü çalışma için mutabakat noktası.
--
-- Sıraç (2026-09-17): "Diyelim burada düzenleme yaptık, ben buradan CSV ile
-- siteye de ekleyebilir miyim — buradaki değişiklikler de siteye yansısın."
--
-- SORUN: "Siteden çek" şu an föydeki Designer's Note / Size & Fit /
-- Details & Care metinlerini her seferinde sitedeki haliyle EZİYOR. Aslı
-- Hanım'ın isteği föye o bilgilerin GİRİLMESİ olduğu için (17.09 videosu),
-- ekip yazdıkça yazdığı kaybolacaktı.
--
-- ÇÖZÜM: son mutabık kalınan üç metni sakla. Çekiş üç durumu ayırt eder:
--   • föy == mutabakat            → kimse dokunmamış, siteden gelen yazılır
--   • föy ≠ mutabakat, site == mutabakat → föyde emek var, KORUNUR (siteye
--                                          gönderilmeyi bekliyor)
--   • föy ≠ mutabakat, site ≠ mutabakat → ÇAKIŞMA, korunur ve raporlanır
--
-- Ayrı bir "gönderildi" işareti YOK: kullanıcı CSV'yi WooCommerce'e yükledikten
-- sonraki çekişte site ile föy eşit çıkar, mutabakat kendiliğinden yenilenir.

alter table public.production_sheets
  add column if not exists web_baseline jsonb not null default '{}'::jsonb;

comment on column public.production_sheets.web_baseline is
  'Üç web metninin son mutabık hali: {designers_note, size_fit, details_care}. Çekişin neyi ezmeyeceğini ve CSV''ye hangi föyün gireceğini bu belirler.';

-- GERİYE DÖNÜK DOLDURMA. Şu an föylerdeki üç metin siteden geldi, yani
-- mutabıklar. Boş bırakılsaydı ilk çekiş 160 föyü "elle değiştirilmiş"
-- sanıp hepsini gönderim listesine koyardı.
update public.production_sheets
   set web_baseline = jsonb_build_object(
         'designers_note', coalesce(designers_note, ''),
         'size_fit',       coalesce(size_fit, ''),
         'details_care',   coalesce(details_care, ''))
 where web_product_id is not null
   and web_baseline = '{}'::jsonb;
