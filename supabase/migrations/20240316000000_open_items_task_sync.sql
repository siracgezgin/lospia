-- ---------------------------------------------------------------------------
-- Açık konu ↔ Görev: ÇİFT YÖNLÜ senkron
--
-- Aslı Hanım (2026-08-24): "Tamamlanmamış Eksik Konular board ile entegre
-- çalışmalı."
--
-- Bağ tek yönlüydü: açık konu "Göreve dönüştür" ile bir task üretiyordu
-- (planning_open_items.task_id), ama görev Board'da TAMAMLANDI'ya çekilince
-- konu açık kalmaya devam ediyordu. Sonuç: iş bitmiş ama konu defterinde hâlâ
-- açık görünüyor — "61 açık" sayısı gerçeği yansıtmıyor.
--
-- NEDEN TRIGGER, NEDEN UYGULAMA KODU DEĞİL:
--   Görev dört ayrı yerden tamamlanabiliyor (Pano sürükle-bırak, Liste, görev
--   detayı, toplu işlem). Senkronu uygulama katmanına yazmak dört yerde
--   tekrar ve er geç ayrışma demek. Veritabanı seviyesinde tek kural, hepsini
--   birden kapsar.
--
-- Kural:
--   • task.status → 'done'  ⇒ bağlı açık konu KAPANIR (done=true, done_at=now)
--   • task.status 'done' → başka bir şey ⇒ konu YENİDEN AÇILIR
--   • Görev silinirse bağ kopar (task_id null) — konu açık kalır, kaybolmaz.
-- ---------------------------------------------------------------------------

create or replace function public.sync_open_item_from_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Yalnız durum GEÇİŞİNDE çalış: her görev güncellemesinde konuya yazma.
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'done' then
    update public.planning_open_items
      set done = true,
          done_at = coalesce(new.completed_at, now()),
          updated_at = now()
      where task_id = new.id and done is distinct from true;
  elsif old.status = 'done' then
    update public.planning_open_items
      set done = false,
          done_at = null,
          updated_at = now()
      where task_id = new.id and done is distinct from false;
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_sync_open_item on public.tasks;
create trigger tasks_sync_open_item
  after update of status on public.tasks
  for each row
  execute function public.sync_open_item_from_task();

-- Görev silinince bağ kopsun; konu defterinden kayıt DÜŞMESİN.
-- (FK yerine trigger: tasks silinmesi planning_open_items'ı cascade etmemeli.)
create or replace function public.detach_open_item_from_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.planning_open_items
    set task_id = null, updated_at = now()
    where task_id = old.id;
  return old;
end;
$$;

drop trigger if exists tasks_detach_open_item on public.tasks;
create trigger tasks_detach_open_item
  before delete on public.tasks
  for each row
  execute function public.detach_open_item_from_task();

-- Geçmişi de hizala: hâlihazırda tamamlanmış göreve bağlı açık konular kapanır.
update public.planning_open_items oi
  set done = true,
      done_at = coalesce(t.completed_at, now()),
      updated_at = now()
  from public.tasks t
  where oi.task_id = t.id
    and t.status = 'done'
    and oi.done is distinct from true;

grant execute on function public.sync_open_item_from_task() to service_role;
grant execute on function public.detach_open_item_from_task() to service_role;
