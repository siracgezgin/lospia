-- ---------------------------------------------------------------------------
-- TOPLANTI SONUCU + DIŞ KATILIMCI  (Aslı Hanım, 2026-09-07)
--
-- 1) SONUÇ — takvim artık "ne oldu"yu da söylüyor:
--      "Bu toplantının yapılıp bittiğini üzerinden şey yapabiliyor muyuz?…
--       Tamamlandığında şu yanındaki yeşil şey çıksın… Bu yeşili biraz daha
--       büyük yapabilirsin. Hani böyle BAŞARDIK gibi bir yeşil olsun."
--      "Eğer bu yeşil olmazsa, diyelim ki bir aksama oldu — toplantı KIRMIZI
--       ÇARPI olsun, ki bir sonraki toplantıya eklenmesi gerektiğini anlayalım."
--
--    'planned' = henüz işaretlenmedi · 'done' = büyük yeşil tik
--    'missed'  = kırmızı çarpı (bir sonraki güne taşınması gerekiyor)
--
-- 2) DIŞ KATILIMCI — Sabri Bey (üretici) ve Meral Hanım (kalıpçı) ekip üyesi
--    değil, panelde yerleri yoktu:
--      "Sabri Bey'i nasıl ekleyeceğim ben? Yani burada ekip içi var."
--      "Toplantı mailini sen buraya, şuraya bir artı koysan, bir e-mail hesabı
--       girdirsen artıyla."
--    `external_emails` = toplantıya çağrılan ekip DIŞI e-posta adresleri.
--
-- Her iki kolon da EK: mevcut satırlar varsayılanla akar, takvim aynen açılır.
-- ---------------------------------------------------------------------------

alter table public.planning_meetings
  add column if not exists status text not null default 'planned';

alter table public.planning_meetings
  add column if not exists external_emails text[] not null default '{}'::text[];

-- Sonucun kim/ne zaman işaretlediği — "dönüp hangi tarihte ne yaptık" arşivi.
alter table public.planning_meetings
  add column if not exists status_at timestamptz;

alter table public.planning_meetings
  add column if not exists status_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'planning_meetings_status_check'
  ) then
    alter table public.planning_meetings
      add constraint planning_meetings_status_check
      check (status in ('planned', 'done', 'missed'));
  end if;
end $$;

comment on column public.planning_meetings.status is
  'planned | done (büyük yeşil tik) | missed (kırmızı çarpı — sonraki güne taşınmalı).';
comment on column public.planning_meetings.external_emails is
  'Ekip dışı katılımcıların e-postaları (Sabri Bey, Meral Hanım gibi).';

create index if not exists planning_meetings_status_idx
  on public.planning_meetings (workspace_id, status);
