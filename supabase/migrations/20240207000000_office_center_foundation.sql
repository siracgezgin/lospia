-- =============================================================================
-- Lospia Office Center — Documents, Templates & Sheets Foundation
-- =============================================================================
-- Three new, isolated, additive tables (plus optional version tables):
--   * operation_documents      → Doküman Merkezi   (link/reference registry)
--   * document_templates       → Şablon Kütüphanesi (rich-text templates)
--   * operation_spreadsheets   → Tablo Merkezi      (JSON snapshot sheets)
--
-- No file storage — documents hold URLs/metadata only, sheets hold a JSONB
-- snapshot. Safe on production: no existing table is touched, everything is
-- idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS), RLS on from the start.
--
-- Permission model (server actions mirror this; RLS is the DB backstop):
--   admin/owner → sees & manages everything in the workspace
--   member      → sees non-draft records + own records; creates drafts;
--                 edits own records while they are not approved/locked/archived
--   viewer      → (workspace member) read-only via the same select policy
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Doküman Merkezi — operation_documents
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.operation_documents (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  title              text not null check (char_length(title) between 1 and 300),
  description        text,
  document_type      text not null default 'other'
    check (document_type in (
      'drive_link','google_doc','google_sheet','canva','figma','pdf_link',
      'word_link','excel_link','website','internal_note','other'
    )),
  url                text check (url is null or char_length(url) <= 2000),
  department_id      uuid references public.workspace_departments(id) on delete set null,
  related_task_id    uuid references public.tasks(id) on delete set null,
  related_contact_id uuid references public.workspace_contacts(id) on delete set null,
  status             text not null default 'draft'
    check (status in ('draft','in_review','approved','archived')),
  owner_id           uuid references public.profiles(id) on delete set null,
  tags               text[] not null default '{}',
  notes              text,
  metadata           jsonb not null default '{}'::jsonb,
  created_by         uuid references public.profiles(id) on delete set null,
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists set_operation_documents_updated_at on public.operation_documents;
create trigger set_operation_documents_updated_at
  before update on public.operation_documents
  for each row execute function set_updated_at();

create index if not exists operation_documents_workspace_idx
  on public.operation_documents(workspace_id, created_at desc);
create index if not exists operation_documents_status_idx
  on public.operation_documents(workspace_id, status);
create index if not exists operation_documents_department_idx
  on public.operation_documents(workspace_id, department_id);
create index if not exists operation_documents_task_idx
  on public.operation_documents(related_task_id);
create index if not exists operation_documents_contact_idx
  on public.operation_documents(related_contact_id);

alter table public.operation_documents enable row level security;

-- Admins see everything; members see non-draft records plus their own drafts.
drop policy if exists "operation_documents: visible to admins, authors and members" on public.operation_documents;
create policy "operation_documents: visible to admins, authors and members"
  on public.operation_documents for select
  using (
    is_workspace_admin(workspace_id)
    or (
      is_workspace_member(workspace_id)
      and (status <> 'draft' or created_by = auth.uid())
    )
  );

-- Members create their own records; non-admins can only create drafts.
drop policy if exists "operation_documents: members insert own drafts" on public.operation_documents;
create policy "operation_documents: members insert own drafts"
  on public.operation_documents for insert
  with check (
    is_workspace_member(workspace_id)
    and (created_by is null or created_by = auth.uid())
    and (is_workspace_admin(workspace_id) or status = 'draft')
  );

-- Admins edit anything; a member edits only their own record while it is not
-- yet approved/archived (draft → in_review submission is allowed).
drop policy if exists "operation_documents: admins or author can update" on public.operation_documents;
create policy "operation_documents: admins or author can update"
  on public.operation_documents for update
  using (
    is_workspace_admin(workspace_id)
    or (
      is_workspace_member(workspace_id)
      and created_by = auth.uid()
      and status in ('draft','in_review')
    )
  )
  with check (
    is_workspace_admin(workspace_id)
    or (
      is_workspace_member(workspace_id)
      and created_by = auth.uid()
      and status in ('draft','in_review')
    )
  );

-- Hard delete: admins anything; a member only their own draft (UI prefers archive).
drop policy if exists "operation_documents: admins or draft author can delete" on public.operation_documents;
create policy "operation_documents: admins or draft author can delete"
  on public.operation_documents for delete
  using (
    is_workspace_admin(workspace_id)
    or (
      is_workspace_member(workspace_id)
      and created_by = auth.uid()
      and status = 'draft'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Şablon Kütüphanesi — document_templates (+ versions)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.document_templates (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  title              text not null check (char_length(title) between 1 and 300),
  description        text,
  category           text not null default 'general'
    check (category in (
      'general','customer_email','whatsapp_message','producer_brief','order_form',
      'pr_influencer','sales','after_sales','internal_process','other'
    )),
  channel            text not null default 'general'
    check (channel in ('general','email','whatsapp','document','internal','other')),
  content_json       jsonb,
  content_html       text,
  plain_text         text,
  variables          text[] not null default '{}',
  department_id      uuid references public.workspace_departments(id) on delete set null,
  related_task_id    uuid references public.tasks(id) on delete set null,
  related_contact_id uuid references public.workspace_contacts(id) on delete set null,
  status             text not null default 'draft'
    check (status in ('draft','in_review','approved','archived')),
  owner_id           uuid references public.profiles(id) on delete set null,
  tags               text[] not null default '{}',
  metadata           jsonb not null default '{}'::jsonb,
  created_by         uuid references public.profiles(id) on delete set null,
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists set_document_templates_updated_at on public.document_templates;
create trigger set_document_templates_updated_at
  before update on public.document_templates
  for each row execute function set_updated_at();

create index if not exists document_templates_workspace_idx
  on public.document_templates(workspace_id, created_at desc);
create index if not exists document_templates_status_idx
  on public.document_templates(workspace_id, status);
create index if not exists document_templates_category_idx
  on public.document_templates(workspace_id, category);
create index if not exists document_templates_department_idx
  on public.document_templates(workspace_id, department_id);
create index if not exists document_templates_task_idx
  on public.document_templates(related_task_id);
create index if not exists document_templates_contact_idx
  on public.document_templates(related_contact_id);

alter table public.document_templates enable row level security;

drop policy if exists "document_templates: visible to admins, authors and members" on public.document_templates;
create policy "document_templates: visible to admins, authors and members"
  on public.document_templates for select
  using (
    is_workspace_admin(workspace_id)
    or (
      is_workspace_member(workspace_id)
      and (status <> 'draft' or created_by = auth.uid())
    )
  );

drop policy if exists "document_templates: members insert own drafts" on public.document_templates;
create policy "document_templates: members insert own drafts"
  on public.document_templates for insert
  with check (
    is_workspace_member(workspace_id)
    and (created_by is null or created_by = auth.uid())
    and (is_workspace_admin(workspace_id) or status = 'draft')
  );

drop policy if exists "document_templates: admins or author can update" on public.document_templates;
create policy "document_templates: admins or author can update"
  on public.document_templates for update
  using (
    is_workspace_admin(workspace_id)
    or (
      is_workspace_member(workspace_id)
      and created_by = auth.uid()
      and status in ('draft','in_review')
    )
  )
  with check (
    is_workspace_admin(workspace_id)
    or (
      is_workspace_member(workspace_id)
      and created_by = auth.uid()
      and status in ('draft','in_review')
    )
  );

drop policy if exists "document_templates: admins or draft author can delete" on public.document_templates;
create policy "document_templates: admins or draft author can delete"
  on public.document_templates for delete
  using (
    is_workspace_admin(workspace_id)
    or (
      is_workspace_member(workspace_id)
      and created_by = auth.uid()
      and status = 'draft'
    )
  );

-- Version history (append-only; minimal UI for now, written on every update).
create table if not exists public.document_template_versions (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.document_templates(id) on delete cascade,
  content_json jsonb,
  content_html text,
  plain_text   text,
  version_no   integer not null default 1,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists document_template_versions_template_idx
  on public.document_template_versions(template_id, version_no desc);

alter table public.document_template_versions enable row level security;

-- Versions follow the parent template's visibility / editability.
drop policy if exists "document_template_versions: select follows template" on public.document_template_versions;
create policy "document_template_versions: select follows template"
  on public.document_template_versions for select
  using (
    exists (
      select 1 from public.document_templates t
      where t.id = template_id
    )
  );

drop policy if exists "document_template_versions: insert follows template" on public.document_template_versions;
create policy "document_template_versions: insert follows template"
  on public.document_template_versions for insert
  with check (
    (created_by is null or created_by = auth.uid())
    and exists (
      select 1 from public.document_templates t
      where t.id = template_id
        and (
          is_workspace_admin(t.workspace_id)
          or (is_workspace_member(t.workspace_id) and t.created_by = auth.uid())
        )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Tablo Merkezi — operation_spreadsheets (+ versions)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.operation_spreadsheets (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  title              text not null check (char_length(title) between 1 and 300),
  description        text,
  sheet_type         text not null default 'freeform'
    check (sheet_type in (
      'freeform','collection','production','inventory','finance','sales','crm','other'
    )),
  snapshot           jsonb not null default '{}'::jsonb,
  schema_json        jsonb not null default '{}'::jsonb,
  department_id      uuid references public.workspace_departments(id) on delete set null,
  related_task_id    uuid references public.tasks(id) on delete set null,
  related_contact_id uuid references public.workspace_contacts(id) on delete set null,
  status             text not null default 'draft'
    check (status in ('draft','active','locked','archived')),
  owner_id           uuid references public.profiles(id) on delete set null,
  tags               text[] not null default '{}',
  metadata           jsonb not null default '{}'::jsonb,
  created_by         uuid references public.profiles(id) on delete set null,
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists set_operation_spreadsheets_updated_at on public.operation_spreadsheets;
create trigger set_operation_spreadsheets_updated_at
  before update on public.operation_spreadsheets
  for each row execute function set_updated_at();

create index if not exists operation_spreadsheets_workspace_idx
  on public.operation_spreadsheets(workspace_id, created_at desc);
create index if not exists operation_spreadsheets_status_idx
  on public.operation_spreadsheets(workspace_id, status);
create index if not exists operation_spreadsheets_department_idx
  on public.operation_spreadsheets(workspace_id, department_id);
create index if not exists operation_spreadsheets_task_idx
  on public.operation_spreadsheets(related_task_id);
create index if not exists operation_spreadsheets_contact_idx
  on public.operation_spreadsheets(related_contact_id);

alter table public.operation_spreadsheets enable row level security;

drop policy if exists "operation_spreadsheets: visible to admins, authors and members" on public.operation_spreadsheets;
create policy "operation_spreadsheets: visible to admins, authors and members"
  on public.operation_spreadsheets for select
  using (
    is_workspace_admin(workspace_id)
    or (
      is_workspace_member(workspace_id)
      and (status <> 'draft' or created_by = auth.uid())
    )
  );

drop policy if exists "operation_spreadsheets: members insert own drafts" on public.operation_spreadsheets;
create policy "operation_spreadsheets: members insert own drafts"
  on public.operation_spreadsheets for insert
  with check (
    is_workspace_member(workspace_id)
    and (created_by is null or created_by = auth.uid())
    and (is_workspace_admin(workspace_id) or status = 'draft')
  );

-- Admins edit anything; a member edits their own sheet while it is not
-- locked/archived (so an own "active" sheet stays editable, approved global
-- sheets belonging to others do not).
drop policy if exists "operation_spreadsheets: admins or author can update" on public.operation_spreadsheets;
create policy "operation_spreadsheets: admins or author can update"
  on public.operation_spreadsheets for update
  using (
    is_workspace_admin(workspace_id)
    or (
      is_workspace_member(workspace_id)
      and created_by = auth.uid()
      and status in ('draft','active')
    )
  )
  with check (
    is_workspace_admin(workspace_id)
    or (
      is_workspace_member(workspace_id)
      and created_by = auth.uid()
      and status in ('draft','active')
    )
  );

drop policy if exists "operation_spreadsheets: admins or draft author can delete" on public.operation_spreadsheets;
create policy "operation_spreadsheets: admins or draft author can delete"
  on public.operation_spreadsheets for delete
  using (
    is_workspace_admin(workspace_id)
    or (
      is_workspace_member(workspace_id)
      and created_by = auth.uid()
      and status = 'draft'
    )
  );

-- Version history (append-only; written on snapshot save, no UI yet).
create table if not exists public.operation_spreadsheet_versions (
  id             uuid primary key default gen_random_uuid(),
  spreadsheet_id uuid not null references public.operation_spreadsheets(id) on delete cascade,
  snapshot       jsonb,
  version_no     integer not null default 1,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists operation_spreadsheet_versions_sheet_idx
  on public.operation_spreadsheet_versions(spreadsheet_id, version_no desc);

alter table public.operation_spreadsheet_versions enable row level security;

drop policy if exists "operation_spreadsheet_versions: select follows sheet" on public.operation_spreadsheet_versions;
create policy "operation_spreadsheet_versions: select follows sheet"
  on public.operation_spreadsheet_versions for select
  using (
    exists (
      select 1 from public.operation_spreadsheets s
      where s.id = spreadsheet_id
    )
  );

drop policy if exists "operation_spreadsheet_versions: insert follows sheet" on public.operation_spreadsheet_versions;
create policy "operation_spreadsheet_versions: insert follows sheet"
  on public.operation_spreadsheet_versions for insert
  with check (
    (created_by is null or created_by = auth.uid())
    and exists (
      select 1 from public.operation_spreadsheets s
      where s.id = spreadsheet_id
        and (
          is_workspace_admin(s.workspace_id)
          or (is_workspace_member(s.workspace_id) and s.created_by = auth.uid())
        )
    )
  );
