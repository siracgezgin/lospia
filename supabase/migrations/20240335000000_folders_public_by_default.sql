-- ---------------------------------------------------------------------------
-- KLASÖRLER VARSAYILAN OLARAK HERKESE AÇIK
--
-- Sıraç (2026-09-06): "Default olarak klasörler herkese açık gelsin, yönetici
-- gizlemek isterse gizler."
--
-- Şimdiye kadar tersiydi: document_folders.visibility sütununun VERİTABANI
-- varsayılanı 'admin'di (20240312000000_document_files.sql) — "modül açılınca
-- içerik sızmasın" gerekçesiyle. Uygulama katmanı ise klasörü zaten 'all' ile
-- açıyordu (lib/actions/document-files.ts). Yani iki katman farklı şey
-- söylüyordu; doğrudan insert eden her yol (içe aktarma betiği, tohumlama,
-- elle SQL) klasörü GİZLİ açıyordu.
--
-- Kardeş tablolar (operation_documents, operation_spreadsheets) zaten
-- 'all' varsayılanıyla duruyor (20240334000000) — bu, o kuralı klasörlere de
-- getirir ve üç tabloyu aynı hizaya sokar.
--
-- Gizleme YETKİSİ kaybolmaz: yönetici Drive'daki klasör menüsünden görünürlüğü
-- 'admin'e çevirebilir (DriveBrowser > visibilityAction).
-- ---------------------------------------------------------------------------

alter table public.document_folders
  alter column visibility set default 'all';

-- MEVCUT KLASÖRLER İÇİN NOT
-- --------------------------
-- Aşağıdaki satır BİLEREK yorumda bırakıldı. Bugün 'admin' olan klasörlerin
-- bir kısmı eski VARSAYILAN yüzünden öyle, bir kısmı ise yöneticinin BİLEREK
-- gizlemiş olmasından dolayı öyle olabilir; ikisi veritabanında birbirinden
-- ayırt edilemiyor. Toplu açmak, bilerek gizlenmiş bir klasörü tüm ekibe
-- göstermek demektir — bu geri alınamaz bir paylaşımdır.
--
-- Önce hangi klasörlerin etkileneceğini GÖR:
--   select id, name, visibility, created_at
--     from public.document_folders
--    where visibility = 'admin'
--    order by created_at;
--
-- Listeyi onayladıktan sonra açmak istersen:
--   update public.document_folders set visibility = 'all' where visibility = 'admin';
