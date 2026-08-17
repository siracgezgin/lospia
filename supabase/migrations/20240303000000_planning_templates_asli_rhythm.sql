-- ============================================================================
-- Planlama Şablonları — Aslı Hanım'ın haftalık ritmi
-- ----------------------------------------------------------------------------
-- Kaynak: AF_Work.xlsx "Toplantı Takvimi" — ızgaranın SAAT satırları. Excel'de
-- Konu 1..5 her hafta değişir ama şeritlerin gün başlıkları SABİTTİR:
--
--   09:00 ÜRETİM      Pzt Ready to Wear · Sal One of a kind · Çar Accessories
--                     Per Satın Alma · Cum Rapor & Arge · Cmt Calls
--   10:00 MARKETING   Pzt Celebrity · Sal Interviews · Çar AI / Sales & Marketing
--                     Per Celebrity · Cum Rapor & Arge · Cmt Outside Meetings
--   11:00 SALES       Pzt AFCOM · Sal İç piyasa & İhracat · Çar Bireysel Müşteri
--                     Per Finance · Cum Rapor & Arge · Cmt KOOP
--   12:00 SİSTEM/AI   Pzt AFCOM · Çar AF Operational System · Cum Filinta Methodogy
--
-- Bu 21 satır sayesinde "Haftayı kur" düğmesi HERHANGİ bir haftanın iskeletini
-- tek tıkla üretir; ekip yalnız Konu satırlarını doldurur. Aslı Hanım'ın ilkesi:
-- "tekrar eden patern alışkanlığa döner" (Üretim hep sarı, hep 09:00).
--
-- 17–23 Ağustos haftası zaten elle aktarıldığı (20240302) için oraya tekrar
-- kurulmaz: applyTemplatesToWeek gün|saat|kategori|başlık anahtarıyla mükerrer
-- kaydı eler.
--
-- Idempotent: id içerikten türetilir (md5 → uuid) + on conflict do nothing.
-- Aktarım fonksiyon içinde, çünkü yerel `db reset`te migration'lar seed.sql'den
-- ÖNCE koşar ve o an workspace henüz yoktur; seed.sql sonunda tekrar çağrılır.
-- ============================================================================

create or replace function public.af_import_planning_templates()
returns text language plpgsql as $fn$
declare
  v_ws       uuid;
  v_actor    uuid;
  v_ws_count int;
  r          record;
  v_n        int := 0;
begin
  select id into v_ws from public.workspaces where name = 'AF Operasyon' order by created_at limit 1;
  if v_ws is null then
    select count(*) into v_ws_count from public.workspaces;
    if v_ws_count = 1 then
      select id into v_ws from public.workspaces limit 1;
    end if;
  end if;
  if v_ws is null then
    return 'Planlama şablonu atlandı: hedef çalışma alanı bulunamadı.';
  end if;

  select wm.user_id into v_actor
  from public.workspace_members wm
  where wm.workspace_id = v_ws
  order by case wm.role when 'owner' then 0 when 'admin' then 1 else 2 end, wm.joined_at
  limit 1;

  for r in
    select * from (values
      -- ── 09:00 ÜRETİM ───────────────────────────────────────────────────
      (0, '09:00'::text, 'uretim'::text,    'Ready to Wear'::text),
      (1, '09:00',       'uretim',          'One of a kind / Upcycle'),
      (2, '09:00',       'uretim',          'Accessories'),
      (3, '09:00',       'uretim',          'Satın Alma'),
      (4, '09:00',       'uretim',          'Rapor & Arge'),
      (5, '09:00',       'uretim',          'Calls'),
      -- ── 10:00 MARKETING ────────────────────────────────────────────────
      (0, '10:00',       'marketing',       'Celebrity'),
      (1, '10:00',       'marketing',       'Interviews'),
      (2, '10:00',       'marketing',       'AI / Sales & Marketing'),
      (3, '10:00',       'marketing',       'Celebrity'),
      (4, '10:00',       'marketing',       'Rapor & Arge'),
      (5, '10:00',       'marketing',       'Outside Meetings'),
      -- ── 11:00 SALES ────────────────────────────────────────────────────
      (0, '11:00',       'sales',           'AFCOM'),
      (1, '11:00',       'sales',           'İç piyasa & İhracat'),
      (2, '11:00',       'sales',           'Bireysel Müşteri'),
      (3, '11:00',       'sales',           'Finance'),
      (4, '11:00',       'sales',           'Rapor & Arge'),
      (5, '11:00',       'sales',           'KOOP'),
      -- ── 12:00 SİSTEM / AI ──────────────────────────────────────────────
      (0, '12:00',       'system',          'AFCOM'),
      (2, '12:00',       'system',          'AF Operational System'),
      (4, '12:00',       'system',          'Filinta Methodogy')
    ) as t(wd, slot, cat, title)
  loop
    insert into public.planning_templates (
      id, workspace_id, weekday, time_slot, category, title, content,
      participant_ids, position, active, created_by, updated_by
    ) values (
      md5('af-plan-template|' || r.wd || '|' || r.slot || '|' || r.cat)::uuid,
      v_ws, r.wd, r.slot, r.cat, r.title, null,
      '{}'::uuid[], 0, true, v_actor, v_actor
    )
    on conflict (id) do nothing;
    if found then v_n := v_n + 1; end if;
  end loop;

  return format('Planlama şablonu: %s satır eklendi (haftalık ritim).', v_n);
end $fn$;

do $$
declare v_msg text;
begin
  select public.af_import_planning_templates() into v_msg;
  raise notice '%', v_msg;
end $$;

revoke all on function public.af_import_planning_templates() from public, anon, authenticated;
