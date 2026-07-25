-- Planlama: konuya teslim tarihi (deadline). Konu göreve dönüştürülürken
-- oluşan görevin due_date'ini besler; ekranda da gösterilir.
alter table public.planning_topics add column if not exists due_date date;
