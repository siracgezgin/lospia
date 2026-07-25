-- Planlama: konulara da yapısal katılımcı (sistemdeki üyeler). "Kim" artık elle
-- metin değil, üye seçimi → ekranda isim-soyisim baş harfleri gösterilir.
-- planning_meetings.participant_ids zaten var (20240216).
alter table public.planning_topics
  add column if not exists participant_ids uuid[] not null default '{}';
