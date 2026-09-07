-- ---------------------------------------------------------------------------
-- ÜRETİCİ PANELİ  (Aslı Hanım, 2026-09-07)
--
--   "Sabri Bey bizim üreticimiz olacağı için ÜRETİCİYE DE BİR PANEL
--    verebilirsin. Çünkü ÜRÜNÜN DETAYLARINI GİRİP buradan alabilir veya direkt
--    mail gidebilir."
--   "Meral Hanım kalıpçımız, Sabri Bey üreticimiz — bunlar bizim DIŞARIDAN
--    çalıştığımız insanlar."
--
-- NEDEN YENİ BİR ROL DEĞİL:
--   workspace_role'e beşinci bir değer eklemek, `is_workspace_member()`
--   üzerinden kurulmuş BÜTÜN tabloların RLS'ini bir anda üreticiye açardı —
--   Sabri Bey finansı, panoyu, CRM'i görürdü. Dış taraf "az yetkili üye"
--   değildir; hiç üye değildir.
--
-- BUNUN YERİNE: FÖYE ÖZEL, SÜRELİ, İPTAL EDİLEBİLİR BİR BAĞLANTI.
--   Üretici tek bir föyü görür (fiyat hariç), not/detay yazar, indirir.
--   Erişim `token` ile olur; okuma/yazma iki SECURITY DEFINER fonksiyonla
--   yapılır. Tablolara anon GRANT verilmez, servis anahtarı kullanılmaz,
--   mevcut RLS'in tek satırı değişmez.
--
-- 2026-08-28'de AF "önce mail" demişti ("Bence mail olarak gitmesiyle başta
-- daha sağlıklı"); mail yolu DURUYOR (sendSheetToManufacturer). Panel onun
-- yerine değil, yanına geliyor — AF'nin kendi cümlesindeki "veya".
-- ---------------------------------------------------------------------------

create table if not exists public.production_portal_links (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  sheet_id          uuid not null references public.production_sheets(id) on delete cascade,
  -- URL'deki gizli anahtar. Tahmin edilemez olmalı: uygulama 32 baytlık
  -- rastgele değer üretir.
  token             text not null unique check (char_length(token) between 20 and 128),
  manufacturer_name text,
  email             text,
  -- Üretici not/detay yazabilir mi? Kapalıyken panel salt okunurdur.
  can_write         boolean not null default true,
  -- Süre dolduğunda bağlantı ölür. null = süresiz (yine iptal edilebilir).
  expires_at        timestamptz,
  revoked_at        timestamptz,
  opened_at         timestamptz,      -- ilk açılış
  last_seen_at      timestamptz,      -- son açılış
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists production_portal_links_sheet_idx
  on public.production_portal_links (workspace_id, sheet_id);

-- Üreticinin PANELDEN girdiği detaylar. Föyün kendisine yazmaz: ekip önce
-- okur, isterse föye işler. ("Ürünün detaylarını girip buradan alabilir.")
create table if not exists public.production_portal_notes (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  link_id      uuid not null references public.production_portal_links(id) on delete cascade,
  sheet_id     uuid not null references public.production_sheets(id) on delete cascade,
  body         text not null check (char_length(body) between 1 and 4000),
  author_name  text,
  created_at   timestamptz not null default now()
);

create index if not exists production_portal_notes_sheet_idx
  on public.production_portal_notes (workspace_id, sheet_id, created_at desc);

comment on table public.production_portal_links is
  'Üretici paneli: bir üretim föyüne verilen süreli, iptal edilebilir dış erişim bağlantısı.';
comment on table public.production_portal_notes is
  'Üreticinin panelden girdiği detay/notlar. Föyü değiştirmez; ekip okur.';

-- ── RLS — bağlantıyı YALNIZ ekip yönetir ───────────────────────────────────
alter table public.production_portal_links enable row level security;
alter table public.production_portal_notes enable row level security;

drop policy if exists "portal_links: member read" on public.production_portal_links;
create policy "portal_links: member read"
  on public.production_portal_links for select
  using (is_workspace_member(workspace_id));

drop policy if exists "portal_links: admin insert" on public.production_portal_links;
create policy "portal_links: admin insert"
  on public.production_portal_links for insert
  with check (is_workspace_admin(workspace_id));

drop policy if exists "portal_links: admin update" on public.production_portal_links;
create policy "portal_links: admin update"
  on public.production_portal_links for update
  using (is_workspace_admin(workspace_id))
  with check (is_workspace_admin(workspace_id));

drop policy if exists "portal_links: admin delete" on public.production_portal_links;
create policy "portal_links: admin delete"
  on public.production_portal_links for delete
  using (is_workspace_admin(workspace_id));

drop policy if exists "portal_notes: member read" on public.production_portal_notes;
create policy "portal_notes: member read"
  on public.production_portal_notes for select
  using (is_workspace_member(workspace_id));

drop policy if exists "portal_notes: admin delete" on public.production_portal_notes;
create policy "portal_notes: admin delete"
  on public.production_portal_notes for delete
  using (is_workspace_admin(workspace_id));

-- Üretici INSERT'i politikadan geçmez; aşağıdaki SECURITY DEFINER fonksiyon
-- üzerinden yapılır (token doğrulanarak).

grant select, insert, update, delete on public.production_portal_links to authenticated;
grant select, delete on public.production_portal_notes to authenticated;
grant all on public.production_portal_links to service_role;
grant all on public.production_portal_notes to service_role;

-- ── Panelin okuma kapısı ───────────────────────────────────────────────────
-- Token geçerliyse föyün ÜRETİME GİDEN kısmını döndürür. FİYAT YOKTUR:
-- maliyet, birim fiyat ve para birimi hiçbir alanda geçmez (mail akışındaki
-- "Fiyat bilgisi gönderilmez" kuralının aynısı).
create or replace function public.production_portal_open(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link  public.production_portal_links%rowtype;
  v_sheet public.production_sheets%rowtype;
  v_bom   jsonb;
  v_notes jsonb;
begin
  select * into v_link
  from public.production_portal_links
  where token = p_token
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_link.revoked_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'revoked');
  end if;
  if v_link.expires_at is not null and v_link.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  select * into v_sheet
  from public.production_sheets
  where id = v_link.sheet_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Reçete: MALZEME ve MİKTAR evet, FİYAT hayır.
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'name', m.name,
             'code', m.code,
             'category', m.category,
             'composition', m.composition,
             'width_cm', m.width_cm,
             'unit', m.unit,
             'consumption', sm.consumption,
             'waste_pct', sm.waste_pct,
             'note', sm.note
           ) order by sm.position
         ), '[]'::jsonb)
    into v_bom
  from public.production_sheet_materials sm
  left join public.workspace_materials m on m.id = sm.material_id
  where sm.sheet_id = v_sheet.id;

  select coalesce(jsonb_agg(
           jsonb_build_object('body', n.body, 'author', n.author_name, 'at', n.created_at)
           order by n.created_at desc
         ), '[]'::jsonb)
    into v_notes
  from public.production_portal_notes n
  where n.link_id = v_link.id;

  update public.production_portal_links
     set opened_at = coalesce(opened_at, now()),
         last_seen_at = now()
   where id = v_link.id;

  return jsonb_build_object(
    'ok', true,
    'can_write', v_link.can_write,
    'manufacturer_name', v_link.manufacturer_name,
    'sheet', jsonb_build_object(
      'title', v_sheet.title,
      'product_code', v_sheet.product_code,
      'product_kind', v_sheet.product_kind,
      'producer', v_sheet.producer,
      'description', v_sheet.description,
      'season', v_sheet.season,
      'production_date', v_sheet.production_date,
      'delivery_date', v_sheet.delivery_date,
      'meterage', v_sheet.meterage,
      'measurements', v_sheet.measurements,
      'delivered_items', v_sheet.delivered_items,
      'size_distribution', v_sheet.size_distribution,
      'wash_instruction', v_sheet.wash_instruction,
      'fabric_lining', v_sheet.fabric_lining,
      'fabric_info', v_sheet.fabric_info,
      'accessories_info', v_sheet.accessories_info,
      'embellishments', v_sheet.embellishments,
      'sewing_instruction', v_sheet.sewing_instruction,
      'workmanship_notes', v_sheet.workmanship_notes,
      'production_waste', v_sheet.production_waste
    ),
    'bom', v_bom,
    'notes', v_notes
  );
end;
$$;

-- ── Panelin yazma kapısı — üreticinin girdiği detay ────────────────────────
create or replace function public.production_portal_add_note(
  p_token  text,
  p_body   text,
  p_author text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.production_portal_links%rowtype;
begin
  if p_body is null or char_length(btrim(p_body)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'empty');
  end if;
  if char_length(p_body) > 4000 then
    return jsonb_build_object('ok', false, 'reason', 'too_long');
  end if;

  select * into v_link
  from public.production_portal_links
  where token = p_token
  limit 1;

  if not found
     or v_link.revoked_at is not null
     or (v_link.expires_at is not null and v_link.expires_at < now())
     or not v_link.can_write then
    return jsonb_build_object('ok', false, 'reason', 'denied');
  end if;

  insert into public.production_portal_notes (workspace_id, link_id, sheet_id, body, author_name)
  values (
    v_link.workspace_id, v_link.id, v_link.sheet_id,
    btrim(p_body),
    nullif(btrim(coalesce(p_author, v_link.manufacturer_name, '')), '')
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.production_portal_open(text) from public;
revoke all on function public.production_portal_add_note(text, text, text) from public;
grant execute on function public.production_portal_open(text) to anon, authenticated;
grant execute on function public.production_portal_add_note(text, text, text) to anon, authenticated;
