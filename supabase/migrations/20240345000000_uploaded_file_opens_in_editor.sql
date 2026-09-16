-- ============================================================================
-- YÜKLENEN DOSYA, EKLENDİĞİ GİBİ AÇILSIN
--
-- Sıraç (2026-09-16): "Excel olarak eklediğimiz dosyalar ya da Word, vs. nasıl
-- eklendiyse öyle açılmalı ve kullanılmalı. Bir de yarım ekran değil, Excel
-- gibi tam ekran olmalı."
--
-- Şu anki akış: yüklenen .xlsx'e tıklanınca yarım ekran bir önizleme penceresi
-- açılıyor, kullanıcı "Tablo olarak düzenle"ye basıyor, sonra "Tabloyu aç"a
-- basıyor. Üç adım ve ikisi gereksiz — dosya zaten düzenlenmek için yüklendi.
--
-- Hedef: TEK TIK, doğrudan tam ekran düzenleyici.
--
-- BUNUN İÇİN BİR BAĞ GEREKİYOR. Aktarım her tıklamada yeniden çalışırsa aynı
-- dosyadan onlarca kopya tablo birikir. `source_document_id` bu yüzden var:
-- ilk tıkta tablo üretilir ve dosyaya BAĞLANIR, sonraki her tıkta aynı tablo
-- açılır. Kullanıcı açısından dosya "açılıyor"; teknik olarak bir kez
-- aktarılıp sonsuza dek aynı kayda dönülüyor.
--
-- ON DELETE SET NULL: yüklenen dosya silinirse tablo YAŞAMAYA DEVAM ETMELİ.
-- Ekip aylarca o tablonun üstünde çalışmış olabilir; kaynağın silinmesi emeği
-- silmez. Bağ kopar, tablo kalır.
--
-- İdempotent: add column if not exists + create index if not exists.
-- ============================================================================

alter table public.operation_spreadsheets
  add column if not exists source_document_id uuid
    references public.operation_documents(id) on delete set null;

comment on column public.operation_spreadsheets.source_document_id is
  'Bu tablo hangi yüklenen dosyadan aktarıldı. Aynı dosyaya tekrar tıklandığında
   yeni kopya üretmek yerine bu tablo açılır. Dosya silinirse null olur, tablo kalır.';

-- Tıklama yolundaki tek sorgu bu: "bu dosyanın tablosu var mı?"
create index if not exists operation_spreadsheets_source_document_idx
  on public.operation_spreadsheets (workspace_id, source_document_id)
  where source_document_id is not null;

-- ── WORD TARAFI ─────────────────────────────────────────────────────────────
-- Yüklenen .docx de aynı mantıkla açılır: ilk tıkta sistemin "Yazı" kaydına
-- aktarılır, sonraki her tıkta aynı yazı açılır.
--
-- KENDİNE REFERANS: yüklenen dosya da, üretilen yazı da `operation_documents`
-- satırıdır (biri document_type='file', diğeri 'doc'). Tablo kendi kendine
-- işaret eder; ayrı bir tablo açmaya gerek yok.
alter table public.operation_documents
  add column if not exists source_document_id uuid
    references public.operation_documents(id) on delete set null;

comment on column public.operation_documents.source_document_id is
  'Bu yazı hangi yüklenen .docx dosyasından aktarıldı. Aynı dosyaya tekrar
   tıklandığında yeni kopya üretmek yerine bu yazı açılır.';

create index if not exists operation_documents_source_document_idx
  on public.operation_documents (workspace_id, source_document_id)
  where source_document_id is not null;
