-- ============================================================================
-- assignee_id onarımı: sorumlusu yalnız katılımcı satırında yazan görevler
-- ----------------------------------------------------------------------------
-- Aslı Hanım (2026-08-24):
--   "Tüm işler kısmına giriyorum, her kişinin görevi var. Ama board'da kişi
--    adına basıp girince görev yok."
--
-- SEBEP: sorumluluğun kanonik kaydı task_member_completions'tır, ama sistemin
-- yarısı hâlâ tek kişilik ESKİ alanı (tasks.assignee_id) okuyor — Ana
-- Sayfa'daki "Bana atanan görevler", Liste'nin "Bana atananlar" merceği,
-- CRM'deki "X görev" sayıları, pano kart renkleri. "Görev oluştur" penceresi
-- ise sorumluyu YALNIZCA katılımcı olarak yazıp assignee_id'yi null
-- bırakıyordu (createTask → setTaskParticipants). Sonuç: panelden açılan her
-- görev "Tüm işler"de görünüyor, hiçbir kişinin kartında çıkmıyordu.
--
-- Kalıcı çözüm koddadır (lib/actions/completions.ts): setTaskParticipants
-- artık assignee_id'yi katılımcı kümesiyle senkron tutuyor. Bu migration
-- GEÇMİŞ satırları onarır — aksi hâlde bugüne kadar açılmış görevler kayıp
-- kalmaya devam ederdi.
--
-- Kural: assignee_id boş VE en az bir katılımcı varsa, en eski katılımcı
-- (görevin ilk sorumlusu) assignee olur. Dolu assignee_id'ye DOKUNULMAZ.
-- Idempotent: ikinci çalıştırma 0 satır günceller. Fonksiyon olarak yazıldı ki
-- yerel `supabase db reset`'te seed.sql sonunda da çağrılabilsin (migration'lar
-- seed'den önce koşuyor, o an onarılacak satır yok).
-- ============================================================================

create or replace function public.backfill_assignee_from_participants()
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare v_fixed int;
begin
  with ilk_sorumlu as (
    select distinct on (c.task_id)
           c.task_id,
           wm.user_id
    from public.task_member_completions c
    join public.workspace_members wm on wm.id = c.member_id
    join public.tasks t on t.id = c.task_id
    where t.assignee_id is null
      and wm.user_id is not null
    order by c.task_id, c.created_at asc, c.id asc
  )
  update public.tasks t
     set assignee_id = s.user_id
    from ilk_sorumlu s
   where t.id = s.task_id
     and t.assignee_id is null;

  get diagnostics v_fixed = row_count;
  return format('assignee_id onarımı: %s görev katılımcısına bağlandı.', v_fixed);
end $fn$;

select public.backfill_assignee_from_participants();

grant execute on function public.backfill_assignee_from_participants() to service_role;
