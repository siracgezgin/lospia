-- Departman düzeltmeleri — Aslı Hanım'ın 2026-08-19 toplantısı.
--
-- Üç açık karar:
--   1) "Online demiyoruz, online'ın her şeyi AFCOM demek. Onun adı AFCOM
--       demek, öyle düzelt."               → E-ticaret / online satış → AFCOM
--   2) "Marketingi ben sales'ın altına soktum… Sales ve marketingi tek
--       kategori yaptım."                  → Pazarlama & İletişim, Satış'ın alt
--                                            departmanı olur (rengi de mavi olur)
--   3) Kısmet: Sales + Satın Alma + AFCOM; Selen: Üretim + Styling + üretim
--      takibi                              → eksik alt departmanlar açılır
--
-- İdempotent: her adım "varsa dokunma / yoksa ekle" biçiminde yazıldı; tekrar
-- çalıştırmak güvenlidir. Hiçbir satır SİLİNMEZ — yalnız yeniden adlandırılır
-- ve taşınır, böylece bağlı görevlerin department_id'si korunur.

do $$
declare
  ws record;
  v_satis   uuid;
  v_uretim  uuid;
  v_pazar   uuid;
  v_tasarim uuid;
begin
  for ws in select id from public.workspaces loop
    select id into v_satis   from public.workspace_departments
      where workspace_id = ws.id and parent_id is null and name = 'Satış & Ticaret';
    select id into v_uretim  from public.workspace_departments
      where workspace_id = ws.id and parent_id is null and name = 'Üretim & Tedarik Zinciri';
    select id into v_tasarim from public.workspace_departments
      where workspace_id = ws.id and parent_id is null and name = 'Tasarım & Yaratıcı Yön';

    -- ── 1) Online → AFCOM ────────────────────────────────────────────────
    -- Adı zaten AFCOM ise güncelleme 0 satır etkiler (idempotent).
    if v_satis is not null
       and not exists (
         select 1 from public.workspace_departments
         where workspace_id = ws.id and parent_id = v_satis and name = 'AFCOM')
    then
      update public.workspace_departments
         set name = 'AFCOM'
       where workspace_id = ws.id
         and parent_id = v_satis
         and name in ('E-ticaret / online satış', 'Online', 'AF Online', 'E-ticaret');
    end if;

    -- ── 2) Pazarlama & İletişim → Satış'ın altına ────────────────────────
    select id into v_pazar from public.workspace_departments
      where workspace_id = ws.id and name = 'Pazarlama & İletişim'
      order by (parent_id is null) desc limit 1;

    if v_pazar is not null and v_satis is not null then
      update public.workspace_departments
         set parent_id = v_satis,
             -- Rengi bırakılır: buildDeptMeta çocuk renk vermemişse ebeveynden
             -- miras alır; "sales ve marketing tek kategori" böyle okunur.
             color_key = null
       where id = v_pazar
         and parent_id is distinct from v_satis;

      -- Pazarlama'nın alt kalemleri kendi ebeveyninde kalır (torun olurlar);
      -- ızgara yalnız üst seviyeye bakar, veri kaybı yok.
    end if;

    -- ── 3) Aslı'nın dilindeki eksik alt departmanlar ─────────────────────
    if v_satis is not null then
      insert into public.workspace_departments (workspace_id, parent_id, name, position)
      values (ws.id, v_satis, 'Satın Alma', 10)
      on conflict (workspace_id, parent_id, name) do nothing;
    end if;

    if v_uretim is not null then
      insert into public.workspace_departments (workspace_id, parent_id, name, position)
      values
        (ws.id, v_uretim, 'Styling / Görsel Düzenleme', 10),
        (ws.id, v_uretim, 'Üretim Takibi',              11)
      on conflict (workspace_id, parent_id, name) do nothing;
    end if;

    -- ARGE — Gül Hanım'ın alanı ("Gül Hanım ARGE'de ve sales'ın altında
    -- marketingde"). Tasarım & Yaratıcı Yön altında yaşar.
    if v_tasarim is not null then
      insert into public.workspace_departments (workspace_id, parent_id, name, position)
      values (ws.id, v_tasarim, 'ARGE', 10)
      on conflict (workspace_id, parent_id, name) do nothing;
    end if;
  end loop;
end $$;

-- ── Planlama açık-konu satırlarındaki "Sales / Online" etiketi ────────────
-- NOT: kaynak aktarım (20240302) da AFCOM'a çevrildi; bu blok yalnız o
-- aktarımdan ÖNCE kurulmuş veritabanları için. Zaten AFCOM ise 0 satır etkiler.
update public.planning_open_items
   set owner_role = replace(owner_role, 'Online', 'AFCOM')
 where owner_role like '%Online%';

grant select, insert, update, delete on public.workspace_departments to authenticated;
grant all on public.workspace_departments to service_role;
