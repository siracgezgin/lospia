-- =============================================================================
-- Aslı Filinta Operasyon — Development Seed Data
-- =============================================================================
-- Applied automatically by: supabase db reset
--
-- Creates:
--   2 users (alice=Siraç, bob=Aslı Filinta) with profiles
--   1 workspace: AF Operasyon
--   2 workspace_members
--   3 custom field definitions
--   5 saved views
--   14 real Aslı Filinta project tasks (Lookbook, Erişim, Teknik SEO, GEO/AI)
--   2 workspace contacts (Nisa Hanım, Ebu Bekir Bey)
--   3 workspace notes
--
-- Login credentials (local Supabase):
--   alice@taskos.local  / password: TaskOS2024!  (profile: Siraç)
--   bob@taskos.local    / password: TaskOS2024!  (profile: Aslı Filinta)
-- =============================================================================

do $$
declare
  v_alice_id    uuid := '00000000-0000-0000-0000-000000000001';
  v_bob_id      uuid := '00000000-0000-0000-0000-000000000002';
  v_ws_id       uuid := '00000000-0000-0000-0000-000000000010';

  v_cf_text     uuid := '00000000-0000-0000-0000-000000000020';
  v_cf_select   uuid := '00000000-0000-0000-0000-000000000021';
  v_cf_bool     uuid := '00000000-0000-0000-0000-000000000022';

  v_sv_tum_isler   uuid := '00000000-0000-0000-0000-000000000030';
  v_sv_bana_ata    uuid := '00000000-0000-0000-0000-000000000034';
  v_sv_bu_hafta    uuid := '00000000-0000-0000-0000-000000000031';
  v_sv_gecikenler  uuid := '00000000-0000-0000-0000-000000000032';
  v_sv_tamamlanan  uuid := '00000000-0000-0000-0000-000000000033';

  v_contact_nisa uuid := '00000000-0000-0000-0000-000000000040';
  v_contact_ebu  uuid := '00000000-0000-0000-0000-000000000041';

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
  )
  on conflict (provider_id, provider) do nothing;

  -- -------------------------------------------------------------------------
  -- Profiles
  -- -------------------------------------------------------------------------
  insert into public.profiles (id, email, full_name) values
    (v_alice_id, 'alice@taskos.local', 'Siraç'),
    (v_bob_id,   'bob@taskos.local',   'Aslı Filinta')
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
    (v_ws_id, v_alice_id, 'owner'),
    (v_ws_id, v_bob_id,   'member')
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
    '["A — Lookbook", "B — Erişim", "B — Teknik SEO", "B — GEO / AI"]'::jsonb,
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
  )
  on conflict (id) do update set
    name     = excluded.name,
    config   = excluded.config,
    position = excluded.position;

  -- -------------------------------------------------------------------------
  -- Workspace contacts (non-auth collaborators)
  -- -------------------------------------------------------------------------
  insert into public.workspace_contacts (id, workspace_id, name, email, role_label) values
    (v_contact_nisa, v_ws_id, 'Nisa Hanım',    null, 'Tasarımcı'),
    (v_contact_ebu,  v_ws_id, 'Ebu Bekir Bey', null, 'Web Yöneticisi')
  on conflict (id) do nothing;

  -- -------------------------------------------------------------------------
  -- Tasks — real Aslı Filinta project tasks
  -- Status mapping: Başlamadı→backlog  Devam ediyor→in_progress  Bekliyor→blocked
  -- -------------------------------------------------------------------------

  -- ── A — Lookbook (5 tasks, Devam ediyor, deadline 11 Haziran 2026) ─────────

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
   '{"category": "A — Lookbook"}'::jsonb,
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
   '{"category": "A — Lookbook"}'::jsonb,
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
   '{"category": "A — Lookbook"}'::jsonb,
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
   '{"category": "A — Lookbook"}'::jsonb,
   'a3', v_alice_id);

  insert into public.tasks (workspace_id, title, description, status, priority,
    assignee_id, responsible_contact_id, due_date, tags, custom_fields, fractional_index, created_by)
  values
  (v_ws_id,
   'Aslı Hanım onayı → alıcıya gönderim',
   'Finalleşen lookbook' || chr(39) || 'u Aslı Hanım' || chr(39) || 'ın onayına sun, ardından alıcıya ilet.',
   'in_progress', 'urgent',
   v_bob_id, null,
   '2026-06-11',
   '{"lookbook","onay"}',
   '{"category": "A — Lookbook"}'::jsonb,
   'a4', v_alice_id);

  -- ── B — Erişim (2 tasks, Bekliyor/blocked, deadline 8 Haziran 2026) ────────

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
   jsonb_build_object('category', 'B — Erişim', 'collaborators', jsonb_build_array(v_contact_ebu::text)),
   'b0', v_alice_id);

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
   '{"category": "B — Erişim"}'::jsonb,
   'b1', v_alice_id);

  -- ── B — Teknik SEO (3 tasks, Başlamadı/backlog, deadline 18 Haziran 2026) ──

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
   '{"category": "B — Teknik SEO"}'::jsonb,
   'c0', v_alice_id);

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
   '{"category": "B — Teknik SEO"}'::jsonb,
   'c1', v_alice_id);

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
   '{"category": "B — Teknik SEO"}'::jsonb,
   'c2', v_alice_id);

  -- ── B — GEO / AI (4 tasks, Başlamadı/backlog, deadline 18 Haziran 2026) ────

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
   '{"category": "B — GEO / AI"}'::jsonb,
   'd0', v_alice_id);

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
   '{"category": "B — GEO / AI"}'::jsonb,
   'd1', v_alice_id);

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
   '{"category": "B — GEO / AI"}'::jsonb,
   'd2', v_alice_id);

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
   '{"category": "B — GEO / AI"}'::jsonb,
   'd3', v_alice_id);

  -- -------------------------------------------------------------------------
  -- Workspace notes
  -- -------------------------------------------------------------------------
  insert into public.workspace_notes (workspace_id, title, body, position, created_by)
  values (v_ws_id,
          'Lookbook sprint hedefi',
          'Deadline: 11 Haziran. Canva tasarımları + AI görseller + line sheet finali.',
          0, v_alice_id);

  insert into public.workspace_notes (workspace_id, title, body, position, created_by)
  values (v_ws_id,
          'SEO / GEO sprint',
          'Deadline: 18 Haziran. Önce erişimler, sonra baseline audit, sonra teknik düzeltmeler.',
          1, v_alice_id);

  insert into public.workspace_notes (workspace_id, title, body, position, created_by)
  values (v_ws_id,
          'Kritik: Ebu Bekir onayı',
          'WordPress admin erişimi i' || chr(231) || 'in Ebu Bekir Bey' || chr(39) || 'den onay bekleniyor.',
          2, v_bob_id);

end $$;
