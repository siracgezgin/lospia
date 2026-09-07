-- ---------------------------------------------------------------------------
-- KADEMELİ KONTROL ZİNCİRİ  (Aslı Hanım, 2026-09-07)
--
--   "Şöyle yaparsanız daha avantajlı olur: GÜL'ÜN YAPTIĞINI SEN KONTROL ET.
--    SENİN YAPTIĞINI GÜL KONTROL ETSİN. İKİNİZİN YAPTIĞINI NİSA KONTROL ETSİN.
--    ONDAN SONRA BANA GELSİN."
--   "Böylece bana gelene kadar zaten bitirmiş olursunuz. Hızlanırız, başka işe
--    bakarız, daha keyifli çalışırız. BÖYLE BASİT HATALARA BAKMAYIZ."
--
-- Bugünkü model tek kademeydi: üye "Kontrol / Onay"a atar, yönetici 'done'
-- yapar. Aradaki iki kademe (çapraz kontrol + koordinatör) hiç yoktu; AF her
-- basit hatayı kendisi yakalıyordu — 07.09 toplantısının 43 dakikası buydu.
--
-- İKİ TABLO:
--   workspace_review_chain — çalışma alanının SABİT kuyruğu (Nisa → Aslı).
--     Yönetici bir kez kurar; her göreve elle yazılmaz.
--   task_review_steps      — görev kontrole girdiğinde MADDELEŞEN adımlar.
--     Çapraz kontrolcü (Gül⇄Kısmet) sabit kuyruğa yazılamaz çünkü İŞİ KİMİN
--     YAPTIĞINA göre değişir; onu işi bitiren kişi gönderirken seçer.
--
-- Adımlar SIRALIDIR: yalnız ilk onaylanmamış adımın sahibi onaylayabilir
-- ("ondan sonra bana gelsin"). Kural sunucu eyleminde uygulanır; burada veri
-- yapısı ve erişim sınırı durur.
--
-- Görev DURUMU bu tablolardan değişmez. 'done' hâlâ yalnız yöneticinindir
-- (canCompleteTask) — zincir kararı değil GÖRÜNÜRLÜĞÜ verir: AF ekrana bakınca
-- Nisa'nın kontrol edip etmediğini görür.
-- ---------------------------------------------------------------------------

create table if not exists public.workspace_review_chain (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  position     int  not null,
  reviewer_id  uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  -- Aynı kişi kuyrukta iki kez duramaz; sıra da tekildir.
  unique (workspace_id, position),
  unique (workspace_id, reviewer_id)
);

create table if not exists public.task_review_steps (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id      uuid not null references public.tasks(id) on delete cascade,
  position     int  not null,
  reviewer_id  uuid not null references public.profiles(id) on delete cascade,
  approved_at  timestamptz,
  -- Onaylarken ya da geri gönderirken yazılan not.
  note         text check (note is null or char_length(note) <= 2000),
  created_at   timestamptz not null default now(),
  unique (task_id, position)
);

create index if not exists task_review_steps_task_idx
  on public.task_review_steps (task_id, position);
create index if not exists task_review_steps_reviewer_idx
  on public.task_review_steps (workspace_id, reviewer_id, approved_at);

comment on table public.workspace_review_chain is
  'Kontrolün sabit kuyruğu (koordinatör → yönetici). Çapraz kontrolcü göreve özeldir, burada durmaz.';
comment on table public.task_review_steps is
  'Bir görevin kontrol adımları. Sıralı: yalnız ilk onaylanmamış adımın sahibi onaylar.';

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.workspace_review_chain enable row level security;
alter table public.task_review_steps enable row level security;

drop policy if exists "review_chain: member read" on public.workspace_review_chain;
create policy "review_chain: member read"
  on public.workspace_review_chain for select
  using (is_workspace_member(workspace_id));

drop policy if exists "review_chain: admin write" on public.workspace_review_chain;
create policy "review_chain: admin write"
  on public.workspace_review_chain for all
  using (is_workspace_admin(workspace_id))
  with check (is_workspace_admin(workspace_id));

drop policy if exists "review_steps: member read" on public.task_review_steps;
create policy "review_steps: member read"
  on public.task_review_steps for select
  using (is_workspace_member(workspace_id));

-- Adımları işi bitiren kişi (kontrole gönderirken) oluşturur.
drop policy if exists "review_steps: member insert" on public.task_review_steps;
create policy "review_steps: member insert"
  on public.task_review_steps for insert
  with check (is_workspace_member(workspace_id));

-- ONAY KENDİ ADIMINDIR. Bir üye başkasının adımını onaylayamaz; yönetici
-- tıkanan zinciri açabilsin diye istisnadır.
drop policy if exists "review_steps: reviewer or admin update" on public.task_review_steps;
create policy "review_steps: reviewer or admin update"
  on public.task_review_steps for update
  using (
    is_workspace_member(workspace_id)
    and (reviewer_id = auth.uid() or is_workspace_admin(workspace_id))
  )
  with check (
    is_workspace_member(workspace_id)
    and (reviewer_id = auth.uid() or is_workspace_admin(workspace_id))
  );

-- Geri gönderme zinciri sıfırlar: adımları silen, onları kuran kişi ya da
-- zincirdeki bir kontrolcü olabilir.
drop policy if exists "review_steps: member delete" on public.task_review_steps;
create policy "review_steps: member delete"
  on public.task_review_steps for delete
  using (is_workspace_member(workspace_id));

grant select, insert, update, delete on public.workspace_review_chain to authenticated;
grant select, insert, update, delete on public.task_review_steps to authenticated;
grant all on public.workspace_review_chain to service_role;
grant all on public.task_review_steps to service_role;

-- ── SIRA KURALI VERİTABANINDA DA GEÇERLİ ───────────────────────────────────
-- "İkinizin yaptığını Nisa kontrol etsin, ONDAN SONRA bana gelsin."
--
-- Sıra kuralı önce yalnız sunucu eylemindeydi (approveReviewStep). RLS ise
-- kişinin KENDİ adımını onaylamasına izin verdiği için, doğrudan PostgREST'e
-- istek atan biri kendi adımını sırası gelmeden onaylayabilirdi — kademe
-- atlanır, AF'nin kurduğu düzen sessizce delinirdi.
--
-- Tetikleyici kuralı yolun tamamına yayar: hangi arayüzden gelirse gelsin,
-- önceki adım onaylanmadan sonraki onaylanamaz.
create or replace function public.enforce_review_step_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Yalnız "onaylama" anını denetler; not güncelleme ya da geri alma serbest.
  if new.approved_at is not null and old.approved_at is null then
    if exists (
      select 1 from public.task_review_steps s
      where s.task_id = new.task_id
        and s.position < new.position
        and s.approved_at is null
    ) then
      raise exception 'Sıra bu adımda değil: önceki kontrolün tamamlanması gerekiyor.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists task_review_steps_order on public.task_review_steps;
create trigger task_review_steps_order
  before update on public.task_review_steps
  for each row execute function public.enforce_review_step_order();
