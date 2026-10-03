-- AF TEAMWORK DOSYA TAVANI KALDIRILDI (03.10.2026)
--
-- Nisa Hanım: "Bu şekilde uyarı alıyoruz Excel dosyaları yüklerken."
-- Ekrandaki uyarı doğruydu: "Yeni Koleksiyon -2.xlsx: 25 MB sınırını aşıyor
-- (33,9 MB)." Bir hata değil, sınırın kendisiydi. Sıraç: "sınırı kaldıralım."
--
-- NEDEN ARTIK KALDIRILABİLİR: 25 MB 20240312'de konduğunda dosyanın baytları
-- bir Server Action'ın GÖVDESİNDEN geçiyordu ve Vercel'in 4,5 MB'lık sert
-- sınırı gerçek tavandı (26.09.2026, 7c2f61a). O gün yükleme iki aşamaya
-- ayrıldı: sunucu yalnız yolu üretiyor, baytlar tarayıcıdan DOĞRUDAN Storage'a
-- gidiyor. Kovanın sınırı bu yüzden tek engel kalmıştı.
--
-- ── SINIRSIZ DİYE BİR ŞEY YOK ────────────────────────────────────────────
-- `file_size_limit = null` kovanın KENDİ kilidini kaldırır; yerine Supabase'in
-- PROJE GENELİNDEKİ tavanı geçer ve o değer buradan değiştirilemez:
--   Dashboard → Storage → Settings → "Upload file size limit"
-- Yükleme hâlâ reddediliyorsa bakılacak yer orasıdır. Tavan planın izin
-- verdiği değeri de aşamaz.
--
-- 20 MB'LIK AKTARIM TAVANI AYRI VE DEĞİŞMİYOR (lib/actions/document-files.ts):
-- dosyayı panel içinde "Tablo"ya çevirmek zip'i sunucuda belleğe açmayı
-- gerektiriyor ve ağır dosyada fonksiyon süre aşımına düşüyor. Yani büyük bir
-- Excel YÜKLENİR, Drive'da durur, indirilir — yalnız panel içi tabloya
-- çevrilmez ve ekran bunu açıkça söyler.
--
-- Yalnız kovanın ayarını değiştirir; hiçbir dosyaya, hiçbir satıra dokunmaz.
-- Tekrar çalıştırılabilir.

update storage.buckets
   set file_size_limit = null
 where id = 'documents'
   and file_size_limit is not null;
