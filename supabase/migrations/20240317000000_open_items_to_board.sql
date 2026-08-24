-- ============================================================================
-- Açık konular → Pano görevleri
-- ----------------------------------------------------------------------------
-- Aslı Hanım (2026-08-24), takvimin altındaki kişi sütunlarını göstererek:
--   "Bunun altında yazılar iş bölümü — mesela bak Gül'ün işlerini oraya
--    alacaksın, BOARDUNA alacaksın. Buradan çıkacak bunlar."
--
-- O blok Calendar'dan kaldırıldı (bkz. PlanningBoard). Bu migration isteğin
-- İKİNCİ yarısıdır: konular Pano'ya görev olarak taşınır. Aksi hâlde 61 satır
-- veritabanında kalır ve hiçbir ekrandan görünmez.
--
-- KÖK SEBEP — neden hiçbiri daha önce dönüşmemişti:
--   assignOpenItemAsTask() sahibi yalnız workspace_members içinde arıyordu
--   (_planning_person). Ama Selen, Gül, Kısmet, Nisa CRM KİŞİSİ olarak
--   kayıtlı, sistem kullanıcısı değil — dolayısıyla owner_user_id hep null
--   kaldı ve "göreve dönüştür" her seferinde "sistemde kayıtlı kullanıcı
--   değil" diyerek reddetti. Bu yüzden 61 satırın 61'i de task_id = null.
--   Oysa Pano kişi ızgarası zaten üyeler ∪ CRM kişileri üzerinden çalışıyor
--   ve tasks.responsible_contact_id tam olarak bunun için var.
--
-- Bu dosya iki şey yapar:
--   1. _planning_contact(): etiketi CRM kişisine çözen yardımcı
--      (_planning_person ile AYNI eşleşme kuralları: tam ad, baş harfler,
--       ilk-ad öneki — "Selen Ergül" → "Selen").
--   2. planning_open_items_to_tasks(): sahibi çözülebilen her AÇIK konuyu
--      bir göreve dönüştürür ve satırı o göreve bağlar.
--
-- Idempotent: yalnız `task_id is null` olan satırlar işlenir; görevi olan
-- satıra ikinci kez dokunulmaz. Tekrar çalıştırmak güvenlidir ve 0 döndürür.
--
-- SAHİBİ ÇÖZÜLEMEYEN satıra DOKUNULMAZ — sessizce görev üretip sahipsiz kart
-- bırakmaktansa satır defterde kalsın; fonksiyon kaç tane olduğunu söyler.
--
-- TARİH YOK: kaynak Excel'de bu konuların teslim tarihi yoktu. Görevler
-- tarihsiz açılır (Pano'da "—" görünür), tarihi yöneticiler panodan girer.
-- Aslı Hanım'ın "ismi, işi, tarihi" kuralının tarih ayağı elle tamamlanacak.
--
-- Durum senkronu 20240316 ile zaten kurulu: görev Tamamlandı'ya çekilince
-- bağlı konu kapanır, geri alınınca yeniden açılır.
-- ============================================================================

-- ── Etiket → CRM kişisi ─────────────────────────────────────────────────────
create or replace function public._planning_contact(p_ws uuid, p_code text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.workspace_contacts c
  where c.workspace_id = p_ws
    and coalesce(btrim(c.name), '') <> ''
    and coalesce(btrim(p_code), '') <> ''
    and (
      lower(btrim(c.name)) = lower(btrim(p_code))
      -- "Selen Ergül" → "Selen": etiket, kişi adıyla BAŞLIYORSA eşleşir.
      or (length(btrim(c.name)) >= 3 and lower(btrim(p_code)) like lower(btrim(c.name)) || ' %')
      -- "Nisa D" → "Nisa Hanım": kişi adı, etiketin ilk kelimesiyle başlıyorsa.
      or (length(btrim(p_code)) >= 3 and lower(btrim(c.name)) like lower(split_part(btrim(p_code), ' ', 1)) || ' %')
    )
  -- Tam eşleşme önce; sonra en kısa ad (en spesifik olan değil, en az varsayım).
  order by (lower(btrim(c.name)) = lower(btrim(p_code))) desc, length(c.name) asc
  limit 1;
$$;

-- ── Sıralama anahtarı ───────────────────────────────────────────────────────
-- tasks.fractional_index varsayılanı 'a0'dır; toplu insert 61 satıra AYNI
-- anahtarı verir ve panodaki sıra kararsız hâle gelir (sürükle-bırak da
-- yanlış yere yazar). fractional-indexing biçimi: ilk harf basamak sayısını
-- söyler ('a' = 1 basamak, 'b' = 2), gerisi base62 sayıdır. 'a' uzayında
-- yalnız 62 yer var ve bir kısmı dolu; bu yüzden aktarım 'b' uzayına yazar —
-- 3844 yer, hepsi mevcut 'a…' anahtarlarından SONRA sıralanır.
create or replace function public._frac_index_b(p_n int)
returns text
language sql
immutable
as $$
  select 'b'
      || substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', (p_n / 62) % 62 + 1, 1)
      || substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', p_n % 62 + 1, 1);
$$;

-- ── Aktarım ─────────────────────────────────────────────────────────────────
create or replace function public.planning_open_items_to_tasks(p_ws uuid default null)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_ws        uuid;
  v_actor     uuid;
  v_member_id uuid;
  v_task_id   uuid;
  v_moved     int := 0;
  v_skipped   int := 0;
  v_seq       int := 0;
  r           record;
begin
  -- Çalışma alanı: parametre verilmediyse açık konusu olan tek alan.
  v_ws := coalesce(
    p_ws,
    (select workspace_id from public.planning_open_items group by workspace_id
     order by count(*) desc limit 1)
  );
  if v_ws is null then
    return 'Açık konu yok — aktarılacak bir şey bulunamadı.';
  end if;

  -- Görevi kim oluşturmuş görünsün: alanın sahibi (yoksa ilk yönetici).
  select wm.user_id into v_actor
  from public.workspace_members wm
  where wm.workspace_id = v_ws and wm.role in ('owner', 'admin')
  order by (wm.role = 'owner') desc, wm.joined_at asc
  limit 1;

  /* ÜYE ÖNCE, CRM KİŞİSİ SONRA.
     Aynı insan hem üye hem CRM kişisi olabiliyor (ör. "Nisa" üye, "Nisa Hanım"
     kişi kartı). Görev ÜYEYE gitmeli: yalnız üyenin girişi, bildirimi ve
     "Bana atananlar" merceği vardır — CRM kişisine atanan iş kimseye
     düşmez. _planning_person tam ad / baş harf / "Ad " öneki arıyor; Excel
     etiketleri ise "Nisa D", "Selen Ergül" gibi soyadlı. Bu yüzden burada bir
     de İLK AD eşleşmesi denenir (etiketin ilk kelimesi = üyenin ilk adı).
     Üye bulunamazsa CRM kişisine düşülür. */
  for r in
    select oi.id,
           btrim(oi.text) as title,
           oi.owner_label,
           coalesce(
             oi.owner_user_id,
             public._planning_person(v_ws, oi.owner_label),
             (select p.id
                from public.workspace_members wm
                join public.profiles p on p.id = wm.user_id
               where wm.workspace_id = v_ws
                 and lower(split_part(btrim(p.full_name), ' ', 1))
                     = lower(split_part(btrim(oi.owner_label), ' ', 1))
                 and coalesce(btrim(p.full_name), '') <> ''
                 and coalesce(btrim(oi.owner_label), '') <> ''
               limit 1)
           ) as user_id,
           public._planning_contact(v_ws, oi.owner_label) as contact_id
    from public.planning_open_items oi
    where oi.workspace_id = v_ws
      and oi.task_id is null
      and oi.done = false
      and coalesce(btrim(oi.text), '') <> ''
    order by oi.position, oi.created_at
  loop
    -- Sahibi çözülemedi → dokunma, say ve geç.
    if r.user_id is null and r.contact_id is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- Üye çözüldüyse o sorumludur; yoksa CRM kişisi sorumludur.
    insert into public.tasks (
      workspace_id, title, status, assignee_id, responsible_contact_id,
      start_date, due_date, created_by, visibility, fractional_index
    ) values (
      v_ws,
      r.title,
      'ready',                                   -- Pano'da "Yapılacak" sütunu
      case when r.user_id is not null then r.user_id end,
      case when r.user_id is null then r.contact_id end,
      null,                                      -- başlangıç tarihi de yok
      null,                                      -- teslim tarihi elle girilecek
      v_actor,
      'workspace',                               -- herkes görsün (gizli iş değil)
      public._frac_index_b(v_seq)                -- her karta ayrı sıra anahtarı
    )
    returning id into v_task_id;
    v_seq := v_seq + 1;

    -- Sorumluluk modeli: üye ise katılımcı satırı da yazılır — Pano'daki kişi
    -- rozetleri ve "bana atananlar" merceği bu tablodan besleniyor.
    if r.user_id is not null then
      select wm.id into v_member_id
      from public.workspace_members wm
      where wm.workspace_id = v_ws and wm.user_id = r.user_id
      limit 1;

      if v_member_id is not null then
        insert into public.task_member_completions (workspace_id, task_id, member_id)
        values (v_ws, v_task_id, v_member_id)
        on conflict do nothing;
      end if;
    end if;

    update public.planning_open_items
      set task_id = v_task_id, updated_at = now()
      where id = r.id;

    v_moved := v_moved + 1;
  end loop;

  return format(
    'Açık konular Pano''ya taşındı: %s görev oluşturuldu, %s satır sahibi çözülemediği için bırakıldı.',
    v_moved, v_skipped
  );
end $fn$;

-- Uygula (prod'da bu dosya çalışırken; yerelde seed.sql sonrası tekrar
-- çağrılabilir — idempotent).
select public.planning_open_items_to_tasks();

grant execute on function public._planning_contact(uuid, text)          to authenticated, service_role;
grant execute on function public._frac_index_b(int)                     to authenticated, service_role;
grant execute on function public.planning_open_items_to_tasks(uuid)     to service_role;
