-- ---------------------------------------------------------------------------
-- Kişi ÜNVANI — kartın altındaki tek satır.
--
-- Aslı Hanım (2026-08-28), Pano'daki kişi kartlarına bakarken:
--   "Bana da tasarımcı yazarsan — ben yönetici olmak istemiyorum çünkü."
--
-- Kart bugüne kadar sistem ROLÜNÜ yazıyordu (Yönetici / Ekip). Rol bir izin
-- ayarıdır, kimlik değil: kurucu tasarımcı, sistemde owner olduğu için
-- ekranda "Yönetici" görünüyordu. Bu kolon ekranda ne yazacağını kişiye
-- bırakır. NULL → eski davranış (rolden türetilen etiket), yani migration veri
-- doldurmaz ve mevcut ekranlar bozulmaz.
--
-- Yazma yetkisi: workspace_members'ın MEVCUT politikaları geçerli — owner/admin
-- her satırı, üye kendi satırını güncelleyebilir. Yeni politika gerekmez.
-- ---------------------------------------------------------------------------

alter table public.workspace_members
  add column if not exists job_title text;

comment on column public.workspace_members.job_title is
  'Ekranda görünen ünvan (Tasarımcı, Üretim Sorumlusu…). NULL → rolden türetilir.';

grant select, insert, update, delete on public.workspace_members to authenticated;
grant all on public.workspace_members to service_role;
