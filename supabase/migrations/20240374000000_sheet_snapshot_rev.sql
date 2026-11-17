-- ---------------------------------------------------------------------------
-- TABLO KAYDI — sürüm sayacı (17.11.2026 denetimi)
--
-- Aynı tablo iki sekmede (ya da iki kişide) açıkken geç kaydeden, ötekinin
-- yazdığını SESSİZCE eziyordu: kayıt, anlık görüntünün tamamını koşulsuz
-- yazıyor. `snapshot_rev` her kayıtta bir artar; kayıt "ben şu sürümün
-- üstüne yazıyorum" der, sürüm değişmişse reddedilir ve kullanıcıya sorulur.
--
-- `updated_at` bu iş için KULLANILAMAZ: ad değiştirme ve künye formu da onu
-- oynatıyor, kullanıcı kendi kendisiyle çakışırdı.
--
-- Kod bu kolon olmadan da çalışır (eski davranışa düşer). Yalnız ekleme.
-- ---------------------------------------------------------------------------
alter table public.operation_spreadsheets
  add column if not exists snapshot_rev integer not null default 0;
