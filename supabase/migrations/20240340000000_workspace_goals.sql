-- ---------------------------------------------------------------------------
-- AYLIK KİŞİ HEDEFLERİ  (Aslı Hanım, 2026-09-07 sesli mesaj)
--
--   "Yani şunu aslında oturtmak lazım. Önümüzdeki bir ay içindeki hedef, HER
--    İNSANIN o bir ay içindeki hedefi, İKİNCİ AYDAKİ hedefi, ÜÇÜNCÜ AYDAKİ
--    hedefi."
--   "Oraya onu ben yazdığım zaman HER GÜN HERKESİN SAATİ DE ÇIKACAK.
--    SORUMLULUĞU DA ÇIKACAK. BEN ARAYA İŞ SOKMAYACAĞIM. İŞ YÜRÜYECEK."
--   "Bizim o aylık takvimi oluşturursak onlar da zaman yönetimini anlayacaklar."
--
-- NEDEN TAKVİME EKLENMEDİ: `planning_meetings` "hangi GÜN hangi toplantı"yı
-- tutar (gün + saat + konu). Buradaki soru başka: "hangi KİŞİ, hangi AY, ne
-- hedefliyor". Aynı tabloya sıkıştırmak takvimi hem gün hem ay ölçeğinde iki
-- anlama gelen bir şeye çevirirdi.
--
-- `period_month` AYIN İLK GÜNÜdür (2026-09-01). Tarih tipi tutuluyor ki ay
-- karşılaştırması ve sıralama saat dilimi taşımasın; kısıt bunu zorlar.
--
-- İZİN: herkes okur (ekip birbirinin hedefini görsün — "onlar da zaman
-- yönetimini anlayacaklar"), yönetici herkesinkini yazar, üye KENDİ hedefini
-- yazar. Sonuncusu AF'nin Sıraç'tan istediği şeyin karşılığı: "Bana şunu
-- hazırla — önündeki bir ay, iki ay, üç ay boyunca senin elindeki işleri."
-- ---------------------------------------------------------------------------

create table if not exists public.workspace_goals (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- Hedefin SAHİBİ. Kişi silinirse hedefleri de gider.
  member_id    uuid not null references public.profiles(id) on delete cascade,
  -- Ayın ilk günü. "1. ay / 2. ay / 3. ay" bunun üzerinden hesaplanır.
  period_month date not null check (date_trunc('month', period_month)::date = period_month),
  title        text not null check (char_length(title) between 1 and 300),
  detail       text,
  -- open  = duruyor · done = tamamlandı · dropped = vazgeçildi
  -- Aksayan hedef "kayıp" olmaz: sonraki aya TAŞINIR (period_month değişir),
  -- böylece kişinin önündeki üç ay her zaman GÜNCEL olanı gösterir.
  status       text not null default 'open' check (status in ('open','done','dropped')),
  position     int  not null default 0,
  created_by   uuid references public.profiles(id) on delete set null,
  updated_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists workspace_goals_lookup_idx
  on public.workspace_goals (workspace_id, period_month, member_id, position);
create index if not exists workspace_goals_member_idx
  on public.workspace_goals (workspace_id, member_id, period_month);

comment on table public.workspace_goals is
  'Kişi × ay hedefleri. AF: "her insanın 1./2./3. aydaki hedefi" — takvim gün, bu ay ölçeğidir.';
comment on column public.workspace_goals.period_month is
  'Ayın İLK GÜNÜ (2026-09-01). Kısıt bunu zorlar.';

drop trigger if exists set_workspace_goals_updated_at on public.workspace_goals;
create trigger set_workspace_goals_updated_at
  before update on public.workspace_goals
  for each row execute function set_updated_at();

-- ── RLS — herkes okur; yönetici herkesinkini, üye KENDİ hedefini yazar ──────
alter table public.workspace_goals enable row level security;

drop policy if exists "goals: member read" on public.workspace_goals;
create policy "goals: member read"
  on public.workspace_goals for select
  using (is_workspace_member(workspace_id));

drop policy if exists "goals: write own or admin" on public.workspace_goals;
create policy "goals: write own or admin"
  on public.workspace_goals for insert
  with check (
    is_workspace_member(workspace_id)
    and (is_workspace_admin(workspace_id) or member_id = auth.uid())
  );

drop policy if exists "goals: update own or admin" on public.workspace_goals;
create policy "goals: update own or admin"
  on public.workspace_goals for update
  using (
    is_workspace_member(workspace_id)
    and (is_workspace_admin(workspace_id) or member_id = auth.uid())
  )
  with check (
    is_workspace_member(workspace_id)
    and (is_workspace_admin(workspace_id) or member_id = auth.uid())
  );

drop policy if exists "goals: delete own or admin" on public.workspace_goals;
create policy "goals: delete own or admin"
  on public.workspace_goals for delete
  using (
    is_workspace_member(workspace_id)
    and (is_workspace_admin(workspace_id) or member_id = auth.uid())
  );

grant select, insert, update, delete on public.workspace_goals to authenticated;
grant all on public.workspace_goals to service_role;
