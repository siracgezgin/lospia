-- İş birliği yapan kişi — "sorumlu"nun yanındaki ikinci kişi.
--
-- Aslı Hanım (2026-08-19 toplantısı):
--   "Bu arada bizim bir takvim, bir de kişi şeyi… sorumlu kişi yapıyorsun.
--    Sorumlu kişinin iş birliğini koyacaksın. Çünkü yanında iş birliği yapması
--    gereken biri oluyor ya genelde."
--
-- participant_ids = SORUMLU(lar); collaborator_ids = yanında çalışan kişi(ler).
-- İkisi ayrı tutulur: sorumluluk (puan/tamamlama) yalnız sorumluya aittir,
-- iş birliği yapan kişi işi görür ve bildirim alır ama sahibi değildir.
--
-- İdempotent: kolonlar yalnız yoksa eklenir; tekrar çalıştırmak güvenlidir.

alter table public.planning_topics
  add column if not exists collaborator_ids uuid[] not null default '{}';

alter table public.planning_meetings
  add column if not exists collaborator_ids uuid[] not null default '{}';

alter table public.planning_open_items
  add column if not exists collaborator_user_id uuid references public.profiles(id) on delete set null;

comment on column public.planning_topics.collaborator_ids is
  'İş birliği yapan kişiler (sorumlu değil). Aslı Hanım, 2026-08-19.';
comment on column public.planning_meetings.collaborator_ids is
  'Toplantıda iş birliği yapan kişiler (katılımcı ≠ sorumlu).';
comment on column public.planning_open_items.collaborator_user_id is
  'Bu açık konuda sahibiyle birlikte çalışan kişi.';

-- Var olan tablolara kolon eklendiği için yeni GRANT gerekmez (tablo grant'leri
-- kolon bazlı değil); yine de idempotent olsun diye açıkça yineleniyor.
grant select, insert, update, delete on public.planning_topics      to authenticated;
grant select, insert, update, delete on public.planning_meetings    to authenticated;
grant select, insert, update, delete on public.planning_open_items  to authenticated;
grant all on public.planning_topics      to service_role;
grant all on public.planning_meetings    to service_role;
grant all on public.planning_open_items  to service_role;
