-- ---------------------------------------------------------------------------
-- AF TEAMWORK — ÜYE SAHİPLİĞİ ve GÖRÜNÜRLÜK
--
-- Sıraç (2026-08-30): "Üye kendi eklediği yazıyı, klasörü vs silebilme yetkisi
-- olsun. Bir de klasördeki gibi diğerlerinde de 'tüm üyelere göster' kısmı da
-- olsun."
--
-- İki eksik vardı:
--   1. SAHİPLİK. Üye yazı/tablo/dosya ekleyebiliyordu ama kendi eklediğini
--      silemiyordu: silme yalnız yöneticide ya da "taslak" durumundaydı.
--      Klasörü ise hiç açamıyordu. Kendi koyduğunu geri alamamak, ekranı
--      "benim değil" hissettiriyor.
--   2. GÖRÜNÜRLÜK. `visibility` yalnız document_folders'ta vardı; yazı, tablo
--      ve yüklenen dosya için "tüm üyelere göster" seçeneği yoktu.
--
-- Kural: bir kaydı YÖNETİCİ her zaman, ÜYE ise yalnız KENDİ oluşturduğunu
-- yönetir. Görünürlük 'all' (tüm üyeler) ya da 'admin' (yalnız yönetici).
--
-- Varsayılan bilerek 'all': bu sütun eklenmeden önce üyeler taslak olmayan
-- kayıtları zaten görüyordu. 'admin' varsayılanı, var olan belgeleri ertesi
-- gün üyelerin gözünden SİLERDİ — görünür bir veri kaybı gibi okunurdu.
--
-- İDEMPOTENT: tekrar çalıştırılabilir (if not exists / drop-if-exists + create).
-- ---------------------------------------------------------------------------

-- ── 1. Görünürlük sütunları ────────────────────────────────────────────────
alter table public.operation_documents
  add column if not exists visibility text not null default 'all';
alter table public.operation_spreadsheets
  add column if not exists visibility text not null default 'all';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'operation_documents_visibility_check'
  ) then
    alter table public.operation_documents
      add constraint operation_documents_visibility_check
      check (visibility in ('all','admin'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'operation_spreadsheets_visibility_check'
  ) then
    alter table public.operation_spreadsheets
      add constraint operation_spreadsheets_visibility_check
      check (visibility in ('all','admin'));
  end if;
end $$;

-- ── 2. operation_documents — okuma / silme ─────────────────────────────────
-- Okuma: yönetici her şeyi; üye 'all' olanları + KENDİ kayıtlarını görür.
-- (Taslak kuralı korunur: başkasının taslağı üyeye görünmez.)
drop policy if exists "operation_documents: visible to admins, authors and members" on public.operation_documents;
create policy "operation_documents: visible to admins, authors and members"
  on public.operation_documents for select
  using (
    is_workspace_admin(workspace_id)
    or (
      is_workspace_member(workspace_id)
      and created_by = auth.uid()
    )
    or (
      is_workspace_member(workspace_id)
      and visibility = 'all'
      and status <> 'draft'
    )
  );

-- Silme: yönetici her şeyi; üye KENDİ kaydını (durumdan bağımsız).
drop policy if exists "operation_documents: admins or draft author can delete" on public.operation_documents;
drop policy if exists "operation_documents: admins or author can delete" on public.operation_documents;
create policy "operation_documents: admins or author can delete"
  on public.operation_documents for delete
  using (
    is_workspace_admin(workspace_id)
    or (is_workspace_member(workspace_id) and created_by = auth.uid())
  );

-- Güncelleme: üye kendi kaydını yönetir (görünürlüğü de kendi değiştirir).
-- Durum kısıtı kalkar: kendi yazısını yayımladıktan sonra düzeltemiyordu.
drop policy if exists "operation_documents: admins or author can update" on public.operation_documents;
create policy "operation_documents: admins or author can update"
  on public.operation_documents for update
  using (
    is_workspace_admin(workspace_id)
    or (is_workspace_member(workspace_id) and created_by = auth.uid())
  )
  with check (
    is_workspace_admin(workspace_id)
    or (is_workspace_member(workspace_id) and created_by = auth.uid())
  );

-- ── 3. operation_spreadsheets — okuma / silme / güncelleme ─────────────────
drop policy if exists "operation_spreadsheets: visible to admins, authors and members" on public.operation_spreadsheets;
create policy "operation_spreadsheets: visible to admins, authors and members"
  on public.operation_spreadsheets for select
  using (
    is_workspace_admin(workspace_id)
    or (
      is_workspace_member(workspace_id)
      and created_by = auth.uid()
    )
    or (
      is_workspace_member(workspace_id)
      and visibility = 'all'
      and status <> 'draft'
    )
  );

drop policy if exists "operation_spreadsheets: admins or draft author can delete" on public.operation_spreadsheets;
drop policy if exists "operation_spreadsheets: admins or author can delete" on public.operation_spreadsheets;
create policy "operation_spreadsheets: admins or author can delete"
  on public.operation_spreadsheets for delete
  using (
    is_workspace_admin(workspace_id)
    or (is_workspace_member(workspace_id) and created_by = auth.uid())
  );

drop policy if exists "operation_spreadsheets: admins or author can update" on public.operation_spreadsheets;
create policy "operation_spreadsheets: admins or author can update"
  on public.operation_spreadsheets for update
  using (
    is_workspace_admin(workspace_id)
    or (is_workspace_member(workspace_id) and created_by = auth.uid())
  )
  with check (
    is_workspace_admin(workspace_id)
    or (is_workspace_member(workspace_id) and created_by = auth.uid())
  );

-- ── 4. document_folders — üye kendi klasörünü açar, yönetir, siler ─────────
-- Okuma kuralı DEĞİŞMEDİ ('all' + yönetici) ama üye kendi klasörünü de görmeli;
-- yoksa açtığı klasör kendi gözünden kaybolurdu.
drop policy if exists "document_folders: read by visibility" on public.document_folders;
create policy "document_folders: read by visibility"
  on public.document_folders for select
  using (
    is_workspace_member(workspace_id)
    and (
      visibility = 'all'
      or is_workspace_admin(workspace_id)
      or created_by = auth.uid()
    )
  );

drop policy if exists "document_folders: admin insert" on public.document_folders;
drop policy if exists "document_folders: member insert own" on public.document_folders;
create policy "document_folders: member insert own"
  on public.document_folders for insert
  with check (
    is_workspace_member(workspace_id)
    and (created_by is null or created_by = auth.uid())
  );

drop policy if exists "document_folders: admin update" on public.document_folders;
drop policy if exists "document_folders: admin or owner update" on public.document_folders;
create policy "document_folders: admin or owner update"
  on public.document_folders for update
  using (
    is_workspace_admin(workspace_id)
    or (is_workspace_member(workspace_id) and created_by = auth.uid())
  )
  with check (
    is_workspace_admin(workspace_id)
    or (is_workspace_member(workspace_id) and created_by = auth.uid())
  );

drop policy if exists "document_folders: admin delete" on public.document_folders;
drop policy if exists "document_folders: admin or owner delete" on public.document_folders;
create policy "document_folders: admin or owner delete"
  on public.document_folders for delete
  using (
    is_workspace_admin(workspace_id)
    or (is_workspace_member(workspace_id) and created_by = auth.uid())
  );

-- ── 5. Açık GRANT'lar (proje kuralı) ───────────────────────────────────────
grant select, insert, update, delete on public.operation_documents     to authenticated, service_role;
grant select, insert, update, delete on public.operation_spreadsheets  to authenticated, service_role;
grant select, insert, update, delete on public.document_folders        to authenticated, service_role;
