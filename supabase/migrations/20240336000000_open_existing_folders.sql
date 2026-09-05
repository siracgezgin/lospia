-- ---------------------------------------------------------------------------
-- MEVCUT KLASÖRLER HERKESE AÇILIYOR
--
-- Sıraç (2026-09-06), 20240335000000'deki notu okuduktan sonra: "açalım".
--
-- 20240335000000 yalnız YENİ klasörlerin varsayılanını 'all' yaptı; o tarihten
-- önce açılmış klasörler 'admin' olarak kalmıştı. Bunların çoğu eski
-- VARSAYILANDAN dolayı öyleydi (uygulama 'all' derken veritabanı 'admin'
-- diyordu), ama veritabanında "bilerek gizlendi" ile "varsayılan öyleydi"
-- ayırt edilemiyor. Bu yüzden toplu açma ayrı bir migration'a alındı: kararın
-- kendisi ve tarihi burada kayıtlı olsun.
--
-- NE DEĞİŞİR: klasör AĞACI tüm çalışma alanı üyelerine görünür olur.
-- NE DEĞİŞMEZ: dosya satırları (creative_assets) zaten üyelere okunabilirdi
-- (20240205000000, "members can select"); gizli olan klasördü, dosyalar Drive
-- ağacında görünmüyordu. Yani bu komut yeni bir SATIR erişimi açmıyor,
-- gezinmeyi açıyor.
--
-- YETKİ AYNEN DURUYOR: yönetici herhangi bir klasörü Drive'daki klasör
-- menüsünden yeniden 'admin' yapabilir (DriveBrowser > visibilityAction).
-- Belge ve tablo bazındaki görünürlük (operation_documents /
-- operation_spreadsheets) bu komuttan ETKİLENMEZ — tek tek gizlenmiş bir belge
-- gizli kalır.
--
-- GERİ ALMA: aşağıdaki komut hangi klasörleri açtığını kaydetmez. Belirli bir
-- klasörü yeniden kapatmak için:
--   update public.document_folders set visibility = 'admin' where id = '<id>';
-- ---------------------------------------------------------------------------

update public.document_folders
   set visibility = 'all',
       updated_at = now()
 where visibility = 'admin';
