-- ============================================================================
-- Planlama Modülü — Haftalık Toplantı Takvimi
-- ----------------------------------------------------------------------------
-- Aslı Hanım'ın Excel çalışma takvimini panoya taşır. İki tablo:
--   * planning_meetings  — ızgaradaki renkli "toplantı kutusu" (gün + saat + kategori)
--   * planning_topics    — bir toplantının altındaki "Konu" (max 5); her Konu bir
--                          GÖREVE bağlanır (task_id) → mevcut task-assigned maili +
--                          board/list görünürlüğü + deadline aynı altyapıdan gelir.
--
-- İzin modeli: office-center pattern (production_sheets ile aynı). Tüm üyeler
-- okur/yazar; silme admin veya oluşturana açık. is_workspace_member /
-- is_workspace_admin yardımcıları 20240207_office_center_foundation'dan gelir.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. planning_meetings — ızgaradaki renkli kutu
-- ---------------------------------------------------------------------------
create table public.planning_meetings (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  meeting_date    date not null,                       -- o haftanın günü (sütun)
  time_slot       text not null default '09:00',       -- saat bloğu (satır), "HH:MM"
  category        text not null default 'uretim'
    check (category in (
      'uretim','ai','sales','marketing','finance','external','system','other'
    )),
  title           text,                                -- "Ready to Wear" / "Lookbook"
  content         text,                                -- açıklama satırı
  participant_ids uuid[] not null default '{}',        -- "Kim" (katılımcılar)
  position        int  not null default 0,             -- aynı gün+saatte sıralama
  created_by      uuid references public.profiles(id) on delete set null,
  updated_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger set_planning_meetings_updated_at
  before update on public.planning_meetings
  for each row execute function set_updated_at();

create index planning_meetings_workspace_date_idx
  on public.planning_meetings(workspace_id, meeting_date);
create index planning_meetings_workspace_cat_idx
  on public.planning_meetings(workspace_id, category);

-- ---------------------------------------------------------------------------
-- 2. planning_topics — toplantı altındaki "Konu" (max 5); Konu = gerçek görev
-- ---------------------------------------------------------------------------
create table public.planning_topics (
  id           uuid primary key default gen_random_uuid(),
  meeting_id   uuid not null references public.planning_meetings(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade, -- RLS için denormalize
  position     int  not null default 0,               -- 1..5 (yumuşak sınır: action'da)
  text         text,                                   -- konu metni (task yoksa da yaşar)
  task_id      uuid references public.tasks(id) on delete set null, -- Konu = görev
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger set_planning_topics_updated_at
  before update on public.planning_topics
  for each row execute function set_updated_at();

create index planning_topics_meeting_idx on public.planning_topics(meeting_id, position);
create index planning_topics_task_idx    on public.planning_topics(task_id);

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
alter table public.planning_meetings enable row level security;
alter table public.planning_topics   enable row level security;

-- planning_meetings
create policy "planning_meetings: members read all"
  on public.planning_meetings for select
  using (is_workspace_member(workspace_id));
create policy "planning_meetings: members insert"
  on public.planning_meetings for insert
  with check (
    is_workspace_member(workspace_id)
    and (created_by is null or created_by = auth.uid())
  );
create policy "planning_meetings: members update"
  on public.planning_meetings for update
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));
create policy "planning_meetings: admin or author delete"
  on public.planning_meetings for delete
  using (
    is_workspace_admin(workspace_id)
    or (is_workspace_member(workspace_id) and created_by = auth.uid())
  );

-- planning_topics
create policy "planning_topics: members read all"
  on public.planning_topics for select
  using (is_workspace_member(workspace_id));
create policy "planning_topics: members insert"
  on public.planning_topics for insert
  with check (
    is_workspace_member(workspace_id)
    and (created_by is null or created_by = auth.uid())
  );
create policy "planning_topics: members update"
  on public.planning_topics for update
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));
create policy "planning_topics: admin or author delete"
  on public.planning_topics for delete
  using (
    is_workspace_admin(workspace_id)
    or (is_workspace_member(workspace_id) and created_by = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 4. Grants — migration up default privileges DML grant vermez (production_sheets
--    kök nedeni); service_role + authenticated'a açıkça veriyoruz. RLS asıl kapı.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.planning_meetings to authenticated, service_role;
grant select, insert, update, delete on public.planning_topics   to authenticated, service_role;
