-- ============================================================================
-- Sezon — workspace_seasons
-- ----------------------------------------------------------------------------
-- Zedonk (rakip fashion PLM/ERP) incelemesinden gelen en önemli mimari fikir:
-- her ekranın sağ üstünde bir sezon seçici var (`SS 21 - WW`) ve bu bir filtre
-- DEĞİL, tüm sistemin çalıştığı BAĞLAM. Moda işi zaten sezonla düşünür.
--
-- Bizde `production_sheets.season` yalnız föyün içinde SERBEST METİNDİ
-- ("2026 RESORT"). Bu yüzden "bu sezon ne ürettik, kaça mal oldu, geçen
-- sezona göre nasıl" sorularının hiçbiri cevaplanamıyordu.
--
-- GERİYE UYUM: `season` metni SİLİNMEZ. Migration mevcut metinlerden sezon
-- kaydı üretir ve föyleri bağlar; eşleşmeyen metin olduğu yerde durur.
--
-- İdempotent: create-if-not-exists / drop-if-exists + create.
-- ============================================================================

create table if not exists public.workspace_seasons (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null,             -- "2026 RESORT", "SS26"
  starts_on    date,
  ends_on      date,
  -- Aktif sezon: yeni föy açılırken varsayılan, üst çubukta ilk seçili gelen.
  -- Çalışma alanı başına EN FAZLA BİR tane (aşağıdaki kısmi benzersiz indeks).
  is_current   boolean not null default false,
  position     int not null default 0,
  created_by   uuid references public.profiles(id) on delete set null,
  updated_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, name)
);

-- "Aktif sezon" tek olsun — iki aktif sezon üst çubuğu belirsizleştirir.
create unique index if not exists workspace_seasons_one_current_idx
  on public.workspace_seasons(workspace_id)
  where is_current;

drop trigger if exists set_workspace_seasons_updated_at on public.workspace_seasons;
create trigger set_workspace_seasons_updated_at
  before update on public.workspace_seasons
  for each row execute function set_updated_at();

create index if not exists workspace_seasons_workspace_idx
  on public.workspace_seasons(workspace_id, position);

-- ── Föy → sezon bağı ───────────────────────────────────────────────────────
alter table public.production_sheets
  add column if not exists season_id uuid
    references public.workspace_seasons(id) on delete set null;

create index if not exists production_sheets_season_idx
  on public.production_sheets(workspace_id, season_id);

comment on column public.production_sheets.season_id is
  'Sezon kaydı. season metni geri uyum için korunur; ikisi doluysa bu kazanır.';

-- ---------------------------------------------------------------------------
-- RLS — üyeler okur, yönetici yazar (üretici tablosuyla aynı model).
-- ---------------------------------------------------------------------------
alter table public.workspace_seasons enable row level security;

drop policy if exists "workspace_seasons: members read" on public.workspace_seasons;
create policy "workspace_seasons: members read"
  on public.workspace_seasons for select
  using (is_workspace_member(workspace_id));

drop policy if exists "workspace_seasons: admin insert" on public.workspace_seasons;
create policy "workspace_seasons: admin insert"
  on public.workspace_seasons for insert
  with check (is_workspace_admin(workspace_id));

drop policy if exists "workspace_seasons: admin update" on public.workspace_seasons;
create policy "workspace_seasons: admin update"
  on public.workspace_seasons for update
  using (is_workspace_admin(workspace_id))
  with check (is_workspace_admin(workspace_id));

drop policy if exists "workspace_seasons: admin delete" on public.workspace_seasons;
create policy "workspace_seasons: admin delete"
  on public.workspace_seasons for delete
  using (is_workspace_admin(workspace_id));

grant select, insert, update, delete on public.workspace_seasons to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Veri taşıma — mevcut `season` metinlerinden sezon kaydı üret ve bağla.
-- Üretici taşımasıyla aynı gerekçe: yerelde seed.sql migration'lardan SONRA
-- koşar, o an henüz föy yoktur. Fonksiyon seed sonunda ikinci kez çağrılır.
-- ---------------------------------------------------------------------------
create or replace function public.af_backfill_seasons()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created int;
  v_linked  int;
begin
  insert into public.workspace_seasons (workspace_id, name)
  select distinct ps.workspace_id, btrim(ps.season)
    from public.production_sheets ps
   where ps.season is not null
     and btrim(ps.season) <> ''
  on conflict (workspace_id, name) do nothing;
  get diagnostics v_created = row_count;

  update public.production_sheets ps
     set season_id = sn.id
    from public.workspace_seasons sn
   where ps.season_id is null
     and ps.season is not null
     and sn.workspace_id = ps.workspace_id
     and sn.name = btrim(ps.season);
  get diagnostics v_linked = row_count;

  -- Hiç aktif sezon yoksa en çok föye sahip olanı aktif yap; böylece üst
  -- çubuk ilk açılışta boş gelmez.
  update public.workspace_seasons s
     set is_current = true
   where s.id in (
     select sn.id
       from public.workspace_seasons sn
       left join public.production_sheets p on p.season_id = sn.id
      where not exists (
        select 1 from public.workspace_seasons x
         where x.workspace_id = sn.workspace_id and x.is_current
      )
      group by sn.id, sn.workspace_id
      order by count(p.id) desc
      limit 1
   );

  return format('Sezon taşıma: %s sezon eklendi, %s föy bağlandı.', v_created, v_linked);
end;
$$;

revoke execute on function public.af_backfill_seasons() from public, anon;
grant execute on function public.af_backfill_seasons() to service_role;

do $$
declare v_msg text;
begin
  select public.af_backfill_seasons() into v_msg;
  raise notice '%', v_msg;
end $$;
