-- ---------------------------------------------------------------------------
-- MÜŞTERİ CRM'i (19.11.2026) — KVKK kapsamında, YALNIZ izinli kişilere açık.
--
-- Aslı Hanım: "Kimseyle paylaşmayın… sadece dördümüzde olacak." Liste yalnız
-- Aslı Hanım, Nisa Hanım, Kısmet Hanım ve Sıraç'ta olur. Mevcut /crm fihristi
-- (selebriti, basın, üretici, kolektif) BÜTÜN üyelere açık — onun üstüne
-- kurulamaz; ayrı tablo, ayrı kapı.
--
-- KAPI ROL DEĞİL, İZİN LİSTESİDİR (customer_access). Yönetici olmak yetmez:
-- bir yönetici kendini bu listeye EKLEYEMEZ — tabloya yazma politikası yoktur,
-- satırları yalnız service_role (Sıraç'ın çalıştırdığı betik) ekler. Böylece
-- "yalnız dört kişi" kuralı panelden gevşetilemez.
--
-- SİLME YOK. "Hatalı adres silinmez" (2.11): adres hatalıysa ya da kişi
-- abonelikten çıktıysa kayıtta İŞARET olarak durur. Müşteri tablolarında
-- silme politikası yoktur.
--
-- A+ katmanını yalnız `can_mark_top` izni olan kişi verir/kaldırır (Nisa
-- Hanım) — panel gizlemekle yetinmez, tetikleyici veritabanında da durdurur.
--
-- Gerçek müşteri verisi repoda, örnek veride ve ekran görüntüsünde YER ALMAZ.
-- Aktarım Sıraç'ın elinde: scripts/customers-import.ts (rapor-önce).
-- İdempotent; yalnız ekleme.
-- ---------------------------------------------------------------------------

-- ── İzin listesi ────────────────────────────────────────────────────────────
create table if not exists public.customer_access (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  -- A+ katmanını verebilir / kaldırabilir.
  can_mark_top boolean not null default false,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table public.customer_access enable row level security;

-- Kişi yalnız KENDİ satırını görür (ekran "erişimim var mı" diye sorar).
-- insert / update / delete politikası BİLEREK yok → yalnız service_role.
drop policy if exists "customer_access: own read" on public.customer_access;
create policy "customer_access: own read"
  on public.customer_access for select using (user_id = auth.uid());

revoke all on public.customer_access from anon;
grant select on public.customer_access to authenticated;
grant all on public.customer_access to service_role;

-- Politikaların kullandığı kapı. security definer: politika içinden izin
-- tablosunu okurken o tablonun RLS'ine takılmasın (özyineleme olmasın).
create or replace function public.has_customer_access(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.customer_access
    where workspace_id = ws and user_id = auth.uid()
  );
$$;

revoke all on function public.has_customer_access(uuid) from public;
grant execute on function public.has_customer_access(uuid) to authenticated, service_role;

-- ── Müşteriler ──────────────────────────────────────────────────────────────
create table if not exists public.customers (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  full_name     text not null default '' check (char_length(full_name) <= 200),
  email         text not null default '' check (char_length(email) <= 320 and email = lower(email)),
  phone         text not null default '' check (char_length(phone) <= 60),
  city          text not null default '' check (char_length(city) <= 120),
  -- A+ çok alan · A alan · B deneyip almayan / ödemesi bekleyen · C bilgisini
  -- veren · D e-postası olmayan (22.10 toplantısı).
  tier          text not null default 'C' check (tier in ('A+','A','B','C','D')),
  -- Nereden: site · mağaza · elle.
  source        text not null default 'elle' check (source in ('site','magaza','elle')),
  -- Ana listedeki etiket, olduğu gibi ("www.C", "Mağaza A", "Event A",
  -- "Shopify.C", "2022.A"): katman ve kaynak bundan türer, kendisi kaybolmaz.
  label         text not null default '' check (char_length(label) <= 80),
  -- Son alışveriş / işlem günü. Liste yıla göre gruplanır.
  last_activity date,
  -- Pazarlama e-postası izni — kişinin KENDİSİ verir (6563 / İYS).
  email_consent text not null default 'bilinmiyor' check (email_consent in ('var','yok','bilinmiyor')),
  -- İznin verildiği gün (ana listedeki "E-posta izni" sütunu tarih taşır).
  email_consent_at date,
  -- Adres durumu: hatalı adres ve abonelikten çıkan SİLİNMEZ, işaretlenir.
  email_status  text not null default 'ok' check (email_status in ('ok','hatali','cikti')),
  note          text not null default '' check (char_length(note) <= 4000),
  -- Aktarımın anahtarı (e-posta ya da telefon) — yeniden çalıştırma çift açmaz.
  source_ref    text,
  created_by    uuid references public.profiles(id) on delete set null,
  updated_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Tablo bu dosyanın önceki bir hâliyle açıldıysa (yerel) eksik sütunlar eklenir.
alter table public.customers add column if not exists label text not null default '';
alter table public.customers add column if not exists email_consent_at date;

-- Aynı e-posta iki kez açılmasın (boş e-posta serbest — D katmanı).
create unique index if not exists customers_ws_email_uidx
  on public.customers (workspace_id, email) where email <> '';
-- Kısmi DEĞİL: aktarım `on conflict (workspace_id, source_ref)` kullanır
-- (bkz. 20240375'teki not). NULL'lar birbirine takılmaz.
create unique index if not exists customers_ws_source_ref_uidx
  on public.customers (workspace_id, source_ref);
create index if not exists customers_ws_tier_idx
  on public.customers (workspace_id, tier, last_activity desc);

drop trigger if exists set_customers_updated_at on public.customers;
create trigger set_customers_updated_at
  before update on public.customers
  for each row execute function set_updated_at();

-- A+ yalnız izinli kişiden. service_role (auth.uid() boş) aktarım için serbest.
create or replace function public.customers_guard_top_tier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;
  if (tg_op = 'INSERT' and new.tier = 'A+')
     or (tg_op = 'UPDATE' and (new.tier = 'A+') <> (old.tier = 'A+')) then
    if not exists (
      select 1 from public.customer_access
      where workspace_id = new.workspace_id and user_id = auth.uid() and can_mark_top
    ) then
      raise exception 'A+ katmanını yalnız yetkili kişi değiştirebilir.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists customers_guard_top_tier on public.customers;
create trigger customers_guard_top_tier
  before insert or update on public.customers
  for each row execute function public.customers_guard_top_tier();

-- ── Bülten gönderim geçmişi (kişi kartında görünür) ─────────────────────────
create table if not exists public.customer_sends (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id  uuid not null references public.customers(id) on delete cascade,
  sent_on      date not null,
  subject      text not null default '' check (char_length(subject) <= 300),
  -- gitti · döndü (adres hatalı) · çıktı (abonelikten çıktı)
  result       text not null default 'gitti' check (result in ('gitti','dondu','cikti')),
  source_ref   text,
  created_at   timestamptz not null default now()
);
create unique index if not exists customer_sends_ws_source_ref_uidx
  on public.customer_sends (workspace_id, source_ref);
create index if not exists customer_sends_customer_idx
  on public.customer_sends (customer_id, sent_on desc);

-- ── RLS — yalnız izin listesindekiler; SİLME POLİTİKASI YOK ─────────────────
alter table public.customers      enable row level security;
alter table public.customer_sends enable row level security;

drop policy if exists "customers: allowed read" on public.customers;
create policy "customers: allowed read"
  on public.customers for select using (has_customer_access(workspace_id));
drop policy if exists "customers: allowed insert" on public.customers;
create policy "customers: allowed insert"
  on public.customers for insert with check (has_customer_access(workspace_id));
drop policy if exists "customers: allowed update" on public.customers;
create policy "customers: allowed update"
  on public.customers for update
  using (has_customer_access(workspace_id)) with check (has_customer_access(workspace_id));

-- Gönderim geçmişi panelden YAZILMAZ (gönderen betik afcom-seo'da); yalnız okunur.
drop policy if exists "customer_sends: allowed read" on public.customer_sends;
create policy "customer_sends: allowed read"
  on public.customer_sends for select using (has_customer_access(workspace_id));

revoke all on public.customers, public.customer_sends from anon;
grant select, insert, update on public.customers to authenticated;
grant select on public.customer_sends to authenticated;
grant all on public.customers, public.customer_sends to service_role;
