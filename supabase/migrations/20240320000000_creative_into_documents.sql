-- ============================================================================
-- Kreatif Bağlantılar → Dokümanlar
-- ----------------------------------------------------------------------------
-- Aslı Hanım (2026-08-24): "Creative Links'i Documents altına alalım, zaten
-- orda var gibi."
--
-- Haklı: DOCUMENT_TYPES zaten "Canva", "Figma", "Drive klasörü", "Web sayfası"
-- taşıyordu. İki ayrı ekran aynı işi yapıyordu — biri "başlık + URL + sağlayıcı",
-- öbürü "başlık + URL + tür". Kreatif modülü kaldırıldı; kayıtları
-- operation_documents'a taşınıyor.
--
-- Eşleme (creative_assets.provider → operation_documents.document_type):
--   canva        → canva
--   figma        → figma
--   google_drive → drive_link
--   website      → website
--   dropbox      → other      (Dokümanlar'da Dropbox türü yok)
--   other        → other
--
-- Taşınan kayıt "Kreatif" etiketiyle işaretlenir (tags), böylece Dokümanlar
-- içinde nereden geldiği kaybolmaz ve süzülebilir.
--
-- creative_assets TABLOSU SİLİNMEZ — taşındığı yerde bir sorun çıkarsa kaynak
-- veri duruyor. Taşınan satır archived_at ile işaretlenir ki iki yerde birden
-- aktif görünmesin ve migration tekrar çalışırsa mükerrer üretmesin.
--
-- Idempotent: yalnız arşivlenmemiş satırlar taşınır; ikinci çalıştırma 0 döner.
-- ============================================================================

create or replace function public.migrate_creative_to_documents()
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare v_moved int := 0;
begin
  -- Tablo henüz migrate edilmemişse sessizce çık (taze veritabanı).
  if to_regclass('public.creative_assets') is null then
    return 'creative_assets tablosu yok — taşınacak bir şey bulunamadı.';
  end if;

  with tasinacak as (
    select * from public.creative_assets where archived_at is null
  ), eklenen as (
    insert into public.operation_documents (
      workspace_id, title, description, document_type, url,
      department_id, related_task_id, related_contact_id,
      status, tags, notes, created_by, created_at, updated_at
    )
    select
      c.workspace_id,
      c.title,
      null,
      case c.provider
        when 'canva'        then 'canva'
        when 'figma'        then 'figma'
        when 'google_drive' then 'drive_link'
        when 'website'      then 'website'
        else 'other'
      end,
      c.url,
      c.department_id, c.related_task_id, c.related_contact_id,
      coalesce(c.status, 'active'),
      array['Kreatif'],
      c.notes,
      c.created_by, c.created_at, c.updated_at
    from tasinacak c
    returning 1
  )
  select count(*) into v_moved from eklenen;

  -- Kaynağı arşivle: iki yerde birden aktif görünmesin, tekrar taşınmasın.
  update public.creative_assets set archived_at = now() where archived_at is null;

  return format('Kreatif bağlantılar Dokümanlar''a taşındı: %s kayıt.', v_moved);
end $fn$;

select public.migrate_creative_to_documents();

grant execute on function public.migrate_creative_to_documents() to service_role;
