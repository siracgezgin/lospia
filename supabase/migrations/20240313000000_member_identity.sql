-- ---------------------------------------------------------------------------
-- Kişi kimliği: renk + ikon — yöneticinin seçtiği, kalıcı.
--
-- Aslı Hanım (2026-08-19): "Herkesin bir rengi olsa da herkes kendi rengini
-- takip etse" ve "Herkese ikon koy. Sevdikleri ikonları da seçtirebilirsin."
--
-- Şimdiye kadar renk/ikon kişinin id'sinden TÜRETİLİYORDU. İki sorun çıktı:
--   1) Türetim benzer tonları yan yana getirebiliyordu (dört mor bir arada).
--   2) Kimse kendi rengini SEÇEMİYORDU.
-- Bu kolonlar seçimi kalıcı kılar. NULL = otomatik ata (eski davranış), yani
-- migration veri doldurmaz ve mevcut ekranlar bozulmaz.
--
-- Yazma yetkisi: workspace_members'ın MEVCUT politikaları geçerli — owner/admin
-- her satırı, üye kendi satırını güncelleyebilir. Yeni politika gerekmez.
-- ---------------------------------------------------------------------------

alter table public.workspace_members
  add column if not exists color_key text;

alter table public.workspace_members
  add column if not exists icon_key text;

comment on column public.workspace_members.color_key is
  'Kişi rengi (lib/design/person-colors.ts PERSON_TONES anahtarı). NULL → otomatik.';
comment on column public.workspace_members.icon_key is
  'Kişi ikonu (lib/design/person-colors.ts PERSON_ICONS anahtarı). NULL → otomatik.';

-- Aynı çalışma alanında iki kişi aynı rengi almasın. Kısmi indeks: NULL'lar
-- (otomatik atananlar) kapsam dışı — Postgres'te NULL ≠ NULL zaten, ama
-- niyeti açık yazmak sonraki okuyucuya yardım eder.
drop index if exists workspace_members_color_unique;
create unique index workspace_members_color_unique
  on public.workspace_members (workspace_id, color_key)
  where color_key is not null;

grant select, insert, update, delete on public.workspace_members to authenticated;
grant all on public.workspace_members to service_role;
