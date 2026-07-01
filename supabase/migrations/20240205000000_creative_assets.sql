-- =============================================================================
-- Lospia Operasyon Merkezi — Phase 1
-- Kreatif Linkler (creative_assets): link/reference registry.
-- =============================================================================
-- This is a LINK registry, not a file store. No Supabase Storage, no uploads —
-- only URLs pointing at Canva / Drive / Figma / etc. plus a light status +
-- approval flow. New, isolated table; additive; safe on production.
-- =============================================================================

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

create trigger set_creative_assets_updated_at
  before update on public.creative_assets
  for each row execute function set_updated_at();

create index if not exists creative_assets_workspace_idx
  on public.creative_assets(workspace_id, created_at desc);
create index if not exists creative_assets_department_idx
  on public.creative_assets(workspace_id, department_id);
create index if not exists creative_assets_status_idx
  on public.creative_assets(workspace_id, status);

alter table public.creative_assets enable row level security;

-- Everyone in the workspace can view links (viewer-friendly registry).
create policy "creative_assets: members can select"
  on public.creative_assets for select
  using (is_workspace_member(workspace_id));

-- Any member of the workspace can add a link (created_by must be self).
create policy "creative_assets: members can insert"
  on public.creative_assets for insert
  with check (
    is_workspace_member(workspace_id)
    and (created_by is null or created_by = auth.uid())
  );

-- Admins may edit any link; a member may edit only links they created.
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

-- Admins may delete any link; a member may delete only links they created.
-- (The UI prefers archive over delete; hard delete stays admin/author-only.)
create policy "creative_assets: admins or author can delete"
  on public.creative_assets for delete
  using (
    is_workspace_admin(workspace_id)
    or (is_workspace_member(workspace_id) and created_by = auth.uid())
  );
