-- =============================================================================
-- Aslı Filinta Operasyon — Development Seed Data
-- =============================================================================
-- Applied automatically by: supabase db reset
--
-- Creates:
--   4 users: alice=Siraç (owner), bob=Aslı Filinta (admin),
--            nisa@taskos.local (member), viewer@taskos.local (viewer)
--   1 workspace: AF Operasyon
--   4 workspace_members (roles: owner / admin / member / viewer)
--   3 custom field definitions
--   6 saved views (incl. Onay bekleyenler)
--   14 real Aslı Filinta project tasks
--   7 workspace contacts (Nisa, Ebu Bekir, Kısmet, Selen, Gül, Esin, Aslı)
--   3 workspace notes
--   4 workspace rules (example)
--
-- Login credentials (local Supabase):
--   alice@taskos.local   / password: TaskOS2024!  (profile: Siraç        — owner)
--   bob@taskos.local     / password: TaskOS2024!  (profile: Aslı Filinta — admin)
--   nisa@taskos.local    / password: TaskOS2024!  (profile: Nisa          — member)
--   viewer@taskos.local  / password: TaskOS2024!  (profile: Demo Viewer   — viewer)
-- =============================================================================

do $$
declare
  v_alice_id    uuid := '00000000-0000-0000-0000-000000000001';
  v_bob_id      uuid := '00000000-0000-0000-0000-000000000002';
  v_nisa_id     uuid := '00000000-0000-0000-0000-000000000003';
  v_viewer_id   uuid := '00000000-0000-0000-0000-000000000004';
  v_ws_id       uuid := '00000000-0000-0000-0000-000000000010';

  v_cf_text     uuid := '00000000-0000-0000-0000-000000000020';
  v_cf_select   uuid := '00000000-0000-0000-0000-000000000021';
  v_cf_bool     uuid := '00000000-0000-0000-0000-000000000022';

  v_sv_tum_isler   uuid := '00000000-0000-0000-0000-000000000030';
  v_sv_bana_ata    uuid := '00000000-0000-0000-0000-000000000034';
  v_sv_bu_hafta    uuid := '00000000-0000-0000-0000-000000000031';
  v_sv_gecikenler  uuid := '00000000-0000-0000-0000-000000000032';
  v_sv_tamamlanan  uuid := '00000000-0000-0000-0000-000000000033';
  v_sv_onay        uuid := '00000000-0000-0000-0000-000000000035';

  v_contact_nisa   uuid := '00000000-0000-0000-0000-000000000040';
  v_contact_ebu    uuid := '00000000-0000-0000-0000-000000000041';
  v_contact_kismet uuid := '00000000-0000-0000-0000-000000000042';
  v_contact_selen  uuid := '00000000-0000-0000-0000-000000000043';
  v_contact_gul    uuid := '00000000-0000-0000-0000-000000000044';
  v_contact_esin   uuid := '00000000-0000-0000-0000-000000000045';
  v_contact_asli   uuid := '00000000-0000-0000-0000-000000000046';

begin

  -- -------------------------------------------------------------------------
  -- Auth users
  -- -------------------------------------------------------------------------
  insert into auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_user_meta_data, raw_app_meta_data,
    role, aud,
    is_super_admin, is_sso_user,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values
  (
    v_alice_id,
    '00000000-0000-0000-0000-000000000000',
    'alice@taskos.local',
    crypt('TaskOS2024!', gen_salt('bf')),
    now(), now(), now(),
    '{"full_name": "Siraç"}'::jsonb,
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    'authenticated', 'authenticated',
    false, false,
    '', '', '', ''
  ),
  (
    v_bob_id,
    '00000000-0000-0000-0000-000000000000',
    'bob@taskos.local',
    crypt('TaskOS2024!', gen_salt('bf')),
    now(), now(), now(),
    '{"full_name": "Aslı Filinta"}'::jsonb,
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    'authenticated', 'authenticated',
    false, false,
    '', '', '', ''
  ),
  (
    v_nisa_id,
    '00000000-0000-0000-0000-000000000000',
    'nisa@taskos.local',
    crypt('TaskOS2024!', gen_salt('bf')),
    now(), now(), now(),
    '{"full_name": "Nisa"}'::jsonb,
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    'authenticated', 'authenticated',
    false, false,
    '', '', '', ''
  ),
  (
    v_viewer_id,
    '00000000-0000-0000-0000-000000000000',
    'viewer@taskos.local',
    crypt('TaskOS2024!', gen_salt('bf')),
    now(), now(), now(),
    '{"full_name": "Demo Viewer"}'::jsonb,
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    'authenticated', 'authenticated',
    false, false,
    '', '', '', ''
  )
  on conflict (id) do nothing;

  -- -------------------------------------------------------------------------
  -- Auth identities
  -- -------------------------------------------------------------------------
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values
  (
    gen_random_uuid(),
    v_alice_id,
    v_alice_id::text,
    jsonb_build_object(
      'sub',            v_alice_id::text,
      'email',          'alice@taskos.local',
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    now(), now(), now()
  ),
  (
    gen_random_uuid(),
    v_bob_id,
    v_bob_id::text,
    jsonb_build_object(
      'sub',            v_bob_id::text,
      'email',          'bob@taskos.local',
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    now(), now(), now()
  ),
  (
    gen_random_uuid(),
    v_nisa_id,
    v_nisa_id::text,
    jsonb_build_object(
      'sub',            v_nisa_id::text,
      'email',          'nisa@taskos.local',
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    now(), now(), now()
  ),
  (
    gen_random_uuid(),
    v_viewer_id,
    v_viewer_id::text,
    jsonb_build_object(
      'sub',            v_viewer_id::text,
      'email',          'viewer@taskos.local',
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    now(), now(), now()
  )
  on conflict (provider_id, provider) do nothing;

  -- -------------------------------------------------------------------------
  -- Profiles
  -- -------------------------------------------------------------------------
  insert into public.profiles (id, email, full_name) values
    (v_alice_id,  'alice@taskos.local',  'Siraç'),
    (v_bob_id,    'bob@taskos.local',    'Aslı Filinta'),
    (v_nisa_id,   'nisa@taskos.local',   'Nisa'),
    (v_viewer_id, 'viewer@taskos.local', 'Demo Viewer')
  on conflict (id) do nothing;

  -- -------------------------------------------------------------------------
  -- Workspace
  -- -------------------------------------------------------------------------
  insert into public.workspaces (id, name, slug, created_by) values
    (v_ws_id, 'AF Operasyon', 'af-operasyon', v_alice_id)
  on conflict (id) do update set name = excluded.name, slug = excluded.slug;

  -- -------------------------------------------------------------------------
  -- Workspace members
  -- -------------------------------------------------------------------------
  insert into public.workspace_members (workspace_id, user_id, role) values
    (v_ws_id, v_alice_id,  'owner'),
    (v_ws_id, v_bob_id,    'admin'),
    (v_ws_id, v_nisa_id,   'member'),
    (v_ws_id, v_viewer_id, 'viewer')
  on conflict (workspace_id, user_id) do nothing;

  -- -------------------------------------------------------------------------
  -- Custom field definitions
  -- -------------------------------------------------------------------------
  insert into public.custom_field_definitions (id, workspace_id, name, field_key, field_type, options, position) values
  (
    v_cf_text, v_ws_id, 'Bağlantı', 'external_link', 'text', null, 0
  ),
  (
    v_cf_select, v_ws_id, 'Kategori', 'category',
    'select',
    '["Lookbook", "Erişim", "Teknik SEO", "GEO / AI", "Kumaş Siparişi", "Üretim", "Operasyon", "Satın Alma", "Pazarlama"]'::jsonb,
    1
  ),
  (
    v_cf_bool, v_ws_id, 'Acil', 'urgent_flag', 'boolean', null, 2
  )
  on conflict (workspace_id, field_key) do nothing;

  -- -------------------------------------------------------------------------
  -- Saved views (5 operational tabs)
  -- -------------------------------------------------------------------------
  insert into public.saved_views (id, workspace_id, owner_id, name, config, is_shared, position) values
  (
    v_sv_tum_isler, v_ws_id, v_alice_id, 'Tüm işler',
    '{"filters": {}, "sort": {"field": "due_date", "direction": "asc"}, "view_type": "board"}'::jsonb,
    true, 0
  ),
  (
    v_sv_bana_ata, v_ws_id, v_alice_id, 'Bana atananlar',
    '{"filters": {"assignee": "me"}, "sort": {"field": "due_date", "direction": "asc"}, "view_type": "board"}'::jsonb,
    true, 1
  ),
  (
    v_sv_bu_hafta, v_ws_id, v_alice_id, 'Bu hafta',
    '{"filters": {"due_within_days": 7}, "sort": {"field": "due_date", "direction": "asc"}, "view_type": "list"}'::jsonb,
    true, 2
  ),
  (
    v_sv_gecikenler, v_ws_id, v_alice_id, 'Gecikenler',
    '{"filters": {"overdue": true}, "sort": {"field": "due_date", "direction": "asc"}, "view_type": "list"}'::jsonb,
    true, 3
  ),
  (
    v_sv_tamamlanan, v_ws_id, v_alice_id, 'Tamamlananlar',
    '{"filters": {"status": ["done"]}, "sort": {"field": "updated_at", "direction": "desc"}, "view_type": "list"}'::jsonb,
    true, 4
  ),
  (
    v_sv_onay, v_ws_id, v_alice_id, 'Onay bekleyenler',
    '{"filters": {"approval_required": true}, "sort": {"field": "due_date", "direction": "asc"}, "view_type": "board"}'::jsonb,
    true, 5
  )
  on conflict (id) do update set
    name     = excluded.name,
    config   = excluded.config,
    position = excluded.position;

  -- -------------------------------------------------------------------------
  -- Workspace contacts (non-auth collaborators)
  -- -------------------------------------------------------------------------
  insert into public.workspace_contacts (id, workspace_id, name, email, role_label) values
    (v_contact_nisa,   v_ws_id, 'Nisa Hanım',    null, 'Tasarımcı'),
    (v_contact_ebu,    v_ws_id, 'Ebu Bekir Bey', null, 'Web Yöneticisi'),
    (v_contact_kismet, v_ws_id, 'Kısmet',         null, 'Ekip Üyesi'),
    (v_contact_selen,  v_ws_id, 'Selen',          null, 'Ekip Üyesi'),
    (v_contact_gul,    v_ws_id, 'Gül',            null, 'Ekip Üyesi'),
    (v_contact_esin,   v_ws_id, 'Esin',           null, 'Ekip Üyesi'),
    (v_contact_asli,   v_ws_id, 'Aslı Hanım',     null, 'Yönetici')
  on conflict (id) do nothing;

  -- -------------------------------------------------------------------------
  -- Tasks — real Aslı Filinta project tasks
  -- Status mapping: Başlamadı→backlog  Devam ediyor→in_progress  Bekliyor→blocked
  -- -------------------------------------------------------------------------

  -- ── Lookbook (5 tasks, Devam ediyor, deadline 11 Haziran 2026) ─────────────

  insert into public.tasks (workspace_id, title, description, status, priority,
    assignee_id, responsible_contact_id, due_date, tags, custom_fields, fractional_index, created_by)
  values
  (v_ws_id,
   'Canva tasarımlarının bitirilmesi',
   'Lookbook için Canva üzerindeki tüm tasarımları tamamla ve son hale getir.',
   'in_progress', 'high',
   v_alice_id, null,
   '2026-06-11',
   '{"lookbook"}',
   '{"category": "Lookbook", "project": "Lookbook"}'::jsonb,
   'a0', v_alice_id);

  insert into public.tasks (workspace_id, title, description, status, priority,
    assignee_id, responsible_contact_id, due_date, tags, custom_fields, fractional_index, created_by)
  values
  (v_ws_id,
   'AI ile ürünlerin modele giydirilmesi',
   'Yapay zeka araçlarıyla ürün görsellerini model üzerinde oluştur.',
   'in_progress', 'high',
   null, v_contact_nisa,
   '2026-06-11',
   '{"lookbook"}',
   '{"category": "Lookbook", "project": "Lookbook"}'::jsonb,
   'a1', v_alice_id);

  insert into public.tasks (workspace_id, title, description, status, priority,
    assignee_id, responsible_contact_id, due_date, tags, custom_fields, fractional_index, created_by)
  values
  (v_ws_id,
   'Tasarım + görseller → Excel line sheet veri dökümü',
   'Tüm ürün tasarımlarını ve görsellerini alıcı line sheet Excel dosyasına aktar.',
   'in_progress', 'high',
   v_alice_id, null,
   '2026-06-11',
   '{"lookbook","excel"}',
   '{"category": "Lookbook", "project": "Lookbook"}'::jsonb,
   'a2', v_alice_id);

  insert into public.tasks (workspace_id, title, description, status, priority,
    assignee_id, responsible_contact_id, due_date, tags, custom_fields, fractional_index, created_by)
  values
  (v_ws_id,
   'Internal selection matrix + buyer line sheet finali',
   'İç seçim matrisini oluştur, alıcı line sheet' || chr(39) || 'ini finalleştir.',
   'in_progress', 'urgent',
   v_alice_id, null,
   '2026-06-11',
   '{"lookbook","buyer"}',
   '{"category": "Lookbook", "project": "Lookbook"}'::jsonb,
   'a3', v_alice_id);

  insert into public.tasks (workspace_id, title, description, status, priority,
    assignee_id, responsible_contact_id, due_date, tags, custom_fields, fractional_index, created_by,
    approval_required, approval_status, waiting_on_contact_id, waiting_reason)
  values
  (v_ws_id,
   'Aslı Hanım onayı → alıcıya gönderim',
   'Finalleşen lookbook' || chr(39) || 'u Aslı Hanım' || chr(39) || 'ın onayına sun, ardından alıcıya ilet.',
   'in_progress', 'urgent',
   v_bob_id, null,
   '2026-06-11',
   '{"lookbook","onay"}',
   '{"category": "Lookbook", "project": "Lookbook"}'::jsonb,
   'a4', v_alice_id,
   true, 'pending', v_contact_asli, 'Lookbook finali için Aslı Hanım onayı bekleniyor');

  -- ── Erişim (2 tasks, Bekliyor/blocked, deadline 8 Haziran 2026) ─────────────

  insert into public.tasks (workspace_id, title, description, status, priority,
    assignee_id, responsible_contact_id, due_date, tags, custom_fields, fractional_index, created_by)
  values
  (v_ws_id,
   'WordPress admin erişimi',
   'Ebu Bekir Bey' || chr(39) || 'den WordPress yönetici erişimi talep edildi; onay bekleniyor.',
   'blocked', 'urgent',
   v_alice_id, null,
   '2026-06-08',
   '{"erisim","wordpress"}',
   jsonb_build_object('category', 'Erişim', 'project', 'AF Online', 'collaborators', jsonb_build_array(v_contact_ebu::text)),
   'a5', v_alice_id);

  insert into public.tasks (workspace_id, title, description, status, priority,
    assignee_id, responsible_contact_id, due_date, tags, custom_fields, fractional_index, created_by)
  values
  (v_ws_id,
   'Google Search Console + Bing Webmaster erişimi',
   'GSC ve Bing Webmaster araçlarına erişim sağla.',
   'blocked', 'high',
   v_alice_id, null,
   '2026-06-08',
   '{"erisim","seo"}',
   '{"category": "Erişim", "project": "AF Online"}'::jsonb,
   'a6', v_alice_id);

  -- ── Teknik SEO (3 tasks, Başlamadı/backlog, deadline 18 Haziran 2026) ────────

  insert into public.tasks (workspace_id, title, description, status, priority,
    assignee_id, responsible_contact_id, due_date, tags, custom_fields, fractional_index, created_by)
  values
  (v_ws_id,
   'Baseline audit doldurma (Lighthouse + GSC)',
   'Lighthouse ve Google Search Console verileriyle SEO baseline raporunu tamamla.',
   'backlog', 'high',
   v_alice_id, null,
   '2026-06-18',
   '{"seo","audit"}',
   '{"category": "Teknik SEO", "project": "AF Online"}'::jsonb,
   'a7', v_alice_id);

  insert into public.tasks (workspace_id, title, description, status, priority,
    assignee_id, responsible_contact_id, due_date, tags, custom_fields, fractional_index, created_by)
  values
  (v_ws_id,
   'Öncelik-1 teknik düzeltmeler (meta, alt-text EN, sitemap, thumbnail)',
   'En kritik teknik SEO hatalarını gider: meta etiketleri, İngilizce alt-text, sitemap ve thumbnail.',
   'backlog', 'high',
   v_alice_id, null,
   '2026-06-18',
   '{"seo","teknik"}',
   '{"category": "Teknik SEO", "project": "AF Online"}'::jsonb,
   'a8', v_alice_id);

  insert into public.tasks (workspace_id, title, description, status, priority,
    assignee_id, responsible_contact_id, due_date, tags, custom_fields, fractional_index, created_by)
  values
  (v_ws_id,
   'JSON-LD enjeksiyonu (Organization + Person + Product)',
   'Siteye Organization, Person ve Product şema işaretlemelerini JSON-LD olarak ekle.',
   'backlog', 'medium',
   v_alice_id, null,
   '2026-06-18',
   '{"seo","schema"}',
   '{"category": "Teknik SEO", "project": "AF Online"}'::jsonb,
   'a9', v_alice_id);

  -- ── GEO / AI (4 tasks, Başlamadı/backlog, deadline 18 Haziran 2026) ──────────

  insert into public.tasks (workspace_id, title, description, status, priority,
    assignee_id, responsible_contact_id, due_date, tags, custom_fields, fractional_index, created_by)
  values
  (v_ws_id,
   'LLM visibility baseline testi (10 sorgu × 4 motor)',
   '4 farklı LLM motorunda (ChatGPT, Claude, Perplexity, Gemini) 10 marka sorgusuyla görünürlük testi yap.',
   'backlog', 'high',
   v_alice_id, null,
   '2026-06-18',
   '{"geo","llm","ai"}',
   '{"category": "GEO / AI", "project": "AF Online"}'::jsonb,
   'aA', v_alice_id);

  insert into public.tasks (workspace_id, title, description, status, priority,
    assignee_id, responsible_contact_id, due_date, tags, custom_fields, fractional_index, created_by)
  values
  (v_ws_id,
   'llms.txt + robots.txt güncelle (GPTBot, ClaudeBot, PerplexityBot, Google-Extended)',
   'Yapay zeka botlarına uygun crawl izinlerini robots.txt ve llms.txt dosyalarına ekle.',
   'backlog', 'medium',
   v_alice_id, null,
   '2026-06-18',
   '{"geo","robots","ai"}',
   '{"category": "GEO / AI", "project": "AF Online"}'::jsonb,
   'aB', v_alice_id);

  insert into public.tasks (workspace_id, title, description, status, priority,
    assignee_id, responsible_contact_id, due_date, tags, custom_fields, fractional_index, created_by)
  values
  (v_ws_id,
   'About Aslı Filinta sayfası revize',
   'Hakkında sayfasını LLM optimizasyonu için yapılandırılmış verilerle güncelle.',
   'backlog', 'medium',
   v_alice_id, null,
   '2026-06-18',
   '{"geo","icerik"}',
   '{"category": "GEO / AI", "project": "AF Online"}'::jsonb,
   'aC', v_alice_id);

  insert into public.tasks (workspace_id, title, description, status, priority,
    assignee_id, responsible_contact_id, due_date, tags, custom_fields, fractional_index, created_by)
  values
  (v_ws_id,
   'Mention.com hesabı + marka izleme başlat',
   'Mention.com hesabı aç, marka ve rakip anahtar kelimelerle izlemeyi başlat.',
   'backlog', 'low',
   v_alice_id, null,
   '2026-06-18',
   '{"geo","izleme"}',
   '{"category": "GEO / AI", "project": "AF Online"}'::jsonb,
   'aD', v_alice_id);

  -- -------------------------------------------------------------------------
  -- Workspace notes
  -- -------------------------------------------------------------------------
  insert into public.workspace_notes (workspace_id, title, body, color, position, created_by)
  values (v_ws_id,
          'Lookbook sprint hedefi',
          'Deadline: 11 Haziran. Canva tasarımları + AI görseller + line sheet finali.',
          'purple', 0, v_alice_id);

  insert into public.workspace_notes (workspace_id, title, body, color, position, created_by)
  values (v_ws_id,
          'SEO / GEO sprint',
          'Deadline: 18 Haziran. Önce erişimler, sonra baseline audit, sonra teknik düzeltmeler.',
          'blue', 1, v_alice_id);

  insert into public.workspace_notes (workspace_id, title, body, color, position, created_by)
  values (v_ws_id,
          'Kritik: Ebu Bekir onayı',
          'WordPress admin erişimi i' || chr(231) || 'in Ebu Bekir Bey' || chr(39) || 'den onay bekleniyor.',
          'yellow', 2, v_bob_id);

  -- -------------------------------------------------------------------------
  -- Workspace rules — example SOPs
  -- -------------------------------------------------------------------------
  insert into public.workspace_rules (workspace_id, title, body, category, is_active, position, created_by) values
  (v_ws_id,
   'Her sabah panoyu kontrol et',
   'Güne başlamadan önce panodaki görevleri gözden geçir. Geciken veya bloklanan var mı?',
   'Genel', true, 0, v_alice_id),
  (v_ws_id,
   'Kumaş siparişi verilmeden önce onay al',
   'Her kumaş siparişi verilmeden önce Aslı Hanım' || chr(39) || 'ın yazılı onayı alınmalıdır.',
   'Kumaş Siparişi', true, 0, v_alice_id),
  (v_ws_id,
   'Geciken görevleri aynı gün raporla',
   'Deadline geçen her görev için aynı gün sebep ve yeni tahmini tarih paylaş.',
   'Operasyon', true, 0, v_alice_id),
  (v_ws_id,
   'Üretim çıktıları haftalık fotoğrafla belgelensin',
   'Her hafta üretim aşamasından fotoğraf çekilerek dosyalanmalıdır.',
   'Üretim', true, 0, v_alice_id);

  -- -------------------------------------------------------------------------
  -- Üretim Föyleri — gerçek Aslı Filinta föyleri (21 Temmuz 2026 Excel'inden)
  -- Her ürün bir föy; created_by/updated_by farklı üyeler → "kim girdi" izi.
  -- Adetler + birim fiyatlar "Üretim Adetleri2307" sayfasının son hâli
  -- (Maliyet tablosu genel toplamı ₺233.400, KDV hariç).
  -- -------------------------------------------------------------------------
  insert into public.production_sheets
    (id, workspace_id, title, status, product_kind, producer, description,
     season, delivery_date, meterage,
     measurements, delivered_items, size_distribution,
     wash_instruction, fabric_lining, fabric_info, embellishments,
     sewing_instruction, workmanship_notes, qc_revision, revision_notes, production_waste,
     created_by, updated_by, category, subcategory, pricing)
  values
  ('00000000-0000-0000-0000-0000000000f1', v_ws_id,
   'Beyaz Dantel Etek', 'active', 'Etek', 'Hakan Günaydın', 'Beyaz Dantel Etek',
   '2026 RESORT', '21.07.2026', '1.60 CM',
   $j$[{"no":"1","label":"Etek kemer kalınlığı","value":"3 cm"},{"no":"2","label":"Medium Bel","value":"74 cm"},{"no":"3","label":"Asimetrik Etek uzunluk yan","value":""},{"no":"4","label":"Asimetrik Etek uzunluk ön","value":""},{"no":"5","label":"Arka görünüşü","value":""},{"no":"6","label":"Fermuar yeri","value":""}]$j$::jsonb,
   $j$[{"no":"1","label":"Karton Etiket","qty":""},{"no":"2","label":"Kalın Siyah Marka Etiketi","qty":""},{"no":"3","label":"40 cm Ekru fermuar","qty":""},{"no":"4","label":"Gold Düğme","qty":""},{"no":"5","label":"Naylon Poşet","qty":""}]$j$::jsonb,
   $j${"sizes":["XS-S","M-L","XL"],"rows":[{"label":"Beden etiketi","values":["1","2","3"],"total":""},{"label":"Üretim adeti","values":["18","18","12"],"total":"48"}]}$j$::jsonb,
   $t$% 100 Polyester Dry Clean Only. Beden etiketine dikilmeyecek, yan dikişe yıkama talimatı dikilecek, üzerine beden etiketini takılacak.$t$,
   $t$yıkama talimatı üstüne beden foto$t$,
   $t$Kumaş 1: Beyaz Dantel. Astar 1: Bedene takılı astarı yok, ayrı şort astarı olacak.$t$,
   $t$20 cm YKK Ekru Fermuar. Gold Agraf. AF Büyük marka etiketi, siyah renk. Önemli not: Beden etiketi yıkama talimatına takılacak.$t$,
   $t$Etek kemeri 3cm olacak. Eteklerin kemer kısımlarına 1 kat tela yapıştırılacak. Etek ucu son çalışılan numunedeki gibi ince kıvrılacak. İç dikişler bluzda kullanılan dikiş yapılacak. İki modelde de astar çalışması yapılmayacak. Dantel eteğin kemerinde fermuarın üstüne gold agraf takılacak sonra, gizli fermuar agraftan yarım cm aşağıya dikilecek. Dantel eteğin fermuar çevresi 30/1 ince beyaz şile bezinden artan kumaşlar ile biye yapılıp çevrilecek.$t$,
   $t$Overlok kullanılmayacak. İngiliz dikişi ile kapatılacak. Etek kıvırımları çok sağlam ve yarım cm'den daha kalın olmayacak.$t$,
   $t$21 Temmuz 2026 Salı günü 13:00 — Meral Öztürk$t$,
   $t$Dikişler genel olarak iyi bulundu. Eteğin arka fermuarına zigzag atılması eklendi.$t$,
   $t$Kumaş kesimde ve dikimde fire payı belirtilecek: 40 metre kumaş arttı.$t$,
   v_bob_id, v_nisa_id, 'ready_to_wear', 'trousers_skirts',
   $j${"unit_price":"500","currency":"TL"}$j$::jsonb),
  ('00000000-0000-0000-0000-0000000000f2', v_ws_id,
   'Beyaz Dantel Şalvar', 'active', 'Şalvar', 'Hakan Günaydın', 'Beyaz Dantel Şalvar',
   '2026 RESORT', '21.07.2026', '1.20 CM',
   $j$[{"no":"1","label":"Medium Bel","value":"74 cm"}]$j$::jsonb,
   $j$[{"no":"1","label":"Karton Etiket","qty":"34"},{"no":"2","label":"Kalın Siyah Marka Etiketi","qty":"34"},{"no":"3","label":"40 cm Ekru fermuar","qty":"34"},{"no":"4","label":"Naylon Poşet","qty":"34"}]$j$::jsonb,
   $j${"sizes":["XS","S","M","L","XL","XXL"],"rows":[{"label":"Beden etiketi","values":["0","5","12","12","5","0"],"total":""},{"label":"Üretim adeti","values":["0","5","12","12","5","0"],"total":"34"}]}$j$::jsonb,
   $t$% 100 Polyester Dry Clean Only. Beden etiketine dikilmeyecek, yan dikişe yıkama talimatı dikilecek, üzerine beden etiketini takılacak.$t$,
   $t$yıkama talimatı üstüne beden foto$t$,
   $t$Kumaş 1: Beyaz Dantel. Astar 1: Bedene takılı astarı yok, ayrı şort astarı olacak.$t$,
   $t$20 cm YKK Ekru Fermuar. AF Büyük marka etiketi, siyah renk. Önemli not: Beden etiketi yıkama talimatına takılacak.$t$,
   null, null, null, null, null,
   v_bob_id, v_bob_id, 'ready_to_wear', 'trousers_skirts',
   $j${"currency":"TL"}$j$::jsonb),
  ('00000000-0000-0000-0000-0000000000f3', v_ws_id,
   'Beyaz Dantel Bluz', 'active', 'Bluz', 'Hakan Günaydın', 'Beyaz Dantel Bluz',
   '2026 RESORT', '21.07.2026', null,
   $j$[{"no":"1","label":"Kol Ağzı Bitmişi","value":"30 cm"},{"no":"2","label":"XS-S Kemerin Bitmişi","value":"72 cm"},{"no":"3","label":"M-L Kemer","value":"74 cm"},{"no":"4","label":"XL Kemer","value":"76 cm"}]$j$::jsonb,
   $j$[{"no":"1","label":"Karton Etiket","qty":""},{"no":"2","label":"Kalın Siyah Marka Etiketi","qty":""},{"no":"3","label":"2,5 cm Gold Düğme","qty":"65 adet"}]$j$::jsonb,
   $j${"sizes":["XS-S","M-L","XL"],"rows":[{"label":"Üretim adeti","values":["20","20","16"],"total":"56"}]}$j$::jsonb,
   $t$% 100 Polyester Dry Clean Only$t$,
   null,
   $t$Kumaş 1: Beyaz Dantel$t$,
   $t$2,5 cm Gold Düğme$t$,
   $t$Bluz kemeri 2 cm daraltılacak. İngiliz dikişi yapılsın, yaka pervazında temiz dikiş yapılacak, beldeki ön kemerine 2.5 cm gold düğme dikilecek, ekru büyük etiket dikilecek. Beden etiketi yıkama talimatına takılacak. Kalıp aynı, marşet değişmeyecek. Yaka uçları eşit ve düzgün dışarıya çevrilecek. Pervaz dikişi 30/1 ince şile beziyle biye yapılacak.$t$,
   null, null, null, null,
   v_nisa_id, v_nisa_id, 'ready_to_wear', 'shirts_tops',
   $j${"unit_price":"500","currency":"TL"}$j$::jsonb),
  -- Excel'de adedi/fiyatı olan diğer ürünler — föy gövdesi henüz doldurulmadı,
  -- Maliyet tablosunun tam olması için beden dağılımı + birim fiyat girili.
  ('00000000-0000-0000-0000-0000000000f4', v_ws_id,
   'Ekru Çizgili Etek', 'active', 'Etek', 'Hakan Günaydın', 'Ekru Çizgili Etek',
   '2026 RESORT', '21.07.2026', null,
   '[]'::jsonb, '[]'::jsonb,
   $j${"sizes":["XS","S","M","L","XL"],"rows":[{"label":"Üretim adeti","values":["","3","3","6",""],"total":"12"}]}$j$::jsonb,
   null, null, null, null, null, null, null, null, null,
   v_bob_id, v_bob_id, 'ready_to_wear', 'trousers_skirts',
   $j${"unit_price":"500","currency":"TL"}$j$::jsonb),
  ('00000000-0000-0000-0000-0000000000f5', v_ws_id,
   'Ekru Çizgili Yelek', 'active', 'Yelek', 'Hakan Günaydın', 'Ekru Çizgili Yelek',
   '2026 RESORT', '21.07.2026', null,
   '[]'::jsonb, '[]'::jsonb,
   $j${"sizes":["XS","S","M","L","XL"],"rows":[{"label":"Üretim adeti","values":["","11","11","11","8"],"total":"41"}]}$j$::jsonb,
   null, null, null, null, null, null, null, null, null,
   v_bob_id, v_nisa_id, 'ready_to_wear', 'jackets_vests',
   $j${"unit_price":"600","currency":"TL"}$j$::jsonb),
  ('00000000-0000-0000-0000-0000000000f6', v_ws_id,
   'Siyah Yelek', 'active', 'Yelek', 'Hakan Günaydın', 'Siyah Yelek',
   '2026 RESORT', '21.07.2026', null,
   '[]'::jsonb, '[]'::jsonb,
   $j${"sizes":["XS","S","M","L","XL"],"rows":[{"label":"Üretim adeti","values":["","3","3","3","3"],"total":"12"}]}$j$::jsonb,
   null, null, null, null, null, null, null, null, null,
   v_nisa_id, v_nisa_id, 'ready_to_wear', 'jackets_vests',
   $j${"unit_price":"600","currency":"TL"}$j$::jsonb),
  ('00000000-0000-0000-0000-0000000000f7', v_ws_id,
   'Denim Yelek', 'active', 'Yelek', 'Hakan Günaydın', 'Denim Yelek',
   '2026 RESORT', '21.07.2026', null,
   '[]'::jsonb, '[]'::jsonb,
   $j${"sizes":["XS","S","M","L","XL"],"rows":[{"label":"Üretim adeti","values":["","18","13","13","6"],"total":"50"}]}$j$::jsonb,
   null, null, null, null, null, null, null, null, null,
   v_bob_id, v_bob_id, 'ready_to_wear', 'jackets_vests',
   $j${"unit_price":"600","currency":"TL"}$j$::jsonb),
  ('00000000-0000-0000-0000-0000000000f8', v_ws_id,
   'Çizgili Yelek', 'active', 'Yelek', 'Hakan Günaydın', 'Çizgili Yelek',
   '2026 RESORT', '21.07.2026', null,
   '[]'::jsonb, '[]'::jsonb,
   $j${"sizes":["XS","S","M","L","XL"],"rows":[{"label":"Üretim adeti","values":["","6","5","5","3"],"total":"19"}]}$j$::jsonb,
   null, null, null, null, null, null, null, null, null,
   v_nisa_id, v_bob_id, 'ready_to_wear', 'jackets_vests',
   $j${"unit_price":"600","currency":"TL"}$j$::jsonb),
  ('00000000-0000-0000-0000-0000000000f9', v_ws_id,
   'Vual Bej Şort Astar', 'active', 'Şort Astarı', 'Hakan Günaydın', 'Vual Bej Şort Astar',
   '2026 RESORT', '21.07.2026', null,
   '[]'::jsonb, '[]'::jsonb,
   $j${"sizes":["XS-S","M-L","XL"],"rows":[{"label":"Üretim adeti","values":["20","20","15"],"total":"55"}]}$j$::jsonb,
   null, null, null, null, null, null, null, null, null,
   v_bob_id, v_bob_id, 'ready_to_wear', 'trousers_skirts',
   $j${"unit_price":"200","currency":"TL"}$j$::jsonb),
  ('00000000-0000-0000-0000-0000000000fa', v_ws_id,
   'Şile Bezi Bluz', 'active', 'Bluz', 'Hakan Günaydın', 'Şile Bezi Bluz',
   '2026 RESORT', '21.07.2026', null,
   '[]'::jsonb, '[]'::jsonb,
   $j${"sizes":["One Size"],"rows":[{"label":"Üretim adeti","values":["27"],"total":"27"}]}$j$::jsonb,
   null, null, null, null, null, null, null, null, null,
   v_nisa_id, v_nisa_id, 'ready_to_wear', 'shirts_tops',
   $j${"unit_price":"400","currency":"TL"}$j$::jsonb),
  ('00000000-0000-0000-0000-0000000000fb', v_ws_id,
   'Şile Bezi Göynek', 'active', 'Göynek', 'Hakan Günaydın', 'Şile Bezi Göynek',
   '2026 RESORT', '21.07.2026', null,
   '[]'::jsonb, '[]'::jsonb,
   $j${"sizes":["One Size"],"rows":[{"label":"Üretim adeti","values":["69"],"total":"69"}]}$j$::jsonb,
   null, null, null, null, null, null, null, null, null,
   v_nisa_id, v_bob_id, 'ready_to_wear', 'shirts_tops',
   $j${"unit_price":"600","currency":"TL"}$j$::jsonb),
  ('00000000-0000-0000-0000-0000000000fc', v_ws_id,
   'Çizgili Göynek', 'active', 'Göynek', 'Hakan Günaydın', 'Çizgili Göynek',
   '2026 RESORT', '21.07.2026', null,
   '[]'::jsonb, '[]'::jsonb,
   $j${"sizes":["One Size"],"rows":[{"label":"Üretim adeti","values":["60"],"total":"60"}]}$j$::jsonb,
   null, null, null, null, null, null, null, null, null,
   v_bob_id, v_nisa_id, 'ready_to_wear', 'shirts_tops',
   $j${"unit_price":"650","currency":"TL"}$j$::jsonb)
  on conflict (id) do nothing;

end $$;

-- ---------------------------------------------------------------------------
-- Planlama — Aslı Hanım'ın aktif toplantı takvimi (17 – 23 Ağustos 2026).
-- Toplantı ızgarası + Tarih/Saat matrisi + kişi sütunları + Operasyon Kurgusu.
-- Aktarım migration'ı (20240302) çalışma alanından ÖNCE koştuğu için burada
-- çağrılır; idempotenttir, tekrar çalıştırmak mükerrer kayıt üretmez.
-- ---------------------------------------------------------------------------
do $$
declare v_msg text;
begin
  select public.af_import_planning_week_2026_08_17() into v_msg;
  raise notice '%', v_msg;
  -- Haftalık ritim şablonu — her haftanın iskeleti bundan kurulur.
  select public.af_import_planning_templates() into v_msg;
  raise notice '%', v_msg;
  -- Föylerdeki serbest metin üreticiyi gerçek usta kaydına bağla (20240307).
  select public.af_backfill_manufacturers() into v_msg;
  raise notice '%', v_msg;
  -- Aynısı sezon için (20240309).
  select public.af_backfill_seasons() into v_msg;
  raise notice '%', v_msg;
  -- Açık konular Pano'ya taşınır (20240317). Aslı Hanım: "Gül'ün işlerini
  -- boarduna alacaksın." Aktarım yukarıda daha yeni koştuğu için EN SONDA
  -- çağrılır; idempotenttir.
  select public.planning_open_items_to_tasks() into v_msg;
  raise notice '%', v_msg;
  -- Sorumlusu yalnız katılımcı satırında yazan görevleri onar (20240318).
  select public.backfill_assignee_from_participants() into v_msg;
  raise notice '%', v_msg;
  -- Aynı insanın mükerrer CRM kaydını sistem hesabına bağla (20240319).
  -- Aslı Hanım: "Aslı Filinta ve Aslı Hanım aynı kişi", "Nisa / Nisa Hanım aynı kişi".
  select public.link_duplicate_contacts() into v_msg;
  raise notice '%', v_msg;
end $$;
