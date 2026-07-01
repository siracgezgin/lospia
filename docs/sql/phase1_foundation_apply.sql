-- =============================================================================
-- Lospia / AF Operasyon — Phase 1 foundation (COMBINED apply script)
-- =============================================================================
-- DOKÜMANTASYON AMAÇLIDIR. Otomatik çalıştırılmaz.
--
-- Bu dosya şu üç migration'ın birebir birleşimidir:
--   1) 20240204000000_crm_contact_fields.sql
--   2) 20240205000000_creative_assets.sql
--   3) 20240206000000_contact_user_link.sql
--
-- Production Supabase → SQL Editor → New query içine bu dosyanın TAMAMINI
-- yapıştırıp tek seferde çalıştırabilirsiniz. Tümü additive'dir:
--   - drop / delete / rename YOK
--   - "if not exists" ile idempotent (tekrar çalıştırmak güvenli)
--   - supabase db reset YOK
--
-- En sondaki `notify pgrst, 'reload schema';` PostgREST schema cache'ini
-- yeniler — bu adım atlanmamalıdır.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1) CRM v0 — workspace_contacts additive kolonlar
--    (20240204000000_crm_contact_fields.sql)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.workspace_contacts
  add column if not exists organization     text,
  add column if not exists segment          text,
  add column if not exists phone            text,
  add column if not exists source_channel   text,
  add column if not exists notes            text,
  add column if not exists last_contact_at  date,
  add column if not exists next_follow_up_at date,
  add column if not exists owner_id         uuid references public.profiles(id) on delete set null,
  add column if not exists crm_status       text,
  add column if not exists metadata         jsonb not null default '{}'::jsonb;

create index if not exists workspace_contacts_next_follow_up_idx
  on public.workspace_contacts(workspace_id, next_follow_up_at);

create index if not exists workspace_contacts_segment_idx
  on public.workspace_contacts(workspace_id, segment);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Kreatif Linkler — creative_assets tablosu + RLS
--    (20240205000000_creative_assets.sql)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.creative_assets (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  title              text not null check (char_length(title) between 1 and 300),
  url                text not null check (char_length(url) between 1 and 2000),
  provider           text not null default 'other'
    check (provider in ('canva','google_drive','dropbox','figma','website','other')),
  department_id      uuid references public.workspace_departments(id) on delete set null,
  related_task_id    uuid references public.tasks(id) on delete set null,
  related_contact_id uuid references public.workspace_contacts(id) on delete set null,
  status             text not null default 'draft'
    check (status in ('draft','in_review','approved','archived')),
  notes              text,
  created_by         uuid references public.profiles(id) on delete set null,
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- set_updated_at() önceki migrationlarda tanımlıdır. Trigger'ı yalnızca yoksa ekle.
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'set_creative_assets_updated_at'
  ) then
    create trigger set_creative_assets_updated_at
      before update on public.creative_assets
      for each row execute function set_updated_at();
  end if;
end$$;

create index if not exists creative_assets_workspace_idx
  on public.creative_assets(workspace_id, created_at desc);
create index if not exists creative_assets_department_idx
  on public.creative_assets(workspace_id, department_id);
create index if not exists creative_assets_status_idx
  on public.creative_assets(workspace_id, status);

alter table public.creative_assets enable row level security;

-- Policy'ler idempotent olsun diye önce düşür (yoksa hata vermez), sonra oluştur.
drop policy if exists "creative_assets: members can select" on public.creative_assets;
create policy "creative_assets: members can select"
  on public.creative_assets for select
  using (is_workspace_member(workspace_id));

drop policy if exists "creative_assets: members can insert" on public.creative_assets;
create policy "creative_assets: members can insert"
  on public.creative_assets for insert
  with check (
    is_workspace_member(workspace_id)
    and (created_by is null or created_by = auth.uid())
  );

drop policy if exists "creative_assets: admins or author can update" on public.creative_assets;
create policy "creative_assets: admins or author can update"
  on public.creative_assets for update
  using (
    is_workspace_admin(workspace_id)
    or (is_workspace_member(workspace_id) and created_by = auth.uid())
  )
  with check (
    is_workspace_admin(workspace_id)
    or (is_workspace_member(workspace_id) and created_by = auth.uid())
  );

drop policy if exists "creative_assets: admins or author can delete" on public.creative_assets;
create policy "creative_assets: admins or author can delete"
  on public.creative_assets for delete
  using (
    is_workspace_admin(workspace_id)
    or (is_workspace_member(workspace_id) and created_by = auth.uid())
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Contact ↔ User link — workspace_contacts.user_id
--    (20240206000000_contact_user_link.sql)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.workspace_contacts
  add column if not exists user_id uuid references public.profiles(id) on delete set null;

create index if not exists workspace_contacts_user_id_idx
  on public.workspace_contacts(user_id);

create unique index if not exists workspace_contacts_workspace_user_unique
  on public.workspace_contacts(workspace_id, user_id)
  where user_id is not null;


-- ─────────────────────────────────────────────────────────────────────────────
-- SON ADIM — PostgREST schema cache reload (ATLAMAYIN)
-- ─────────────────────────────────────────────────────────────────────────────

notify pgrst, 'reload schema';
