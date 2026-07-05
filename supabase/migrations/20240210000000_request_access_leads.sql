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
