-- ============================================================================
-- Mükerrer kimlik: CRM kişisini sistem hesabına bağla
-- ----------------------------------------------------------------------------
-- Aslı Hanım (2026-08-24):
--   "Aslı Filinta ve Aslı Hanım aynı kişi."
--   "Nisa / Nisa Hanım aynı kişi."
--
-- Aynı insan hem ÜYE (sistem hesabı) hem CRM KİŞİSİ olarak kayıtlıydı. Sonuç:
-- pano kişi ızgarasında iki ayrı kart çıkıyor ve o kişinin işleri ikiye
-- bölünüyordu — birine tıklayınca diğerindeki işler görünmüyordu.
--
-- Birleştirme mekanizması kodda zaten var (workspace_contacts.user_id →
-- buildAssignablePeople). Bu migration yalnızca YUKARIDA ONAYLANAN iki çifti
-- bağlar; kimseyi tahminle birleştirmez.
--
-- GÜVENLİK: eşleşme TAM AD üzerinden yapılır ve yalnızca
--   • kişi henüz bağlanmamışsa (user_id null),
--   • o ada sahip TEK BİR üye varsa
-- uygulanır. Üretimde adlar farklı yazılmışsa hiçbir şey olmaz — o durumda
-- eşleştirme CRM ekranından elle yapılır (öneri motoru artık ilk adı da
-- görüyor, bkz. ContactMatchingPanel).
--
-- Idempotent: bağlı kişiye ikinci kez dokunulmaz.
--
-- FONKSİYON, çünkü iki anda çalışması gerekir:
--   * prod / dolu veritabanı → bu dosya uygulanırken hemen,
--   * yerel `supabase db reset` → migration'lar seed.sql'den ÖNCE koştuğu için
--     kişiler henüz yokken; seed.sql sonunda aynı fonksiyon çağrılır.
--
-- VERİ TAŞINMAZ. Kişiye atanmış görevler olduğu yerde kalır; pano bunları
-- birleştirilen üyenin kartında gösterir (applyPersonFilter → mergedContactOf).
-- Bağ kaldırılırsa her şey eski hâline döner — geri alınabilir bir işlem.
-- ============================================================================

create or replace function public.link_duplicate_contacts()
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r         record;
  v_user    uuid;
  v_hits    int;
  v_linked  int := 0;
begin
  for r in
    select * from (values
      ('Aslı Hanım'::text,  'Aslı Filinta'::text),
      ('Nisa Hanım',        'Nisa')
    ) as t(contact_name, member_name)
  loop
    -- Ada sahip üye TEK mi? (min(uuid) yok — sayım ve seçim ayrı sorgu)
    select count(*)
      into v_hits
    from public.profiles p
    join public.workspace_members wm on wm.user_id = p.id
    where lower(btrim(p.full_name)) = lower(btrim(r.member_name));

    select p.id
      into v_user
    from public.profiles p
    join public.workspace_members wm on wm.user_id = p.id
    where lower(btrim(p.full_name)) = lower(btrim(r.member_name))
    limit 1;

    if v_hits <> 1 or v_user is null then
      raise notice 'Atlandı: "%" adına sahip tek bir üye bulunamadı (% eşleşme).',
        r.member_name, v_hits;
      continue;
    end if;

    update public.workspace_contacts c
       set user_id = v_user,
           updated_at = now()
     where lower(btrim(c.name)) = lower(btrim(r.contact_name))
       and c.user_id is null
       and c.workspace_id = (
         select wm.workspace_id from public.workspace_members wm
         where wm.user_id = v_user limit 1
       );

    if found then
      v_linked := v_linked + 1;
      raise notice 'Bağlandı: CRM kişisi "%" → sistem hesabı "%".', r.contact_name, r.member_name;
    end if;
  end loop;

  return format('Mükerrer kimlik bağlama: %s kişi sistem hesabına bağlandı.', v_linked);
end $fn$;

select public.link_duplicate_contacts();

grant execute on function public.link_duplicate_contacts() to service_role;
