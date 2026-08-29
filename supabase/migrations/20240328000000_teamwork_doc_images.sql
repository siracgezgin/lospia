-- ---------------------------------------------------------------------------
-- AF Teamwork yazılarının SATIR İÇİ GÖRSELLERİ.
--
-- Aslı Hanım (2026-08-29): "Word'de yazı rengi vs ekleyemiyor muyuz, ya da
-- resim vs."
--
-- Neden AYRI bir bucket:
--   • `documents` bucket'ı bilerek PRIVATE (sözleşme, fatura) ve okuma imzalı
--     URL ile yapılıyor. İmzalı URL 60 saniyede sönüyor — yazının gövdesine
--     gömülen <img src> ertesi gün kırık çıkardı.
--   • Satır içi görsel ILLUSTRASYONDUR; `production-sheets` bucket'ı da aynı
--     gerekçeyle public (bkz. 20240213). Yol UUID içerir, tahmin edilemez.
--   • .doc olarak indirilen yazının Word'de açıldığında görselleri görünsün
--     diye kalıcı bir URL şart (data: URI'yi Word güvenilir şekilde çizmiyor).
--
-- Hassas bir belge PAYLAŞILMAMALIYSA yazının içine gömülmez; dosya olarak
-- `documents` bucket'ına yüklenir. Ayrım bilinçli.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('teamwork-images', 'teamwork-images', true, 5242880)   -- 5 MB
on conflict (id) do update set public = true, file_size_limit = 5242880;

-- SELECT: public — gövdedeki <img> render edilebilsin.
drop policy if exists "storage: teamwork-images public read" on storage.objects;
create policy "storage: teamwork-images public read"
  on storage.objects for select
  using (bucket_id = 'teamwork-images');

-- INSERT: workspace üyesi yalnız kendi workspace klasörüne yükler.
drop policy if exists "storage: teamwork-images members upload" on storage.objects;
create policy "storage: teamwork-images members upload"
  on storage.objects for insert
  with check (
    bucket_id = 'teamwork-images'
    and auth.uid() is not null
    and is_workspace_member((storage.foldername(name))[1]::uuid)
  );

-- DELETE: yükleyen ya da workspace admin.
drop policy if exists "storage: teamwork-images uploader or admin delete" on storage.objects;
create policy "storage: teamwork-images uploader or admin delete"
  on storage.objects for delete
  using (
    bucket_id = 'teamwork-images'
    and auth.uid() is not null
    and (
      owner = auth.uid()
      or is_workspace_admin((storage.foldername(name))[1]::uuid)
    )
  );
