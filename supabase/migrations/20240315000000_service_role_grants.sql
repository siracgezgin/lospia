-- ---------------------------------------------------------------------------
-- service_role yetkileri — sunucu tarafı yönetim işlemleri
--
-- BULUNUŞU: "Kişi ekle" formu uçtan uca denenince hesap oluşturma
-- "Profil oluşturulamadı" diye düşüyordu. Gerçek hata:
--     42501 — permission denied for table profiles
-- İlk şema `profiles` (ve 21 tablo daha) için service_role'e GRANT vermemiş.
-- Yani yönetici hesabı oluşturma akışı hiç çalışmıyormuş; hata mesajı da genel
-- olduğu için sebebi görünmüyordu.
--
-- NEDEN TOPTAN GRANT GÜVENLİ:
--   service_role Supabase'in sunucu anahtarıdır ve tanımı gereği RLS'i aşar.
--   Bu projede tarayıcıya ASLA verilmez (SUPABASE_SERVICE_ROLE_KEY yalnız
--   sunucu tarafında okunur — proje güvenlik kuralı). Yani buradaki grant yeni
--   bir yüzey açmaz; zaten öyle olması beklenen durumu düzeltir.
--   `authenticated` yetkileri BİLEREK genişletilmez: normal uygulama okuma ve
--   yazmaları RLS ile korunmaya devam eder.
--
-- İleride eklenecek tablolar için varsayılan yetki de tanımlanır, aynı hata
-- tekrar etmesin.
-- ---------------------------------------------------------------------------

grant usage on schema public to service_role;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Bundan sonra oluşturulan nesneler için de aynısı.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;
alter default privileges in schema public
  grant execute on functions to service_role;
