-- ============================================================================
-- Dokümanlar — klasör ağacı + gerçek dosya yükleme
-- ----------------------------------------------------------------------------
-- Aslı Hanım (2026-08-19):
--   "Dökümanlarda… bizim burada işte Drive, Word, Excel hepsinin burada olduğu
--    böyle klasör şeklinde ayırmayı düşündüm de, şimdi bunu database'de tutmak
--    maliyeti açısından hesaplamadım henüz. Eğer çok maliyet çıkmayacaksa…
--    burayı o şekilde kullanabiliriz Drive gibi. Ona bir bak."
--   "Dökümanlara herkesin erişimi olmayacak; şu an bir tek yönetici görebiliyor."
--
-- MALİYET ARAŞTIRMASI YAPILDI (bkz. dokuman_depolama_maliyeti.md):
-- Supabase Pro planında 100 GB dosya depolama zaten DAHİL. AF'nin gerçekçi
-- hacmi ~8,7 GB/yıl → dahil kota 11 yıl yeter. Ek maliyet ₺0. Cevap: yapılmalı.
--
-- Bugüne kadar bu modül dosya SAKLAMIYORDU; 20240207'nin kendi notu:
--   "No file storage — documents hold URLs/metadata only"
-- Yani yalnız dış bağlantı (Drive linki) ve zengin metin tutuluyordu.
--
-- İki ekleme:
--   document_folders  → klasör AĞACI (kendine referanslı)
--   operation_documents.folder_id + dosya alanları
--
-- Dosya sınırı 25 MB: ham çekim fotoğrafı (RAW) sisteme girmemeli — sisteme
-- giren, İŞİN PARÇASI olan dosya olmalı. Sınır bunu kendiliğinden sağlar.
--
-- İdempotent: create-if-not-exists / drop-if-exists + create.
-- ============================================================================

create table if not exists public.document_folders (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- Kendine referans: klasör içinde klasör. Silme RESTRICT — dolu klasör
  -- yanlışlıkla silinip içindekiler öksüz kalmasın.
  parent_id    uuid references public.document_folders(id) on delete restrict,
  name         text not null check (char_length(name) between 1 and 200),
  -- Erişim: 'all' = tüm üyeler, 'admin' = yalnız yönetici.
  -- Aslı Hanım'ın "herkesin erişimi olmayacak" isteğinin karşılığı; varsayılan
  -- ADMIN çünkü bugünkü davranış bu — modül açılınca içerik sızmasın.
  visibility   text not null default 'admin' check (visibility in ('all','admin')),
  position     int not null default 0,
  created_by   uuid references public.profiles(id) on delete set null,
  updated_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- NOT: burada `unique (workspace_id, parent_id, name)` TEK BAŞINA YETMEZ.
  -- Postgres'te NULL ≠ NULL olduğu için parent_id null olan KÖK klasörler
  -- tekilleşmiyor; "Sözleşmeler" iki kez açılabiliyordu (yerel testte görüldü).
  -- Aşağıdaki kısmi indeks kök seviyeyi kapatıyor.
  unique (workspace_id, parent_id, name)
);

create unique index if not exists document_folders_root_name_idx
  on public.document_folders(workspace_id, name)
  where parent_id is null;

drop trigger if exists set_document_folders_updated_at on public.document_folders;
create trigger set_document_folders_updated_at
  before update on public.document_folders
  for each row execute function set_updated_at();

create index if not exists document_folders_workspace_idx
  on public.document_folders(workspace_id, parent_id, position);

-- ── Doküman → klasör + yüklenen dosya ──────────────────────────────────────
alter table public.operation_documents
  add column if not exists folder_id  uuid references public.document_folders(id) on delete set null,
  add column if not exists file_path  text,     -- storage yolu (silmek için)
  add column if not exists file_name  text,     -- kullanıcının gördüğü ad
  add column if not exists file_size  bigint,   -- byte
  add column if not exists file_mime  text;

create index if not exists operation_documents_folder_idx
  on public.operation_documents(workspace_id, folder_id);

comment on column public.operation_documents.file_path is
  'Supabase Storage yolu (documents bucket). Boşsa bu kayıt bir bağlantıdır, dosya değil.';

-- Yeni doküman tipi: yüklenmiş dosya. Mevcut check kısıtı isimsiz oluşturulmuş
-- olabilir; ada güvenmeden düşürüp yeniden kuruyoruz.
alter table public.operation_documents
  drop constraint if exists operation_documents_document_type_check;
alter table public.operation_documents
  add constraint operation_documents_document_type_check
  check (document_type in (
    'drive_link','google_doc','google_sheet','canva','figma','pdf_link',
    'word_link','excel_link','website','internal_note','other','file'
  ));

-- ---------------------------------------------------------------------------
-- RLS — klasör okuma görünürlüğe bağlı, yazma yönetici.
-- ---------------------------------------------------------------------------
alter table public.document_folders enable row level security;

drop policy if exists "document_folders: read by visibility" on public.document_folders;
create policy "document_folders: read by visibility"
  on public.document_folders for select
  using (
    is_workspace_member(workspace_id)
    and (visibility = 'all' or is_workspace_admin(workspace_id))
  );

drop policy if exists "document_folders: admin insert" on public.document_folders;
create policy "document_folders: admin insert"
  on public.document_folders for insert
  with check (is_workspace_admin(workspace_id));

drop policy if exists "document_folders: admin update" on public.document_folders;
create policy "document_folders: admin update"
  on public.document_folders for update
  using (is_workspace_admin(workspace_id))
  with check (is_workspace_admin(workspace_id));

drop policy if exists "document_folders: admin delete" on public.document_folders;
create policy "document_folders: admin delete"
  on public.document_folders for delete
  using (is_workspace_admin(workspace_id));

grant select, insert, update, delete on public.document_folders to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Storage bucket — dokümanlar. Föy görsellerinden FARKLI olarak PRIVATE:
-- sözleşme ve fatura herkese açık URL taşımamalı. Okuma imzalı URL ile yapılır.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 26214400)   -- 25 MB
on conflict (id) do update set public = false, file_size_limit = 26214400;

-- Yol her zaman {workspace_id}/... ile başlar; yetki oradan doğrulanır.
-- (auth.role() DEĞİL: proje genelinde çalışan desen auth.uid() + workspace
--  kontrolü — bkz. 20240213 production-sheets politikaları.)
drop policy if exists "storage: documents members read" on storage.objects;
create policy "storage: documents members read"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and auth.uid() is not null
    and is_workspace_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "storage: documents members upload" on storage.objects;
create policy "storage: documents members upload"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and auth.uid() is not null
    and is_workspace_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "storage: documents uploader or admin delete" on storage.objects;
create policy "storage: documents uploader or admin delete"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and auth.uid() is not null
    and (
      owner = auth.uid()
      or is_workspace_admin((storage.foldername(name))[1]::uuid)
    )
  );
