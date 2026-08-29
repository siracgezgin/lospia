-- ---------------------------------------------------------------------------
-- Tablolar da KLASÖRDE yaşar — AF Teamwork gerçek bir Drive olsun.
--
-- Sıraç (2026-08-29): "Mantık Drive'daki gibi olsun. Klasör oluşturalım,
-- klasörün içinde Excel de Word de oluşturulabilsin. Resim, MD, TXT gibi
-- vs eklenebilir; ona göre tasarlansın her şey."
--
-- Bugüne kadar AF Teamwork'ün kökünde "Sheets" diye bir KART duruyordu ve
-- tıklayınca apayrı bir modüle (/sheets) gidiyordu; aynı ızgarada bir kart
-- klasör açıyor, biri modül değiştiriyor, biri yazı editörü açıyordu. Ortak
-- bir zihin modeli yoktu.
--
-- Bu kolonlarla tablo da diğer içerikler gibi bir klasörün içinde durur;
-- `folder_id = null` = kök. `section` ayrımı dosya/yazılarla aynı (20240327):
-- AF Teamwork mü Kütüphane mi.
-- ---------------------------------------------------------------------------

alter table public.operation_spreadsheets
  add column if not exists folder_id uuid references public.document_folders(id) on delete set null;

alter table public.operation_spreadsheets
  add column if not exists section text not null default 'teamwork';

alter table public.operation_spreadsheets
  drop constraint if exists operation_spreadsheets_section_check;
alter table public.operation_spreadsheets
  add constraint operation_spreadsheets_section_check
  check (section in ('teamwork', 'library'));

comment on column public.operation_spreadsheets.folder_id is
  'Tablonun bulunduğu klasör (document_folders). NULL = AF Teamwork kökü.';
comment on column public.operation_spreadsheets.section is
  'Kaydın yaşadığı bölüm: teamwork (AF Teamwork) | library (Kütüphane).';

create index if not exists operation_spreadsheets_folder_idx
  on public.operation_spreadsheets (workspace_id, section, folder_id);

grant select, insert, update, delete on public.operation_spreadsheets to authenticated;
grant all on public.operation_spreadsheets to service_role;
