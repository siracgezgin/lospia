-- ============================================================================
-- KAPALI KLASÖR, İÇİNDEKİLERİ DE KAPATIR
--
-- BELİRTİ: Yönetici bir klasörü ⋯ menüsünden "Yalnız yöneticiye kapat" yapıyor.
-- Klasör üyenin ekranından kalkıyor, yönetici de işin bittiğini sanıyor. Oysa
-- içindekiler kalkmıyor:
--   · Üye arama kutusuna dosyanın adının bir parçasını yazınca dosya listeye
--     düşüyor; satırın altındaki yol "AF Teamwork" yazıyor (gizli klasörün adı
--     görünmediği için kayıt kökteymiş gibi okunuyor),
--   · ⋯ menüsündeki "Bulunduğu klasöre git" üyeyi doğrudan gizli klasörün
--     İÇİNE sokuyor ve oradaki her şeyi normal liste olarak gösteriyor,
--   · Aynısı paylaşılan ya da elle yazılan /documents?f=<gizli-klasör-id>
--     adresiyle de oluyor,
--   · "İndir" de çalışıyor — dosya gerçekten iniyor.
--
-- KÖK NEDEN: GÖRÜNÜRLÜK ÜÇ TABLODA BİRBİRİNDEN HABERSİZ DURUYOR.
-- `document_folders.visibility` yalnız KLASÖR SATIRINI gizliyor;
-- `operation_documents` ve `operation_spreadsheets` okuma kuralları (20240344)
-- yalnız SATIRIN KENDİ `visibility` değerine bakıyor, kaydın hangi klasörde
-- durduğuna bakmıyor. Yüklenen dosya da kendi görünürlüğünü hiç yazmadığı için
-- (registerDocumentFile, lib/actions/document-files.ts) veritabanı varsayılanı
-- 'all' ile açılıyor. Yani gizli klasördeki HER kayıt üyeye açık bir satır.
--
-- Klasör ağacı iç içe olduğu için yalnız DOĞRUDAN üst klasöre bakmak da
-- yetmez: üstü 'admin', kendisi 'all' olan bir ALT klasörün içi yine açıkta
-- kalırdı. Bu yüzden karar ZİNCİRİN TAMAMINA bakılarak veriliyor.
--
-- YENİ KURAL: bir kayıt ancak KÖKE KADAR bütün klasörleri açıksa üyeye
-- görünür. Klasörün kendisi için de aynı — kapalı klasörün alt klasörü de
-- kapalıdır.
--
-- NE DEĞİŞMİYOR — bilerek:
--   · YÖNETİCİ her şeyi görmeye devam ediyor.
--   · HERKES KENDİ KAYDINI görmeye devam ediyor (`created_by = auth.uid()`).
--     Bu dal 20240334'ten beri var ve burada da korunuyor: yönetici bir klasörü
--     kapattığında üyenin oraya KENDİ koyduğu yazı gözünden silinmemeli —
--     kendi eklediği şeyin kaybolması, veri kaybı gibi okunur.
--   · Hiçbir satır güncellenmiyor, hiçbir sütun eklenmiyor/silinmiyor. Bu
--     migration YALNIZ OKUMA kurallarını değiştirir; veri olduğu yerde durur
--     ve gizlemeyi geri almak klasörü "Tüm üyelere göster" yapmak kadar kolay.
--
-- İdempotent: create-or-replace + drop-if-exists/create.
-- ============================================================================

-- ── Klasör zinciri: köke kadar hepsi açık mı? ───────────────────────────────
-- SECURITY DEFINER olmak zorunda: bu yardımcı document_folders'ın KENDİ okuma
-- kuralının içinden de çağrılıyor. RLS'e tabi olsaydı politika kendi kendini
-- çağırırdı; ayrıca gizli üst klasörü zaten göremediği için zinciri hiç
-- yürüyemez, her şeyi "açık" sanırdı.
--
-- Derinlik sınırı bir güvenlik kemeri: `parent_id` bir klasörün kendi altına
-- taşınmasını veritabanı düzeyinde engellemiyor. Böyle bir döngü oluşursa
-- özyineleme sonsuza kadar döner ve panelin TAMAMI kilitlenirdi.
create or replace function public.document_folder_open_to_members(p_folder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
-- Pahalı olduğunu planlayıcıya SÖYLÜYORUZ: okuma kuralındaki OR zincirinde
-- önce ucuz `is_workspace_admin`/`created_by` dalları denensin, ağaç yürüyüşü
-- yalnız gerekince çalışsın.
cost 500
as $$
  with recursive zincir as (
    select f.id, f.parent_id, f.visibility, 1 as derinlik
      from public.document_folders f
     where f.id = p_folder_id
    union all
    select ust.id, ust.parent_id, ust.visibility, z.derinlik + 1
      from public.document_folders ust
      join zincir z on z.parent_id = ust.id
     where z.derinlik < 32
  )
  -- Klasörsüz kayıt (folder_id null) KÖKTEDİR: zincir boş, sonuç açık.
  select coalesce(bool_and(visibility = 'all'), true) from zincir;
$$;

comment on function public.document_folder_open_to_members(uuid) is
  'Klasör ve bütün üst klasörleri tüm üyelere açık mı? folder_id null ise (kök) true.';

grant execute on function public.document_folder_open_to_members(uuid)
  to authenticated, service_role;

-- ── Klasör: kapalı klasörün alt klasörü de kapalıdır ────────────────────────
drop policy if exists "document_folders: read by visibility" on public.document_folders;
create policy "document_folders: read by visibility"
  on public.document_folders for select
  using (
    is_workspace_member(workspace_id)
    and (
      is_workspace_admin(workspace_id)
      or created_by = auth.uid()
      -- Kendi görünürlüğü ZİNCİRİN İÇİNDE zaten kontrol ediliyor.
      or public.document_folder_open_to_members(id)
    )
  );

-- ── Yazı · bağlantı · yüklenen dosya ────────────────────────────────────────
drop policy if exists "operation_documents: visible to admins, authors and members" on public.operation_documents;
create policy "operation_documents: visible to admins, authors and members"
  on public.operation_documents for select
  using (
    is_workspace_admin(workspace_id)
    or (is_workspace_member(workspace_id) and created_by = auth.uid())
    or (
      is_workspace_member(workspace_id)
      and visibility = 'all'
      and public.document_folder_open_to_members(folder_id)
    )
  );

-- ── Tablo ───────────────────────────────────────────────────────────────────
drop policy if exists "operation_spreadsheets: visible to admins, authors and members" on public.operation_spreadsheets;
create policy "operation_spreadsheets: visible to admins, authors and members"
  on public.operation_spreadsheets for select
  using (
    is_workspace_admin(workspace_id)
    or (is_workspace_member(workspace_id) and created_by = auth.uid())
    or (
      is_workspace_member(workspace_id)
      and visibility = 'all'
      and public.document_folder_open_to_members(folder_id)
    )
  );

-- ── GRANT'lar (proje kuralı — tablolar yeni değil, yine de açık yazılıyor) ──
grant select, insert, update, delete on public.document_folders        to authenticated, service_role;
grant select, insert, update, delete on public.operation_documents     to authenticated, service_role;
grant select, insert, update, delete on public.operation_spreadsheets  to authenticated, service_role;
