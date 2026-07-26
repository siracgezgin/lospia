-- ============================================================================
-- Finans — Ödeme Takibi (finance_payments)
-- ----------------------------------------------------------------------------
-- Excel "Finans Ödeme Tablo" sekmesinin sistemdeki karşılığı: kime, ne kadar,
-- ne zaman, ödendi mi. (Toplantıdaki örnek: "Berna ödeme, Ruki ödeme, Nihal
-- Hoca ödeme".)
--
-- İzin modeli: finans hassastır — okuma DAHİL her şey yalnız owner/admin.
-- is_workspace_admin 20240207_office_center_foundation'dan gelir. Idempotent.
-- ============================================================================

create table if not exists public.finance_payments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title        text not null,                        -- "Ruki ödeme" / "Sri Lanka kumaş"
  payee        text,                                 -- kişi / tedarikçi adı
  amount       numeric(14,2),                        -- tutar
  currency     text not null default 'TRY',
  status       text not null default 'bekliyor'
    check (status in ('bekliyor','odendi')),
  due_date     date,                                 -- vade
  paid_at      date,                                 -- fiilen ödendiği gün
  category     text,                                 -- serbest etiket ("üretim", "hoca"…)
  notes        text,
  created_by   uuid references public.profiles(id) on delete set null,
  updated_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists set_finance_payments_updated_at on public.finance_payments;
create trigger set_finance_payments_updated_at
  before update on public.finance_payments
  for each row execute function set_updated_at();

create index if not exists finance_payments_workspace_idx
  on public.finance_payments(workspace_id, status, due_date);

-- ---------------------------------------------------------------------------
-- RLS — her işlem admin-only (üyeler bu tabloyu hiç görmez)
-- ---------------------------------------------------------------------------
alter table public.finance_payments enable row level security;

drop policy if exists "finance_payments: admin read" on public.finance_payments;
create policy "finance_payments: admin read"
  on public.finance_payments for select
  using (is_workspace_admin(workspace_id));

drop policy if exists "finance_payments: admin insert" on public.finance_payments;
create policy "finance_payments: admin insert"
  on public.finance_payments for insert
  with check (is_workspace_admin(workspace_id));

drop policy if exists "finance_payments: admin update" on public.finance_payments;
create policy "finance_payments: admin update"
  on public.finance_payments for update
  using (is_workspace_admin(workspace_id))
  with check (is_workspace_admin(workspace_id));

drop policy if exists "finance_payments: admin delete" on public.finance_payments;
create policy "finance_payments: admin delete"
  on public.finance_payments for delete
  using (is_workspace_admin(workspace_id));

grant select, insert, update, delete on public.finance_payments to authenticated, service_role;
