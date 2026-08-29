-- ---------------------------------------------------------------------------
-- ÇALIŞMA ALANI GÜNLÜĞÜ — göreve bağlı OLMAYAN olaylar.
--
-- Sıraç (2026-08-29): "Bir şeyi indirmeden önce de pop-up çıksın. Ve bu
-- indirme, silme kısımları da loglarda çıksın."
--
-- `task_activity_logs.task_id` NOT NULL: o tablo yalnız bir GÖREVİN geçmişini
-- tutabiliyor. Föy indirmek, kategori silmek, klasör silmek gibi olayların
-- yazılacağı yer yoktu — hiç kaydedilmiyorlardı.
--
-- Burası KİM, NEYİ, NE ZAMAN sorusunun görev dışı karşılığı. Silinen kaydın
-- kendisi gittiği için ADI (entity_label) satırda saklanır; yoksa günlük
-- "bir şey silindi" demekten ibaret kalırdı.
-- ---------------------------------------------------------------------------

create table if not exists public.workspace_activity_logs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id     uuid references auth.users(id) on delete set null,
  -- 'sheet_downloaded' | 'sheet_deleted' | 'category_deleted' …
  action       text not null,
  -- 'production_sheet' | 'category' | 'document' | 'folder' | 'contact' …
  entity_type  text not null,
  entity_id    text,
  -- Silinen şeyin ADI — kayıt gittikten sonra tek okunur iz budur.
  entity_label text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists workspace_activity_logs_feed_idx
  on public.workspace_activity_logs (workspace_id, created_at desc);

alter table public.workspace_activity_logs enable row level security;

-- Okuma: YALNIZ yönetici — günlük bir denetim yüzeyidir.
drop policy if exists wal_select on public.workspace_activity_logs;
create policy wal_select on public.workspace_activity_logs
  for select using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = workspace_activity_logs.workspace_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- Yazma: çalışma alanının HER üyesi kendi adına satır ekleyebilir. Üye bir
-- föy indirdiğinde de iz kalmalı; yoksa günlük yalnız yöneticileri kaydeder.
drop policy if exists wal_insert on public.workspace_activity_logs;
create policy wal_insert on public.workspace_activity_logs
  for insert with check (
    actor_id = auth.uid()
    and exists (
      select 1 from public.workspace_members m
      where m.workspace_id = workspace_activity_logs.workspace_id
        and m.user_id = auth.uid()
    )
  );

-- Güncelleme/silme YOK: günlük değiştirilemez.

grant select, insert on public.workspace_activity_logs to authenticated;
grant all on public.workspace_activity_logs to service_role;
