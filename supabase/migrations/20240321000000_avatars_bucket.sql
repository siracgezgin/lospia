-- ============================================================================
-- Profil fotoğrafları — Supabase Storage
-- ----------------------------------------------------------------------------
-- Aslı Hanım (2026-08-24): "İkon kalkıp herkesin resmi gelecek. Artık kişiler
-- resmiyle görünecek. Resmi olmayan yine aynı şekilde — mesela Siraç Gezgin
-- SG gibi."
--
-- profiles.avatar_url kolonu vardı ama HİÇBİR ŞEY onu dolduramıyordu: ne bir
-- bucket, ne bir yükleme yolu. Kişiler bu yüzden ikonla çiziliyordu.
--
-- Yol düzeni: avatars/{user_id}/{uuid}.webp
-- Klasör adı kullanıcının kendi id'si — politika bunun üzerinden çalışır.
--
-- YETKİ: kişi kendi fotoğrafını yükler/siler; YÖNETİCİ herkesinkini
-- yükleyebilir (Aslı Hanım ekibin fotoğraflarını kendisi girecek —
-- "Ekip fotoğrafları olsun… Sen yap, sonra değiştiririz", 2026-08-19).
--
-- Public read: fotoğraf publicUrl ile render edilir; yol UUID içerdiği için
-- tahmin edilemez. task-attachments / production-sheets ile aynı desen.
-- Additive & idempotent.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- SELECT: public (img src ile render).
drop policy if exists "storage: avatars public read" on storage.objects;
create policy "storage: avatars public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Yardımcı: aktör bu kullanıcının fotoğrafına dokunabilir mi?
-- Kendisiyse evet; aynı çalışma alanının yöneticisiyse evet.
create or replace function public.can_manage_avatar_of(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() = p_user
    or exists (
      select 1
      from public.workspace_members me
      join public.workspace_members target
        on target.workspace_id = me.workspace_id
      where me.user_id = auth.uid()
        and me.role in ('owner', 'admin')
        and target.user_id = p_user
    );
$$;

drop policy if exists "storage: avatars self or admin upload" on storage.objects;
create policy "storage: avatars self or admin upload"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and public.can_manage_avatar_of((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "storage: avatars self or admin update" on storage.objects;
create policy "storage: avatars self or admin update"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and public.can_manage_avatar_of((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "storage: avatars self or admin delete" on storage.objects;
create policy "storage: avatars self or admin delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and public.can_manage_avatar_of((storage.foldername(name))[1]::uuid)
  );

grant execute on function public.can_manage_avatar_of(uuid) to authenticated, service_role;

-- profiles.avatar_url: kişi kendisininkini, yönetici herkesinkini yazabilmeli.
-- Mevcut profil politikaları yalnız "kendi satırı" izni veriyor olabilir; bu
-- yüzden yöneticinin yazma izni açıkça eklenir.
drop policy if exists "profiles: admin can update avatar" on public.profiles;
create policy "profiles: admin can update avatar"
  on public.profiles for update
  using (public.can_manage_avatar_of(id))
  with check (public.can_manage_avatar_of(id));
