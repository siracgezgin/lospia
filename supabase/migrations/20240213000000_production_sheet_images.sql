-- =============================================================================
-- Üretim Föyü — görsel depolama (Supabase Storage)
-- =============================================================================
-- Föylere teknik çizim + kumaş/aksesuar/süsleme/dikiş fotoğrafları eklenebilsin
-- diye `production-sheets` adında public bir bucket ve workspace-scoped storage
-- politikaları. Yol düzeni: production-sheets/{workspace_id}/{sheet_id}/{uuid}.
--
-- Additive & idempotent. task-attachments bucket'ının politikalarıyla aynı desen
-- (20240101000000_initial_schema.sql). Public read: görseller publicUrl ile
-- render edilir; yol UUID olduğu için tahmin edilemez. Yazma/silme yalnızca
-- workspace üyesi/admin.
-- =============================================================================

-- Bucket (public read). Zaten varsa dokunma.
insert into storage.buckets (id, name, public)
values ('production-sheets', 'production-sheets', true)
on conflict (id) do nothing;

-- SELECT: public (görsel render'ı için). İsteğe bağlı olarak üye ile kısıtlanabilir.
drop policy if exists "storage: production-sheets public read" on storage.objects;
create policy "storage: production-sheets public read"
  on storage.objects for select
  using (bucket_id = 'production-sheets');

-- INSERT: workspace üyesi kendi workspace klasörüne yükler.
drop policy if exists "storage: production-sheets members upload" on storage.objects;
create policy "storage: production-sheets members upload"
  on storage.objects for insert
  with check (
    bucket_id = 'production-sheets'
    and auth.uid() is not null
    and is_workspace_member((storage.foldername(name))[1]::uuid)
  );

-- DELETE: yükleyen ya da workspace admin siler.
drop policy if exists "storage: production-sheets uploader or admin delete" on storage.objects;
create policy "storage: production-sheets uploader or admin delete"
  on storage.objects for delete
  using (
    bucket_id = 'production-sheets'
    and auth.uid() is not null
    and (
      owner = auth.uid()
      or is_workspace_admin((storage.foldername(name))[1]::uuid)
    )
  );
