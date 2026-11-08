-- ---------------------------------------------------------------------------
-- BÜLTEN PLANI — haftalık newsletter planı (06.11.2026 toplantısı)
--
-- Bülten haftada bir, PAZARTESİ gider. Aylık plan Excel'de tutuluyordu; artık
-- panelde: Nisa Hanım hazırlar, Aslı Hanım onaylar. Bir satır = bir pazartesi.
--
-- GÖNDERİM PANELDE YOK. Postayı afcom-seo/27_bulten atar; abone listesi ve
-- posta şifresi bu veritabanına GİRMEZ (KVKK — Aslı Hanım'ın açık talimatı:
-- liste yalnız Aslı, Nisa, Kısmet ve Siraç'ta). Burada yalnız İÇERİK planı var.
--
-- GÖRSEL YÜKLEME YOK: ücretsiz paketin depolaması dolmak üzere; görsel sitedeki
-- medya adresi olarak tutulur.
--
-- 1. sürüm: rol kısıtı yok, durum tek açılır menü. Onay akışı, uyarılar ve
-- dışa aktarım 2. sürümde.
-- ---------------------------------------------------------------------------

create table if not exists public.newsletter_weeks (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  -- Gönderim günü. Bülten pazartesi gider; kısıt bunu zorlar (isodow 1 = pzt).
  send_date         date not null check (extract(isodow from send_date) = 1),
  -- taslak · onayda · onaylandi · duzeltme · gonderildi
  status            text not null default 'taslak'
                    check (status in ('taslak','onayda','onaylandi','duzeltme','gonderildi')),
  theme             text not null default '',
  subject           text not null default '',
  opening_title     text not null default '',
  opening_image_url text not null default '',
  opening_link      text not null default '',
  welcome           text not null default '',
  products_title    text not null default '',
  -- [{id, name, url, image_url, in_stock}] — sitedeki ürünün SEÇİLDİĞİ andaki
  -- hâli. Site değişse de planın ne gösterdiği okunabilsin diye kopya tutulur.
  products          jsonb not null default '[]'::jsonb,
  story_title       text not null default '',
  story_url         text not null default '',
  social_image_url  text not null default '',
  social_link       text not null default '',
  notes             text not null default '',
  created_by        uuid references public.profiles(id) on delete set null,
  updated_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Bir çalışma alanında bir pazartesiye TEK plan.
create unique index if not exists newsletter_weeks_ws_date_uidx
  on public.newsletter_weeks (workspace_id, send_date);

comment on table public.newsletter_weeks is
  'Haftalık bülten planı — bir satır bir pazartesi. Gönderim ve abone listesi panelde YOK (afcom-seo/27_bulten).';

drop trigger if exists set_newsletter_weeks_updated_at on public.newsletter_weeks;
create trigger set_newsletter_weeks_updated_at
  before update on public.newsletter_weeks
  for each row execute function set_updated_at();

-- ── RLS — ekip okur ve yazar; silme yönetici ──────────────────────────────
alter table public.newsletter_weeks enable row level security;

drop policy if exists "newsletter_weeks: member read" on public.newsletter_weeks;
create policy "newsletter_weeks: member read"
  on public.newsletter_weeks for select
  using (is_workspace_member(workspace_id));

drop policy if exists "newsletter_weeks: member insert" on public.newsletter_weeks;
create policy "newsletter_weeks: member insert"
  on public.newsletter_weeks for insert
  with check (is_workspace_member(workspace_id));

drop policy if exists "newsletter_weeks: member update" on public.newsletter_weeks;
create policy "newsletter_weeks: member update"
  on public.newsletter_weeks for update
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

drop policy if exists "newsletter_weeks: admin delete" on public.newsletter_weeks;
create policy "newsletter_weeks: admin delete"
  on public.newsletter_weeks for delete
  using (is_workspace_admin(workspace_id));

grant select, insert, update, delete on public.newsletter_weeks to authenticated;
grant all on public.newsletter_weeks to service_role;

-- ── Başlangıç: Kasım 2026 ─────────────────────────────────────────────────
-- Yalnız GERÇEK çalışma alanına: föyü olan alan (demo/boş alanlar dışarıda).
-- `on conflict do nothing` — ekip satırı değiştirdiyse tekrar çalışınca ezmez.
-- Welcome: Aslı Hanım'ın onaylı metni (29.10.2026), lib/newsletter/model.ts
-- DEFAULT_WELCOME ile birebir.
insert into public.newsletter_weeks
  (workspace_id, send_date, status, theme, opening_title, products_title, notes, welcome)
select w.id, d.send_date, 'taslak', d.theme, d.opening_title, d.products_title, d.notes,
'We are delighted to welcome you to Aslı Filinta, where cultural heritage, craftsmanship, and contemporary design come together.

Rooted in cultural memory and guided by a commitment to social, economic, and ecological sustainability, our work celebrates the knowledge carried across generations and the hands that keep it alive.

Beyond our collections, the Filinta Methodology brings together artisans, women-led collectives, educational institutions, and creative industries to transform traditional knowledge into meaningful opportunities for the future.

As part of our community, you will be among the first to discover our latest collections, unique handcrafted pieces, cultural collaborations, exhibitions, and upcoming projects.

We invite you to explore a world where design becomes a bridge between the past and the future, and where individual creativity contributes to collective progress.'
from public.workspaces w
cross join (values
  ('2026-11-09'::date, '', 'Do It Yourself', 'One of a Kind Collection',
   'Sıra: Do It Yourself (ana görsel, YouTube''a gider) → Welcome to the world metni → One of a Kind Collection (2 ürün) → Story → Instagram (NY Times''a çıkan çalışma).'),
  ('2026-11-16'::date, 'Yörük', '', '', 'Yörük ürünleri.')
) as d(send_date, theme, opening_title, products_title, notes)
where exists (select 1 from public.production_sheets s where s.workspace_id = w.id)
on conflict (workspace_id, send_date) do nothing;
