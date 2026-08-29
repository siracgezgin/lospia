-- ---------------------------------------------------------------------------
-- AF Teamwork ve Library — klasör ağacının iki bölümü.
--
-- Aslı Hanım (2026-08-28):
--   "Sen onun adını AF Teamwork diye çevir. Bizim teamwork bütün
--    çalışmalarımız burada olsun. Ama tabii hepsi dosyasının içinde olsun.
--    Marketing ayrı olsun, üretim ayrı olsun."
--   "Bu Teamwork değil. Bir tık Archive diyebilirsin… Orada dosyalarımız
--    durur. Lookbook durur, stratejik dosyalar durur, akademik makaleler
--    girer. Böylece herkes istediği bilgiyi business toplantısında veya
--    öncesinde buradan çekiyor olur."
--
-- Yani İKİ ayrı yer isteniyor: çalışılan dosyalar (Teamwork) ve başvurulan
-- dosyalar (Library — "Arşiv" adı mevcut /archive görev arşiviyle çakıştığı ve
-- "bitmiş/kaldırılmış" çağrıştırdığı için Kütüphane seçildi). İkisi de aynı
-- depolama üzerinde yaşar; ayıran tek şey bu kolon.
--
-- Varsayılan 'teamwork': mevcut klasörlerin hepsi bugünkü yerinde kalır,
-- migration hiçbir veriyi taşımaz.
-- ---------------------------------------------------------------------------

alter table public.document_folders
  add column if not exists section text not null default 'teamwork';

alter table public.document_folders
  drop constraint if exists document_folders_section_check;
alter table public.document_folders
  add constraint document_folders_section_check
  check (section in ('teamwork', 'library'));

comment on column public.document_folders.section is
  'Klasörün yaşadığı bölüm: teamwork (AF Teamwork) | library (Kütüphane).';

-- Bölüm bazlı listeleme her sayfa açılışında çalışır.
create index if not exists document_folders_section_idx
  on public.document_folders (workspace_id, section);

grant select, insert, update, delete on public.document_folders to authenticated;
grant all on public.document_folders to service_role;
