-- ============================================================================
-- Planlama — yazma yetkisi yalnız yönetici (kullanıcı kararı, 2026-07-26)
-- ----------------------------------------------------------------------------
-- "Planlama kısmını sadece yönetici yapacak; üyeler sadece görecek."
-- Üyeler haftalık takvimi okumaya devam eder (select politikaları aynen
-- kalır); toplantı/konu ekleme-düzenleme-silme owner/admin'e kapanır.
-- Server action'larda aynı guard var; RLS veritabanı tarafındaki kapıdır.
-- planning_templates zaten admin-write (20240222). Idempotent.
-- ============================================================================

-- planning_meetings — eski üye-yazar politikaları kaldır
drop policy if exists "planning_meetings: members insert" on public.planning_meetings;
drop policy if exists "planning_meetings: members update" on public.planning_meetings;
drop policy if exists "planning_meetings: admin or author delete" on public.planning_meetings;

drop policy if exists "planning_meetings: admin insert" on public.planning_meetings;
create policy "planning_meetings: admin insert"
  on public.planning_meetings for insert
  with check (is_workspace_admin(workspace_id));

drop policy if exists "planning_meetings: admin update" on public.planning_meetings;
create policy "planning_meetings: admin update"
  on public.planning_meetings for update
  using (is_workspace_admin(workspace_id))
  with check (is_workspace_admin(workspace_id));

drop policy if exists "planning_meetings: admin delete" on public.planning_meetings;
create policy "planning_meetings: admin delete"
  on public.planning_meetings for delete
  using (is_workspace_admin(workspace_id));

-- planning_topics — aynı model
drop policy if exists "planning_topics: members insert" on public.planning_topics;
drop policy if exists "planning_topics: members update" on public.planning_topics;
drop policy if exists "planning_topics: admin or author delete" on public.planning_topics;

drop policy if exists "planning_topics: admin insert" on public.planning_topics;
create policy "planning_topics: admin insert"
  on public.planning_topics for insert
  with check (is_workspace_admin(workspace_id));

drop policy if exists "planning_topics: admin update" on public.planning_topics;
create policy "planning_topics: admin update"
  on public.planning_topics for update
  using (is_workspace_admin(workspace_id))
  with check (is_workspace_admin(workspace_id));

drop policy if exists "planning_topics: admin delete" on public.planning_topics;
create policy "planning_topics: admin delete"
  on public.planning_topics for delete
  using (is_workspace_admin(workspace_id));
