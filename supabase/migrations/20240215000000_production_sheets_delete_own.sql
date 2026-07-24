-- =============================================================================
-- production_sheets — silme politikasını gevşet (oluşturan kendi föyünü silebilir)
-- =============================================================================
-- Önceki politika: admin her şeyi, üye YALNIZCA kendi 'draft' föyünü silebiliyordu.
-- İç ekip aracı için üye deneme föylerini de silebilmeli. Yeni kural: admin her
-- şeyi; üye kendi oluşturduğu föyü (statüden bağımsız) siler. İdempotent.
-- =============================================================================

drop policy if exists "production_sheets: admin or draft author delete" on public.production_sheets;
drop policy if exists "production_sheets: admin or author delete" on public.production_sheets;
create policy "production_sheets: admin or author delete"
  on public.production_sheets for delete
  using (
    is_workspace_admin(workspace_id)
    or (is_workspace_member(workspace_id) and created_by = auth.uid())
  );
