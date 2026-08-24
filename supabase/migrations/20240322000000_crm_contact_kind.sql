-- ============================================================================
-- CRM: ekip / dış ilişki ayrımı
-- ----------------------------------------------------------------------------
-- Aslı Hanım (2026-08-24): "CRM'de neden sistemde kayıtlı çalışanlar var? Bu
-- kısımda bir mantık hatası var gibi… profesyonel bir CRM sistemi şeklinde
-- olmamalı mı?"
--
-- KÖK SEBEP: workspace_contacts aynı anda İKİ iş yapıyordu —
--   1. sistemde hesabı olmayan ama iş atanabilen kişiler (Pano kişi ızgarası)
--   2. CRM ilişkileri (müşteri, tedarikçi, basın)
-- Ekip, hesapları açılmadan önce (1) olarak girilmişti; CRM ayrım yapmadan
-- hepsini listeliyordu. Sonuç: "VIP müşteriler, PR kontakları, influencerlar"
-- başlığının altında şirketin kendi çalışanları.
--
-- ÇÖZÜM: kayıt türü.
--   kind = 'team'     → ekip; Pano'da atanabilir, CRM'de GÖRÜNMEZ
--   kind = 'external' → dış ilişki; CRM'de görünür
--
-- Mevcut kayıtların sınıflandırması. Sıra ÖNEMLİ — en güçlü kanıt önce:
--   • ÜZERİNDE GÖREV VARSA                                → team
--        En sağlam sinyal bu. Müşteriye görev atanmaz; iş yapan kişi ekiptir.
--        Bu kural olmasaydı Selen (21 görev), Gül (16) ve Kısmet (13) "dış
--        ilişki" sayılıp panodan düşecek, 50 görev ulaşılamaz kalacaktı.
--   • sistem hesabına bağlıysa (user_id dolu)             → team
--   • adı TEK bir üyenin adıyla/ilk adıyla eşleşiyorsa    → team
--   • gerisi                                              → external
--
-- Yanlış sınıflama iki yönde de tamir edilebilir (kayıt formundaki "Tür"
-- alanı), ama ekip kartının kaybolması iş kaybı gibi görünür — bu yüzden
-- şüphede kalınca 'team' tarafına yanılmak tercih edilir.
--
-- Additive & idempotent.
-- ============================================================================

-- ── 1. Kayıt türü ───────────────────────────────────────────────────────────
alter table public.workspace_contacts
  add column if not exists kind text not null default 'external';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workspace_contacts_kind_check'
  ) then
    alter table public.workspace_contacts
      add constraint workspace_contacts_kind_check
      check (kind in ('team', 'external'));
  end if;
end $$;

create index if not exists workspace_contacts_kind_idx
  on public.workspace_contacts (workspace_id, kind);

-- Sınıflandırma — yalnız bir kez anlamlı; fonksiyon olarak yazılır ki yerel
-- `supabase db reset`'te seed.sql sonunda da çağrılabilsin.
create or replace function public.classify_contact_kinds()
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare v_team int := 0;
begin
  -- (a) Üzerinde görev olan kişi ekiptir — en sağlam sinyal.
  update public.workspace_contacts c
     set kind = 'team'
   where c.kind <> 'team'
     and exists (
       select 1 from public.tasks t
        where t.responsible_contact_id = c.id
          and t.deleted_at is null
     );

  -- (b) Sistem hesabına bağlı olanlar kesin ekip.
  update public.workspace_contacts c
     set kind = 'team'
   where c.user_id is not null and c.kind <> 'team';
  get diagnostics v_team = row_count;

  -- (c) Adı TEK bir üyeyle eşleşenler (tam ad ya da ilk ad). Birden fazla
  --     üyeye uyuyorsa DOKUNULMAZ — tahminle ekip sayıp CRM'den düşürmeyiz.
  with aday as (
    select c.id,
           (select count(*)
              from public.profiles p
              join public.workspace_members wm on wm.user_id = p.id
             where wm.workspace_id = c.workspace_id
               and coalesce(btrim(p.full_name), '') <> ''
               and (
                 lower(btrim(p.full_name)) = lower(btrim(c.name))
                 or lower(split_part(btrim(p.full_name), ' ', 1))
                    = lower(split_part(btrim(c.name), ' ', 1))
               )) as eslesme
      from public.workspace_contacts c
     where c.kind <> 'team'
  )
  update public.workspace_contacts c
     set kind = 'team'
    from aday a
   where c.id = a.id and a.eslesme = 1;

  return format(
    'CRM sınıflandırma: %s ekip, %s dış ilişki.',
    (select count(*) from public.workspace_contacts where kind = 'team'),
    (select count(*) from public.workspace_contacts where kind = 'external')
  );
end $fn$;

select public.classify_contact_kinds();
grant execute on function public.classify_contact_kinds() to service_role;
