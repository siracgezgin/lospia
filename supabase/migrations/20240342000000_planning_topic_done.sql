-- ---------------------------------------------------------------------------
-- KONU TAMAMLANDI  (Sıraç, 2026-09-08)
--
--   "Tamamlanması gereken KONU olması lazım, konu başlığı değil. Ve bence
--    üzerini çizip yeşil yapalım, tıpkı Pano mantığındaki 'tamamlandı' gibi."
--
-- Toplantının kendi sonucu (20240338: status done/missed) AF'nin isteğiydi ve
-- duruyor — "bu toplantı yapıldı mı" ayrı bir soru. Ama işin BİTİP BİTMEDİĞİ
-- konunun kendisine ait: bir toplantıda üç konu konuşulur, biri biter ikisi
-- kalır. Başlığın üstünü çizmek o ayrımı siliyordu.
--
-- `done_at` NULL = duruyor. Zaman damgası tutuluyor çünkü "ne zaman bitti"
-- ileride raporlanabilir; boolean'da o bilgi yok.
-- ---------------------------------------------------------------------------

alter table public.planning_topics
  add column if not exists done_at timestamptz;

alter table public.planning_topics
  add column if not exists done_by uuid references auth.users(id) on delete set null;

comment on column public.planning_topics.done_at is
  'Konu tamamlandığında damgalanır. NULL = duruyor. Izgarada yeşil + üstü çizili.';

create index if not exists planning_topics_done_idx
  on public.planning_topics (workspace_id, done_at);
