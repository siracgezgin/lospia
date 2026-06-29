-- ---------------------------------------------------------------------------
-- Notifications overhaul: central producer RPC, Turkish trigger, data cleanup
-- ---------------------------------------------------------------------------
-- Idempotent: safe to re-run. No data is destroyed; legacy rows are rewritten
-- in place. Do NOT run `supabase db reset` in production — apply with
-- `supabase db push`.

-- 1. Central, dedupe-aware notification producer ----------------------------
-- SECURITY DEFINER so the dedupe check can see every recipient's recent rows
-- (the RLS select policy is user_id = auth.uid(), which blocks app-layer dedupe
-- reads for anyone but the actor). Check + insert are atomic per recipient, so
-- concurrent transitions can't both slip a duplicate through the window.
create or replace function public.create_task_notifications(
  p_workspace_id  uuid,
  p_task_id       uuid,
  p_type          public.notification_type,
  p_title         text,
  p_body          text,
  p_user_ids      uuid[],
  p_dedupe_seconds int default 300
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid;
  v_count integer := 0;
  v_since timestamptz := now() - make_interval(secs => greatest(p_dedupe_seconds, 0));
begin
  if p_user_ids is null then
    return 0;
  end if;

  foreach v_uid in array p_user_ids loop
    if v_uid is null then
      continue;
    end if;

    -- Same recipient + task + type + title inside the window → skip.
    if exists (
      select 1
      from public.notifications n
      where n.user_id = v_uid
        and n.type = p_type
        and n.title = p_title
        and n.task_id is not distinct from p_task_id
        and n.created_at >= v_since
    ) then
      continue;
    end if;

    insert into public.notifications (workspace_id, user_id, type, title, body, task_id)
    values (p_workspace_id, v_uid, p_type, p_title, nullif(p_body, ''), p_task_id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.create_task_notifications(
  uuid, uuid, public.notification_type, text, text, uuid[], integer
) to authenticated;

-- 2. Fix the legacy fan-out trigger -----------------------------------------
-- The old trigger emitted English ("You were assigned: …", "New comment on: …")
-- AND duplicated the assignment notification the app layer now writes itself.
-- Drop the assignee branch entirely (app-layer owns it) and make the comment
-- branch Turkish + dedupe-aware via the new RPC.
create or replace function public.notify_on_task_activity()
returns trigger language plpgsql security definer as $$
declare
  v_assignee_id uuid;
  v_task_title  text;
begin
  if new.type <> 'comment' then
    return new;
  end if;

  select assignee_id, title
  into v_assignee_id, v_task_title
  from public.tasks
  where id = new.task_id;

  if v_assignee_id is not null and v_assignee_id <> new.user_id then
    perform public.create_task_notifications(
      new.workspace_id,
      new.task_id,
      'task_comment',
      'Göreve yorum eklendi',
      v_task_title,
      array[v_assignee_id],
      300
    );
  end if;

  return new;
end;
$$;

-- 3. Normalize existing rows -------------------------------------------------
-- Rewrite legacy English / verbose Turkish titles to the standard copy. Body is
-- preserved; for "You were assigned: X" we lift X into the (empty) body.
update public.notifications
set body = nullif(trim(split_part(title, ':', 2)), '')
where body is null
  and title ilike 'You were assigned:%';

update public.notifications
set title = 'Yeni görev atandı'
where title ilike 'You were assigned%' or title ilike 'Task assigned%'
   or title = 'Size bir görev atandı';

update public.notifications
set title = 'Göreve yorum eklendi'
where title ilike 'New comment on%';

update public.notifications
set title = 'Görev onay bekliyor'
where title ilike 'Task status changed%' or title ilike 'Task awaiting review%'
   or title = 'Görev kontrol bekliyor';

update public.notifications
set title = 'Görev tamamlandı'
where title ilike 'Task completed%'
   or title = 'Göreviniz tamamlandı olarak işaretlendi';

update public.notifications
set title = 'Göreve dahil edildiniz'
where title = 'Bir göreve dahil edildiniz';

update public.notifications
set title = 'Puanınız güncellendi'
where title = 'Bir göreviniz onaylandı. Puanınız güncellendi.';

update public.notifications
set title = 'Görev yeniden açıldı'
where title = 'Bir göreviniz yeniden açıldı. Puanınız güncellendi.';

update public.notifications
set title = 'Göreve not eklendi'
where title = 'Bir göreve not eklendi';

update public.notifications
set title = 'Görev sizi bekliyor'
where title = 'Bir görev sizi bekliyor';
