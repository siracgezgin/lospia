-- ---------------------------------------------------------------------------
-- AF Teamwork — YAZI (Word karşılığı).
--
-- Aslı Hanım (2026-08-28):
--   "Hazırladığı buraya, şiit dediği yere, Excel'in yanına Word'ü de gir.
--    Alev mesela buna 'online influencer marketing format' diye o dosyayı
--    buraya girsin. Bize sunum yaparken biz buradan açalım, Alev'in mailini
--    okuyalım, revize verelim ve o bir format olarak hazırlansın."
--
-- Bugüne kadar modül yalnız DOSYA saklıyordu (yükle/indir) ve DIŞ BAĞLANTI
-- künyeliyordu. İkisi de "burada açıp revize verelim" akışını karşılamıyor:
-- Word dosyası indirilip başka programda açılıyor, Drive bağlantısı ise
-- sistemden çıkarıyor. Bu kolon yazının kendisini sistemde tutar — Sheets'in
-- Excel için yaptığının aynısı.
--
-- Gövde HTML'dir ve YAZILIRKEN SUNUCUDA temizlenir (lib/office/sanitize-html.ts):
-- yalnız biçimlendirme etiketleri ve http(s) bağlantıları kalır. Veritabanı
-- ham girdiye güvenmez.
-- ---------------------------------------------------------------------------

alter table public.operation_documents
  add column if not exists body text;

comment on column public.operation_documents.body is
  'Yazının gövdesi (temizlenmiş HTML). Yalnız document_type = ''doc'' kayıtlarında dolu.';

-- Yeni tip: 'doc' — sistemde yazılan/düzenlenen metin. Check kısıtı isimsiz
-- oluşturulmuş olabilir; ada güvenmeden düşürüp yeniden kuruyoruz.
alter table public.operation_documents
  drop constraint if exists operation_documents_document_type_check;
alter table public.operation_documents
  add constraint operation_documents_document_type_check
  check (document_type in (
    'drive_link','google_doc','google_sheet','canva','figma','pdf_link',
    'word_link','excel_link','website','internal_note','other','file','doc'
  ));

grant select, insert, update, delete on public.operation_documents to authenticated;
grant all on public.operation_documents to service_role;
