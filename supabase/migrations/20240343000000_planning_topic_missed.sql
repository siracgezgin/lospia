-- ---------------------------------------------------------------------------
-- KONU AKSADI  (Sıraç, 2026-09-10)
--
--   "Aksayan da tamamlanan da konu başlığı değil KONULAR olmalı."
--   "Şu pop-up'ta 'Aksadı' TÜM KONUYU kapsıyor."
--
-- 20240342 ile konuya `done_at` gelmişti; "aksadı" ise hâlâ toplantı
-- düzeyindeydi (planning_meetings.status = 'missed'). İki durum aynı şeyin iki
-- yüzü olduğu hâlde farklı katmanlarda duruyordu: bir konuyu bitirebiliyor ama
-- tek bir konunun aksadığını söyleyemiyordunuz — "Aksadı" toplantının tamamını
-- işaretliyordu.
--
-- Artık konu üç durumda olur:
--   done_at   dolu → tamamlandı  (yeşil, üstü çizili)
--   missed_at dolu → aksadı      (kırmızı; sonraki güne taşınabilir)
--   ikisi de boş  → duruyor
--
-- İkisi AYNI ANDA dolamaz: kısıt bunu zorlar, yoksa "hem bitti hem aksadı"
-- gibi okunamayan bir satır oluşurdu.
--
-- planning_meetings.status KOLONU DURUYOR (veri kaybı olmasın) ama arayüzde
-- kullanılmıyor; toplantının rengi artık konularından türetiliyor.
-- ---------------------------------------------------------------------------

alter table public.planning_topics
  add column if not exists missed_at timestamptz;

alter table public.planning_topics
  add column if not exists missed_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'planning_topics_outcome_check'
  ) then
    alter table public.planning_topics
      add constraint planning_topics_outcome_check
      check (done_at is null or missed_at is null);
  end if;
end $$;

comment on column public.planning_topics.missed_at is
  'Konu aksadı damgası. done_at ile aynı anda dolu olamaz. Sonraki güne taşınabilir.';

create index if not exists planning_topics_missed_idx
  on public.planning_topics (workspace_id, missed_at);
