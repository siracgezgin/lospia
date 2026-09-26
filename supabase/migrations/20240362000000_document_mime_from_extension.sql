-- Yüklenen dosyanın TÜRÜ uzantıdan tamamlanır (geriye dönük).
--
-- İşletim sisteminin tanımadığı uzantılarda (.avif, .heic, uzantısız dosya)
-- tarayıcı türü boş ya da "application/octet-stream" olarak yolluyordu ve kayıt
-- öyle açılıyordu. Sonraki bütün kararlar yalnız bu alana bakıyor — önizleme,
-- kart ikonu, kapak imzalama ve tablodaki görsel seçicisinin SQL süzgeci
-- (`file_mime like 'image/%'`) — yani tür kaybolunca görsel hiçbir yerde görsel
-- sayılmıyor: küçük resmi çıkmıyor, tıklayınca önizleme yerine indirme
-- başlıyor, "görsel ekle" seçicisinde hiç görünmüyor.
--
-- Kayıt anındaki kök neden düzeltildi (lib/actions/document-files.ts —
-- resolveFileMime). Bu göç ESKİ satırları tamamlar; yoksa bugüne kadar
-- yüklenmiş görseller seçicide görünmemeye devam ederdi.
--
-- YALNIZ EKSİĞİ DOLDURUR: dolu ve anlamlı bir tür varsa dokunulmaz, hiçbir
-- satır silinmez, hiçbir alan boşaltılmaz. Tekrar çalıştırılabilir — ikinci
-- koşuda eşleşen satır kalmaz.

update public.operation_documents d
   set file_mime = m.mime
  from (values
    ('png',  'image/png'),
    ('jpg',  'image/jpeg'),
    ('jpeg', 'image/jpeg'),
    ('gif',  'image/gif'),
    ('webp', 'image/webp'),
    ('avif', 'image/avif'),
    ('heic', 'image/heic'),
    ('heif', 'image/heif'),
    ('bmp',  'image/bmp'),
    ('tif',  'image/tiff'),
    ('tiff', 'image/tiff'),
    ('svg',  'image/svg+xml'),
    ('pdf',  'application/pdf')
  ) as m(ext, mime)
 where d.file_path is not null
   and (
     d.file_mime is null
     or btrim(d.file_mime) = ''
     or lower(btrim(d.file_mime)) in
        ('application/octet-stream', 'binary/octet-stream', 'application/binary')
   )
   and lower(substring(coalesce(d.file_name, d.title) from '\.([A-Za-z0-9]+)$')) = m.ext;
