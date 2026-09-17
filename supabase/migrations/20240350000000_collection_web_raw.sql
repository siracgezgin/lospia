-- SİTEDEKİ HAM AÇIKLAMA — CSV'yi her seferinde istememek için.
--
-- Sıraç (2026-09-17): "Buradaki mantığı anlamadım. CSV, seçmeden var?"
--
-- Haklı bir itiraz: kullanıcı CSV İSTİYOR, panel ondan CSV İSTİYORDU.
--
-- NEDEN İSTİYORDU: sitedeki açıklamanın ham hâli yalnız WooCommerce'in kendi
-- dışa aktarımında bulunuyor. Store API aynı metni İŞLENMİŞ döndürüyor —
-- `<p>` sarmalı eklenmiş, düz tırnaklar kıvrılmış (title=&#8221;Size&#8221;)
-- ve o hâli siteye geri yazmak WPBakery akordeonunu çökertir.
--
-- TERS ÇEVİRME DENENDİ, OLMADI (2026-09-17): işlenmiş metinden ham metne
-- dönüş beş üründe de tutmadı; satır sonu ve boşluk düzeyinde farklar kalıyor.
--
-- ÇÖZÜM: dosya BİR KEZ istenir, ham metin burada saklanır. Sonraki
-- gönderimlerde panel kendi kopyasını kullanır ve kullanıcıdan bir şey
-- istemez. Site tarafında elle bir düzenleme olursa dosya yeniden yüklenir —
-- ekranda "CSV'yi yenile" her zaman açık durur.

alter table public.production_sheets
  add column if not exists web_raw_description text,
  add column if not exists web_raw_at timestamptz;

comment on column public.production_sheets.web_raw_description is
  'Sitedeki ürün açıklamasının HAM hâli (WooCommerce dışa aktarımından). Siteye geri yazarken yalnız ilgili [vc_tta_section] gövdesi değiştirilir; Store API bu metni işlenmiş döndürdüğü için oradan alınamaz.';
