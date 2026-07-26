-- ============================================================================
-- Cloud onarımı — kısmi uygulanmış migration aralığının yeniden uygulanması
-- ----------------------------------------------------------------------------
-- Geçmişte cloud'da `supabase migration repair --status applied` ile
-- 20240205..20240215 aralığı "uygulandı" olarak işaretlendi; ancak bu
-- migration'lardan bazılarının nesneleri cloud'da hiç kurulmamıştı
-- (belirti: "Could not find the table 'public.document_templates'").
-- db push işaretli migration'ları atladığı için eksikler kendiliğinden
-- kapanmaz. Bu dosya, riskli aralığın (20240206–20240211) İDEMPOTENT
-- içeriğini olduğu gibi yeniden uygular:
--   * 20240206 contact_user_link
--   * 20240207 office_center_foundation (operation_documents,
--     document_templates(+versions), operation_spreadsheets(+versions))
--   * 20240208 task_participant_manage_rls (+ eksik drop-guard'lar eklendi)
--   * 20240209 task_note_workflow
--   * 20240210 request_access_leads
--   * 20240211 member_notification_email
-- 20240205 (creative_assets) ve 20240212–215 (production) cloud'da fiilen
-- çalışıyor — yine de zarar vermez ama gerek olmadığından dahil edilmedi.
-- Nesnesi zaten var olan ortamlarda (lokal) tamamen no-op'tur.
-- ============================================================================


-- ⟪ yeniden uygulama: 20240206000000_contact_user_link.sql ⟫

-- =============================================================================
-- Lospia Operasyon Merkezi — Phase 1 hardening
-- Contact ↔ User/Profile link (additive, backward-compatible).
-- =============================================================================
-- workspace_contacts is used for task responsible/contact mapping AND CRM v0.
-- This migration adds an OPTIONAL link from a contact to a system user
-- (profiles) so an admin can confirm "this CRM contact is that team member".
-- Nothing here is destructive: no drop/rename, no NOT NULL, no data change. The
-- link is set manually from the UI (never auto-applied).
-- =============================================================================

alter table public.workspace_contacts
  add column if not exists user_id uuid references public.profiles(id) on delete set null;

-- Lookup by linked user (e.g. "which contact is this member?").
create index if not exists workspace_contacts_user_id_idx
  on public.workspace_contacts(user_id);

-- A given system user may be linked to at most one contact per workspace.
-- Partial unique so the many unlinked (null) rows are unaffected.
create unique index if not exists workspace_contacts_workspace_user_unique
  on public.workspace_contacts(workspace_id, user_id)
  where user_id is not null;

-- Existing row-level RLS on workspace_contacts already governs this column
-- (policies are row-level, not column-level). No policy change required.

-- ⟪ yeniden uygulama: 20240207000000_office_center_foundation.sql ⟫

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

-- ⟪ yeniden uygulama: 20240208000000_task_participant_manage_rls.sql ⟫

-- =============================================================================
-- Align task_member_completions RLS with the app assignment-permission model
-- =============================================================================
-- The app rule (canManageTaskAssignment, enforced in setTaskParticipants):
--   • owner/admin manage responsible people on ANY task
--   • the task CREATOR manages their own task (incl. picking the initial
--     responsibles in the create modal)
--   • a CURRENT responsible participant may hand the task off
--   • a member can never add themselves to someone else's task (server gate)
--
-- The original insert/delete policies only allowed "admin, or your own
-- membership row". A non-admin creator picking OTHER people therefore hit an
-- RLS violation — and because it was a single batch insert, Postgres rejected
-- ALL rows (their own included) while activity/notifications were still
-- written: the task showed "Henüz sorumlu kişi atanmadı" despite the log.
-- This migration adds the creator / current-participant clauses. No schema
-- change, no new table.
--
-- SECURITY DEFINER helper: a policy on task_member_completions cannot query
-- its own table (RLS self-recursion); a definer function bypasses that — the
-- same pattern as is_workspace_member / is_workspace_admin.

create or replace function public.can_manage_task_participants(
  p_task_id uuid,
  p_workspace_id uuid,
  p_member_id uuid
) returns boolean
language sql security definer set search_path = public as $$
  select
    -- the actor must be the task's creator, a workspace admin, or a current
    -- responsible participant of this task…
    exists (
      select 1 from public.tasks t
      where t.id = p_task_id
        and t.workspace_id = p_workspace_id
        and (
          t.created_by = auth.uid()
          or public.is_workspace_admin(t.workspace_id)
          or exists (
            select 1
            from public.task_member_completions c
            join public.workspace_members wm on wm.id = c.member_id
            where c.task_id = t.id
              and wm.user_id = auth.uid()
          )
        )
    )
    -- …and the targeted membership row must belong to the same workspace
    -- (blocks cross-workspace member injection).
    and exists (
      select 1 from public.workspace_members wm2
      where wm2.id = p_member_id
        and wm2.workspace_id = p_workspace_id
    );
$$;

drop policy if exists "completions: insert own or admin" on public.task_member_completions;
drop policy if exists "completions: insert own, creator, responsible or admin" on public.task_member_completions;
create policy "completions: insert own, creator, responsible or admin"
  on public.task_member_completions for insert
  with check (
    can_manage_task_participants(task_id, workspace_id, member_id)
    or exists (
      select 1 from public.workspace_members wm
      where wm.id = task_member_completions.member_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "completions: delete own or admin" on public.task_member_completions;
drop policy if exists "completions: delete own, creator, responsible or admin" on public.task_member_completions;
create policy "completions: delete own, creator, responsible or admin"
  on public.task_member_completions for delete
  using (
    can_manage_task_participants(task_id, workspace_id, member_id)
    or exists (
      select 1 from public.workspace_members wm
      where wm.id = task_member_completions.member_id
        and wm.user_id = auth.uid()
    )
  );

-- The UPDATE policy ("completions: update own or admin") is intentionally
-- untouched: toggling a completion stays personal (own row) or admin-only.

-- ⟪ yeniden uygulama: 20240209000000_task_note_workflow.sql ⟫

-- =============================================================================
-- Task note workflow — note types, due-date confirmation, acknowledgements
-- =============================================================================
-- Turns task_notes from plain comments into operational notes:
--   * note_type              → info | action_required | handoff | approval_waiting
--   * metadata               → notify targets, assignment action, due-date audit
--   * due_date_at_note_time  → which delivery date was confirmed when noting
--   * action_status          → open | seen | claimed | closed (feed carry-over)
--   * task_note_acknowledgements → per-user "Gördüm" / "Üzerime aldım" records
--
-- FULLY ADDITIVE: no drops, no data rewrites, safe to re-run (idempotent).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- task_notes: new columns (all optional/defaulted → existing rows unaffected)
-- ---------------------------------------------------------------------------
alter table public.task_notes
  add column if not exists note_type text not null default 'info';

alter table public.task_notes
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.task_notes
  add column if not exists due_date_at_note_time date;

alter table public.task_notes
  add column if not exists action_status text not null default 'open';

-- Check constraints (ADD CONSTRAINT has no IF NOT EXISTS → guard via catalog)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'task_notes_note_type_check'
      and conrelid = 'public.task_notes'::regclass
  ) then
    alter table public.task_notes
      add constraint task_notes_note_type_check
      check (note_type in ('info', 'action_required', 'handoff', 'approval_waiting'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'task_notes_action_status_check'
      and conrelid = 'public.task_notes'::regclass
  ) then
    alter table public.task_notes
      add constraint task_notes_action_status_check
      check (action_status in ('open', 'seen', 'claimed', 'closed'));
  end if;
end;
$$;

-- Weekly feed query path: workspace + recency, and open-action carry-over
create index if not exists task_notes_workspace_type_status_idx
  on public.task_notes(workspace_id, note_type, action_status, created_at desc);

-- ---------------------------------------------------------------------------
-- task_note_acknowledgements — per-user seen/claimed receipts (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.task_note_acknowledgements (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id      uuid not null references public.tasks(id) on delete cascade,
  note_id      uuid not null references public.task_notes(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  action       text not null check (action in ('seen', 'claimed')),
  created_at   timestamptz not null default now(),
  unique (note_id, user_id, action)
);

create index if not exists task_note_acks_workspace_task_idx
  on public.task_note_acknowledgements(workspace_id, task_id);
create index if not exists task_note_acks_note_idx
  on public.task_note_acknowledgements(note_id);
create index if not exists task_note_acks_user_idx
  on public.task_note_acknowledgements(user_id);

-- ---------------------------------------------------------------------------
-- RLS — user writes/reads own receipts; admins read (and can clean up) all.
-- No user-side update/delete: receipts are an append-only audit surface.
-- ---------------------------------------------------------------------------
alter table public.task_note_acknowledgements enable row level security;

drop policy if exists "task_note_acks: member inserts own"
  on public.task_note_acknowledgements;
create policy "task_note_acks: member inserts own"
  on public.task_note_acknowledgements for insert
  with check (
    is_workspace_member(workspace_id)
    and user_id = (select auth.uid())
  );

drop policy if exists "task_note_acks: own or admin can select"
  on public.task_note_acknowledgements;
create policy "task_note_acks: own or admin can select"
  on public.task_note_acknowledgements for select
  using (
    user_id = (select auth.uid())
    or is_workspace_admin(workspace_id)
  );

drop policy if exists "task_note_acks: admin can delete"
  on public.task_note_acknowledgements;
create policy "task_note_acks: admin can delete"
  on public.task_note_acknowledgements for delete
  using (is_workspace_admin(workspace_id));

drop policy if exists "task_note_acks: admin can update"
  on public.task_note_acknowledgements;
create policy "task_note_acks: admin can update"
  on public.task_note_acknowledgements for update
  using (is_workspace_admin(workspace_id));

-- PostgREST must see the new columns/table immediately
notify pgrst, 'reload schema';

-- ⟪ yeniden uygulama: 20240210000000_request_access_leads.sql ⟫

-- =============================================================================
-- Request-access leads — public Lospia marketing site lead capture
-- =============================================================================
-- Stores "Kurulum Görüşmesi Planla" form submissions from the public site.
-- This table is NOT workspace-scoped: leads arrive before any workspace exists.
--
-- Security model (intentionally minimal for this phase):
--   * RLS enabled.
--   * anon + authenticated may INSERT only (public form submission).
--   * NOBODY may SELECT / UPDATE / DELETE through the API — leads are read
--     via the Supabase dashboard until an internal admin UI is justified.
--
-- FULLY ADDITIVE: no drops, no data rewrites, safe to re-run (idempotent).
-- =============================================================================

create table if not exists public.request_access_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  company_name text not null,
  team_size text,
  current_workflow_tool text,
  main_operational_pain text,
  note text,
  source text not null default 'website',
  status text not null default 'new',
  created_at timestamptz not null default now()
);

alter table public.request_access_leads enable row level security;

-- Insert-only for the public form. No select/update/delete policies exist,
-- so RLS denies every other operation for anon and authenticated roles.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'request_access_leads'
      and policyname = 'request_access_leads_public_insert'
  ) then
    create policy request_access_leads_public_insert
      on public.request_access_leads
      for insert
      to anon, authenticated
      with check (true);
  end if;
end $$;

-- ⟪ yeniden uygulama: 20240211000000_member_notification_email.sql ⟫

-- =============================================================================
-- Member notification e-mail (additive, backward-compatible)
-- =============================================================================
-- Admin-created accounts authenticate with an internal placeholder address
-- (`<username>@lospia.local`) that can never receive mail. This migration adds
-- a workspace-scoped REAL notification address per member, plus a per-member
-- kill switch, so e-mail notifications can reach people without ever touching
-- auth/login e-mails (auth.users.email / profiles.email stay untouched).
--
-- Nothing here is destructive: no drop/rename, no NOT NULL on existing rows,
-- no data change. Existing RLS already covers the new columns:
--   • owner/admin can update any member row  (initial_schema policy)
--   • a member can update their own row      (member_rules_seen policy)
--   • all workspace members can select rows  (same visibility as profiles.email today)
-- =============================================================================

alter table public.workspace_members
  add column if not exists notification_email text,
  add column if not exists email_notifications_enabled boolean not null default true;

-- Light sanity check only (something@something, no whitespace). Real format
-- validation lives in the app layer; this just blocks obviously broken values
-- from ever landing in the column.
alter table public.workspace_members
  drop constraint if exists workspace_members_notification_email_format;
alter table public.workspace_members
  add constraint workspace_members_notification_email_format
  check (
    notification_email is null
    or notification_email ~ '^[^[:space:]@]+@[^[:space:]@]+$'
  );

comment on column public.workspace_members.notification_email is
  'Real e-mail used for outbound notifications. Falls back to profiles.email when null; @lospia.local placeholders are never mailed.';
comment on column public.workspace_members.email_notifications_enabled is
  'Per-member kill switch for e-mail notifications (in-app notifications are unaffected).';
