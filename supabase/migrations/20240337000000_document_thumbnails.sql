-- ---------------------------------------------------------------------------
-- GÖRSEL ÖNİZLEMELERİ
--
-- Sıraç (2026-09-06): "Orada ön gösterim tarzı olur yani boyut tutmadan."
--
-- Sorun DEPOLAMA DEĞİL BANT GENİŞLİĞİ. Ücretsiz planın aylık 5 GB indirme
-- hakkı var; ortalama 498 KB'lık görsellerle dolu bir tabloyu bir kez açmak
-- 25 MB indiriyordu. Aynı sayfa küçük önizlemelerle 0,75 MB ediyor — otuz kat
-- fark. Kota değil, sayfanın açılması ve hakkın tükenmemesi meselesi.
--
-- Önizleme AYRI BİR DOSYADIR, orijinalin yerini almaz: `thumbs/<yol>` altında
-- durur ve `thumb_path` onu işaret eder. Orijinal olduğu gibi kalır; tıklayan
-- tam boyu indirir. Boş bırakılabilir — o zaman arayüz orijinali gösterir,
-- yani eski kayıtlar bozulmaz.
-- ---------------------------------------------------------------------------

alter table public.operation_documents
  add column if not exists thumb_path text;

comment on column public.operation_documents.thumb_path is
  'Küçük önizlemenin Storage yolu (documents kovası). Boşsa arayüz file_path''i gösterir.';
