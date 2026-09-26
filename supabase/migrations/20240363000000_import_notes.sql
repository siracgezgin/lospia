-- ============================================================================
-- AKTARIM UYARILARI KAYITTA DURUR (import_notes)
--
-- BELİRTİ: Yüklenen bir .xlsx/.docx sistemin tablo/yazı modeline aktarılırken
-- gerçek kayıplar olabiliyor — kırpılan sayfa, aşılan görsel sınırı,
-- yüklenemeyen fotoğraf. Bu uyarılar yalnız AKTARIM ANINDA üretiliyor ve
-- ekranda bir onay penceresiyle bir kez gösteriliyordu.
--
-- KÖK NEDEN: aktarım İKİNCİ kez yapılmıyor. Dosyaya ikinci kez tıklandığında
-- `importUploadedSheet`/`importUploadedDoc` var olan kaydı bulup kısa devre
-- yapıyor ve `warnings: []` döndürüyor (lib/actions/document-files.ts). Yani
-- pencereyi kapatan ya da o an başka bir şeye bakan kullanıcı için o bilgi
-- BİR DAHA ASLA üretilemiyordu; "hangi görseller gelmedi" sorusunun cevabı
-- hiçbir yerde yazmıyordu.
--
-- ÇÖZÜM: uyarılar ilk aktarımda kaydın kendisine yazılır, sonraki her açılışta
-- oradan okunur.
--
-- Metin DİZİSİ (text[]): uyarılar zaten satır satır cümleler ve ekranda da
-- öyle gösteriliyor; tek metne yapıştırıp sonra ayırmak bilgiyi kaybettirirdi.
--
-- EKLEYİCİDİR: yalnız kolon ekler. Hiçbir satır güncellenmez, hiçbir alan
-- boşaltılmaz, varsayılan NULL — bugüne kadar aktarılmış kayıtlar olduğu gibi
-- kalır ve eski davranışa (uyarı yok) düşer. İdempotent: add column if not
-- exists. Kolon uygulanmadan önce de uygulama ÇALIŞIR — kod kolonsuz sürüme
-- kendiliğinden düşüyor (insertWidestFirst).
-- ============================================================================

alter table public.operation_spreadsheets add column if not exists import_notes text[];
alter table public.operation_documents   add column if not exists import_notes text[];

comment on column public.operation_spreadsheets.import_notes is
  'Dosyadan aktarım sırasında oluşan GERÇEK kayıp uyarıları; ikinci açılışta da gösterilir.';
comment on column public.operation_documents.import_notes is
  'Dosyadan aktarım sırasında oluşan GERÇEK kayıp uyarıları; ikinci açılışta da gösterilir.';

-- Proje kuralı: tablolar yeni değil ama yetki açıkça yazılır.
grant select, insert, update, delete on public.operation_spreadsheets to authenticated, service_role;
grant select, insert, update, delete on public.operation_documents    to authenticated, service_role;
