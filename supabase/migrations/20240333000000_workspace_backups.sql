-- ---------------------------------------------------------------------------
-- YEDEK KAYDI — "en son ne zaman yedek aldık?"
--
-- Sıraç (2026-08-29): "Drive'daki bütün dosyaları buraya alacağız, o yüzden
-- silinme riskinin, kayıp riskinin olmaması gerekiyor… ayarlar kısmına yedek
-- tarzı bir şey yazman lazım, haftada bir bu yedeği alıp indirmemiz gerekiyor."
--
-- Yedeğin KENDİSİ burada durmaz — o, tarayıcıya inen bir .zip dosyasıdır
-- (app/api/backup). Burada yalnız İZ tutulur: kim, ne zaman, ne kapsamda aldı.
-- Bu iz olmadan "haftada bir" bir niyet olarak kalırdı; Ayarlar'daki uyarı
-- şeridi (7 günden eski yedek) bu tablodan besleniyor.
--
-- Satırlar değiştirilemez ve silinemez: yedek geçmişi bir denetim izidir.
-- ---------------------------------------------------------------------------

create table if not exists public.workspace_backups (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- profiles'a bağlanır (auth.users'a değil): satır okunurken alan kişinin adı
  -- gömülü ilişkiyle gelsin — workspace_activity_logs ile aynı desen.
  created_by   uuid references public.profiles(id) on delete set null,
  -- 'data' = yalnız kayıtlar · 'full' = kayıtlar + yüklenen dosyalar
  kind         text not null default 'data',
  table_count  integer,
  row_count    integer,
  file_count   integer,
  byte_size    bigint,
  note         text,
  created_at   timestamptz not null default now()
);

alter table public.workspace_backups
  drop constraint if exists workspace_backups_kind_check;
alter table public.workspace_backups
  add constraint workspace_backups_kind_check check (kind in ('data', 'full'));

create index if not exists workspace_backups_recent_idx
  on public.workspace_backups (workspace_id, created_at desc);

alter table public.workspace_backups enable row level security;

-- Okuma ve yazma: YALNIZ yönetici. Yedek alma yetkisi Ayarlar yetkisidir.
drop policy if exists workspace_backups_select on public.workspace_backups;
create policy workspace_backups_select on public.workspace_backups
  for select using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = workspace_backups.workspace_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

drop policy if exists workspace_backups_insert on public.workspace_backups;
create policy workspace_backups_insert on public.workspace_backups
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.workspace_members m
      where m.workspace_id = workspace_backups.workspace_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- Güncelleme/silme YOK: yedek geçmişi değiştirilemez.

grant select, insert on public.workspace_backups to authenticated;
grant all on public.workspace_backups to service_role;
