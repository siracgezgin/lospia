-- ---------------------------------------------------------------------------
-- Dosya ve yazılar da BÖLÜM bilir — AF Teamwork / Kütüphane.
--
-- 20240324 klasörlere `section` verdi ama dosya ve yazılara vermedi. Sonuç:
-- Kütüphane'nin KÖKÜNE (klasör açmadan) bir yazı açıldığında ya da dosya
-- yüklendiğinde kayıt `folder_id = null` oluyor ve Kütüphane sayfası onu
-- süzüp ATIYORDU (yalnız library klasörlerindekileri gösteriyor); aynı kayıt
-- AF Teamwork'te belirip iki ekranı tutarsız hâle getiriyordu.
--
-- Bu kolon o boşluğu kapatır: kayıt hangi bölümde açıldıysa orada yaşar,
-- klasörsüz olsa bile.
--
-- Varsayılan 'teamwork': bugüne kadarki her kayıt AF Teamwork'te açıldı,
-- migration hiçbir şeyi taşımaz.
-- ---------------------------------------------------------------------------

alter table public.operation_documents
  add column if not exists section text not null default 'teamwork';

alter table public.operation_documents
  drop constraint if exists operation_documents_section_check;
alter table public.operation_documents
  add constraint operation_documents_section_check
  check (section in ('teamwork', 'library'));

comment on column public.operation_documents.section is
  'Kaydın yaşadığı bölüm: teamwork (AF Teamwork) | library (Kütüphane). Klasörsüz kayıtlar için de geçerli.';

create index if not exists operation_documents_section_idx
  on public.operation_documents (workspace_id, section);

grant select, insert, update, delete on public.operation_documents to authenticated;
grant all on public.operation_documents to service_role;
