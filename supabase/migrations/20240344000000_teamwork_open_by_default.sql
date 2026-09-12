-- ============================================================================
-- AF TEAMWORK: EKLENEN HER ŞEY VARSAYILAN OLARAK HERKESE AÇIK
--
-- Sıraç (2026-09-12): "Default olarak eklenen klasörlerin tamamı açık olmalı
-- herkese; 'sadece yönetici görsün' kısmı isteğe bağlı olarak yönetici yapsın.
-- Hatta tüm dosyalarda da öyle olsun bu."
--
-- KLASÖRLER ZATEN ÖYLEYDİ (20240335 varsayılanı 'all' yaptı, 20240336 mevcut
-- klasörleri açtı). YAZI, TABLO, BAĞLANTI VE DOSYA DEĞİLDİ — ama sebebi
-- `visibility` değil, GİZLİ BİR İKİNCİ KAPIYDI.
--
-- KÖK NEDEN: `operation_documents` / `operation_spreadsheets` başlangıçta bir
-- ONAY AKIŞI tablosuydu (draft → in_review → approved → archived). AF Teamwork
-- sonradan aynı tabloları düz bir "sürücü" olarak kullanmaya başladı, ama
-- okuma kuralındaki taslak kapısı olduğu gibi kaldı:
--
--     visibility = 'all'  AND  status <> 'draft'
--
-- Uygulama tarafında da üyenin açtığı her kayıt zorla 'draft' işaretleniyordu
-- (documents.ts:136, documents.ts:359, sheets.ts:336, sheets.ts:498). İkisi
-- birleşince şu oluyordu:
--
--   Bir ÜYE yazı/tablo/bağlantı eklediğinde, görünürlük 'all' olsa bile kayıt
--   kendisinden BAŞKA KİMSEYE görünmüyordu. Görünürlük anahtarının üye için
--   hiçbir etkisi yoktu — açık görünen ama kapalı çalışan bir düğme.
--
-- Yüklenen DOSYALAR bu tuzaktan kurtulmuştu, çünkü document-files.ts
-- `status: "approved"` yazıyor. Yani aynı sürücüde dosya görünüyor, yazı
-- görünmüyordu; tutarsızlığın kaynağı buydu.
--
-- KARAR: DURUM BİR ERİŞİM KAPISI DEĞİLDİR. `status` bir iş etiketidir
-- ("hazırlanıyor / incelemede / onaylı / arşiv"); kimin göreceğini YALNIZ
-- `visibility` söyler. Okuma kuralından taslak kapısı kalkıyor.
--
-- ARŞİV KAYBOLMAZ: listeleri çizen sorgular zaten `.neq("status","archived")`
-- ile süzüyor (app/(app)/documents/page.tsx). Bu kural yalnız ERİŞİMİ
-- belirler, LİSTEYİ değil.
--
-- İdempotent: drop-if-exists + create.
-- ============================================================================

-- ── 1. Varsayılanlar açıkça 'all' ───────────────────────────────────────────
-- (20240334 bu sütunları default 'all' ile ekledi; burada niyet yazılı kalsın
--  diye tekrar ediliyor — tablo başka bir yoldan oluşturulmuşsa da garanti.)
alter table public.operation_documents
  add column if not exists visibility text not null default 'all';
alter table public.operation_spreadsheets
  add column if not exists visibility text not null default 'all';

alter table public.operation_documents    alter column visibility set default 'all';
alter table public.operation_spreadsheets alter column visibility set default 'all';
alter table public.document_folders       alter column visibility set default 'all';

-- ── 2. Okuma kuralı: erişim = görünürlük. Taslak kapısı kalkıyor ────────────
drop policy if exists "operation_documents: visible to admins, authors and members" on public.operation_documents;
create policy "operation_documents: visible to admins, authors and members"
  on public.operation_documents for select
  using (
    is_workspace_admin(workspace_id)
    -- Kendi kaydını her hâlükârda görür.
    or (is_workspace_member(workspace_id) and created_by = auth.uid())
    -- Açık kayıt tüm ekibe görünür. `status` ARTIK BAKILMIYOR.
    or (is_workspace_member(workspace_id) and visibility = 'all')
  );

drop policy if exists "operation_spreadsheets: visible to admins, authors and members" on public.operation_spreadsheets;
create policy "operation_spreadsheets: visible to admins, authors and members"
  on public.operation_spreadsheets for select
  using (
    is_workspace_admin(workspace_id)
    or (is_workspace_member(workspace_id) and created_by = auth.uid())
    or (is_workspace_member(workspace_id) and visibility = 'all')
  );

-- ── 2b. YAZMA KURALLARI — ASIL KAPI BURADAYDI ──────────────────────────────
-- 20240224'ten kalan INSERT kuralı şunu diyordu:
--     (is_workspace_admin(workspace_id) or status = 'draft')
-- Yani ÜYE YALNIZ TASLAK EKLEYEBİLİYORDU; başka bir durumla insert denemesi
-- RLS tarafından reddediliyordu. Uygulama katmanı da bu yüzden üyenin kaydını
-- zorla 'draft' yazıyordu — iki kat kilit, aynı yanlış varsayım.
--
-- UPDATE kuralı da benzerdi (`status in ('draft','in_review')`): üye kendi
-- yazısını yayımladıktan sonra DÜZELTEMİYORDU. 20240334 bunu yazı ve tablo
-- için zaten gevşetmişti; burada insert tarafı da aynı hizaya geliyor.
--
-- YENİ KURAL: üye KENDİ kaydını her durumda ekler. Ne ekleyebileceğini durum
-- değil sahiplik belirler; kimin göreceğini de yalnız `visibility`.
drop policy if exists "operation_documents: members insert own drafts" on public.operation_documents;
drop policy if exists "operation_documents: members insert own" on public.operation_documents;
create policy "operation_documents: members insert own"
  on public.operation_documents for insert
  with check (
    is_workspace_member(workspace_id)
    and (created_by is null or created_by = auth.uid())
  );

drop policy if exists "operation_spreadsheets: members insert own drafts" on public.operation_spreadsheets;
drop policy if exists "operation_spreadsheets: members insert own" on public.operation_spreadsheets;
create policy "operation_spreadsheets: members insert own"
  on public.operation_spreadsheets for insert
  with check (
    is_workspace_member(workspace_id)
    and (created_by is null or created_by = auth.uid())
  );

-- ── 3. MEVCUT KAYITLARA TOPLU DOKUNULMUYOR — bilerek ──────────────────────
-- İlk taslakta buraya "visibility = 'admin' olan her satırı 'all' yap" yazdım
-- ve YANLIŞTI. İstek "varsayılan açık olsun, kapatmayı yönetici İSTEĞE BAĞLI
-- yapsın"dı; toplu açmak tam tersini yapar, yöneticinin bilerek kapattığı
-- klasörü habersiz açardı. Klasörler için tek seferlik açma zaten yapılmıştı
-- (20240336); ondan sonra 'admin' kalan her satır BİLİNÇLİ bir seçimdir.
--
-- Zaten gereği de yok: yazı/tablo/bağlantı gizli kalmasının sebebi `visibility`
-- DEĞİL taslak kapısıydı. O kapı yukarıda kalktığı için mevcut kayıtlar tek bir
-- UPDATE olmadan görünür hâle geliyor.
--
-- Hâlâ kapalı bir şey varsa menüden açılır: ⋯ → "Tüm üyelere göster".
