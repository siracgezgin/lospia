-- ============================================================================
-- AF TEAMWORK: BİRİ EKLEYİNCE DİĞERLERİ DE DÜZENLEYEBİLSİN
--
-- Sıraç (2026-09-16): "Biri ekleyince dosyayı diğerleri de düzenleme
-- yapabilsin. Admin veya yönetici sadece istemezse o klasörü gizleyebilir. Ama
-- default olarak diğer kısımlar hem düzenleme hem ekleme yapılmalı. Calendar
-- dışında tabi, o da yöneticide."
--
-- NEREDE KALMIŞTIK: 20240344 GÖRMEYİ açtı (herkes her şeyi görüyor) ve
-- EKLEMEYİ açtı (üye kendi kaydını ekliyor). Ama YAZMA hâlâ "yönetici ya da
-- ekleyen" ile sınırlıydı. Sonuç ekranda şuydu: Kısmet AFCOM'u yükledi, tablo
-- herkese göründü, ama açan herkes "Salt okunur — içerik düzenleme yetkisi
-- tablo sahibine ve yöneticilere aittir" yazısıyla karşılaştı. Ortak çalışma
-- alanı, tek kişinin yazabildiği bir vitrine dönüşmüştü.
--
-- YENİ KURAL: AF Teamwork ORTAK BİR ÇALIŞMA ALANIDIR. İçeriği çalışma
-- alanındaki herkes düzenler. Kimin göreceğini `visibility` söyler ve onu
-- kapatmak yöneticinin isteğe bağlı kararıdır.
--
-- NE AÇILMIYOR — bilerek:
--   • SİLME. Geri alınamaz; "yönetici ya da ekleyen" olarak kalıyor. Düzenleme
--     yanlış giderse geri alınır, silme gitmez.
--   • DURUM (kilit/arşiv). Uygulama katmanında yönetici ve sahibiyle sınırlı;
--     bir üye başkasının tablosunu kilitleyip herkese kapatamamalı.
--   • TAKVİM. `planning_*` tablolarına DOKUNULMUYOR — yazım yönetici yetkisi
--     olarak kalıyor (proje kuralı, CLAUDE.md).
--
-- İdempotent: drop-if-exists + create.
-- ============================================================================

-- ── Yazı / bağlantı / yüklenen dosya ────────────────────────────────────────
drop policy if exists "operation_documents: admins or author can update" on public.operation_documents;
drop policy if exists "operation_documents: members can update" on public.operation_documents;
create policy "operation_documents: members can update"
  on public.operation_documents for update
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

-- ── Tablo ───────────────────────────────────────────────────────────────────
drop policy if exists "operation_spreadsheets: admins or author can update" on public.operation_spreadsheets;
drop policy if exists "operation_spreadsheets: members can update" on public.operation_spreadsheets;
create policy "operation_spreadsheets: members can update"
  on public.operation_spreadsheets for update
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

-- ── Tablo sürümleri ─────────────────────────────────────────────────────────
-- Her kayıtta bir sürüm satırı yazılıyor (geçmiş). Yazma hakkı tabloyla aynı
-- olmazsa üye tabloyu kaydedebilir ama GEÇMİŞE yazamaz; o da geçmişi sessizce
-- eksik bırakırdı.
-- Bu tabloda `workspace_id` YOK; üyelik ana tablo üzerinden çözülür.
drop policy if exists "operation_spreadsheet_versions: insert follows sheet" on public.operation_spreadsheet_versions;
drop policy if exists "operation_spreadsheet_versions: members insert" on public.operation_spreadsheet_versions;
create policy "operation_spreadsheet_versions: members insert"
  on public.operation_spreadsheet_versions for insert
  with check (
    (created_by is null or created_by = auth.uid())
    and exists (
      select 1 from public.operation_spreadsheets s
      where s.id = spreadsheet_id
        and is_workspace_member(s.workspace_id)
    )
  );

-- ── Klasör ──────────────────────────────────────────────────────────────────
-- Yeniden adlandırma ve taşıma da ortak. SİLME açılmıyor (yukarıdaki gerekçe);
-- 20240334'teki "admin ya da sahibi" kuralı silmede olduğu gibi duruyor.
drop policy if exists "document_folders: admin or owner update" on public.document_folders;
drop policy if exists "document_folders: members can update" on public.document_folders;
create policy "document_folders: members can update"
  on public.document_folders for update
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));
