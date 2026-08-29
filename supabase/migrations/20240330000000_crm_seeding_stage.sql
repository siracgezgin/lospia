-- ---------------------------------------------------------------------------
-- INFLUENCER SEEDING ADIMI — CRM kaydında "hangi aşamadayız?"
--
-- Aslı Hanım (2026-08-28 toplantısı) influencer sürecini yedi adım olarak
-- dikte etti: ilk iletişim → styling → yazılı iletişim → kargo → teslim →
-- paylaşım → rapor. Bugüne kadar bu süreç yalnız insanların aklındaydı;
-- "Raşay'a kargo gitti mi, Sofia'ya mail atıldı mı" sorusu kimseye
-- sorulmadan cevaplanamıyordu.
--
-- Adımlar `lib/crm/seeding.ts` içinde tanımlı (etiket + hatırlatma notu);
-- burada yalnız KİŞİNİN NEREDE OLDUĞU tutulur.
--
-- NULL = süreç başlamadı (ya da bu kişi bir influencer değil). Alan
-- segmentten bağımsız: bir müşteri de seeding sürecine girebilir.
-- ---------------------------------------------------------------------------

alter table public.workspace_contacts
  add column if not exists seeding_stage text;

alter table public.workspace_contacts
  drop constraint if exists workspace_contacts_seeding_stage_check;
alter table public.workspace_contacts
  add constraint workspace_contacts_seeding_stage_check
  check (
    seeding_stage is null
    or seeding_stage in ('iletisim','styling','yazili','kargo','teslim','paylasim','rapor')
  );

comment on column public.workspace_contacts.seeding_stage is
  'Influencer seeding adımı (lib/crm/seeding.ts). NULL = süreç başlamadı.';

create index if not exists workspace_contacts_seeding_idx
  on public.workspace_contacts (workspace_id, seeding_stage)
  where seeding_stage is not null;

grant select, insert, update, delete on public.workspace_contacts to authenticated;
grant all on public.workspace_contacts to service_role;
