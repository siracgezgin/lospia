-- FİHRİST = SOURCING (Aslı Hanım sesli notu, 23.09.2026).
--
-- > "Operasyon dosyasında bir sourcing bölümü istiyoruz. Kumaş sourcing,
-- >  aksesuar sourcing, nakışçı, kalıpçı — fihrist dediğimiz yer. Selen Hanım'ın
-- >  sourcing dosyasına girip bilgi seçmesi lazım… girdiği zaman Emin Bey
-- >  telefonu, adı, hangi kumaşları olduğunun fotoğrafları. Sonra Kadir Bey,
-- >  onun dosyası, onun kartelaları. Firma adı, telefonu, bilgisi."
--
-- Fihrist 20240353'te üretici/kalıpçı/nakışçı ile açılmıştı; eksik olan iki şey:
--
--   1. KUMAŞÇI ve AKSESUARCI rolleri. Sourcing'in yarısı onlar; ayrı bir tablo
--      açmak aynı alanları (ad, telefon, adres, e-posta, not) ikinci kez
--      tanımlamak olurdu. Aslı Hanım da ikisini tek yer olarak tarif ediyor.
--   2. KARTELA ALBÜMÜ. Tek `photo_url` vardı — bir firmanın kartelası tek kare
--      değil; "hangi kumaşları olduğunun fotoğrafları" çoğul. Kumaş seçimi bu
--      fotoğraflara bakılarak yapılıyor, yani albüm işin kendisi.
--
-- Satır şekli: [{ url, path, caption? }] — `path` silme için (Storage yolu).
-- Mevcut `photo_url` SİLİNMEDİ: dolu kayıtlar değerini koruyor, albümün ilk
-- karesi yoksa o gösterilir.

alter table public.workspace_manufacturers
  add column if not exists photos jsonb not null default '[]'::jsonb;

comment on column public.workspace_manufacturers.photos is
  'Kartela / kumaş fotoğrafları: [{url, path, caption}]. Firma seçimi bunlara bakılarak yapılır (Aslı Hanım, 23.09.2026).';

-- Rol listesi genişliyor. Kısıt adı sürüme göre değişebildiği için önce
-- sütunun üzerindeki check'ler taranıp düşürülüyor, sonra yenisi ekleniyor.
do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where ns.nspname = 'public'
       and rel.relname = 'workspace_manufacturers'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%role%'
  loop
    execute format('alter table public.workspace_manufacturers drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.workspace_manufacturers
  add constraint workspace_manufacturers_role_check
  check (role in ('uretici','kalipci','nakisci','kumasci','aksesuarci','diger'));

comment on column public.workspace_manufacturers.role is
  'Fihristteki rolü: üretici / kalıpçı / nakışçı / kumaşçı / aksesuarcı. Föydeki seçiciler ve Sourcing bu rollere göre süzer.';
