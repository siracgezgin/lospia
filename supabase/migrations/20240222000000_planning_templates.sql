-- ============================================================================
-- Planlama Şablonları — tekrar eden haftalık ritim
-- ----------------------------------------------------------------------------
-- Aslı Hanım'ın takvim ilkesi: "her gün aynı saatte üretim; tekrar eden patern
-- alışkanlığa döner." Şablon = haftanın iskeleti (gün + saat + kategori +
-- başlık + varsayılan katılımcılar). "Haftayı şablondan kur" aksiyonu bu
-- satırlardan o haftanın planning_meetings kayıtlarını üretir.
--
-- İzin modeli: tüm üyeler okur; şablonu yalnız admin yönetir (haftanın
-- iskeleti çalışma alanı kararıdır). Idempotent.
-- ============================================================================

create table if not exists public.planning_templates (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  weekday         int  not null default 0 check (weekday between 0 and 6), -- 0=Pazartesi … 6=Pazar
  time_slot       text not null default '09:00',
  category        text not null default 'uretim'
    check (category in (
      'uretim','ai','sales','marketing','finance','external','system','other'
    )),
  title           text,                            -- "Ready to Wear" / "Lookbook"
  content         text,
  participant_ids uuid[] not null default '{}',    -- varsayılan katılımcılar (user id)
  position        int  not null default 0,
  active          boolean not null default true,   -- pasif şablon haftaya kurulmaz
  created_by      uuid references public.profiles(id) on delete set null,
  updated_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists set_planning_templates_updated_at on public.planning_templates;
create trigger set_planning_templates_updated_at
  before update on public.planning_templates
  for each row execute function set_updated_at();

create index if not exists planning_templates_workspace_idx
  on public.planning_templates(workspace_id, weekday, time_slot, position);

-- Toplantı → şablon bağı: "bu hafta bu şablon zaten kuruldu mu?" sorusunun
-- güvenilir cevabı (başlık karşılaştırması değil, kimlik).
alter table public.planning_meetings
  add column if not exists template_id uuid references public.planning_templates(id) on delete set null;
create index if not exists planning_meetings_template_idx
  on public.planning_meetings(template_id);

-- ---------------------------------------------------------------------------
-- RLS — üyeler okur, admin yazar
-- ---------------------------------------------------------------------------
alter table public.planning_templates enable row level security;

drop policy if exists "planning_templates: members read" on public.planning_templates;
create policy "planning_templates: members read"
  on public.planning_templates for select
  using (is_workspace_member(workspace_id));

drop policy if exists "planning_templates: admin insert" on public.planning_templates;
create policy "planning_templates: admin insert"
  on public.planning_templates for insert
  with check (is_workspace_admin(workspace_id));

drop policy if exists "planning_templates: admin update" on public.planning_templates;
create policy "planning_templates: admin update"
  on public.planning_templates for update
  using (is_workspace_admin(workspace_id))
  with check (is_workspace_admin(workspace_id));

drop policy if exists "planning_templates: admin delete" on public.planning_templates;
create policy "planning_templates: admin delete"
  on public.planning_templates for delete
  using (is_workspace_admin(workspace_id));

grant select, insert, update, delete on public.planning_templates to authenticated, service_role;
