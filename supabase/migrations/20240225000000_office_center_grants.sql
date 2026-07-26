-- ============================================================================
-- Ofis Merkezi — grants güvenlik ağı
-- ----------------------------------------------------------------------------
-- 20240207 tabloları RLS + policy ile kuruluyor ama açık GRANT içermiyordu.
-- db push ile kurulan tablolarda default privileges DML grant vermez
-- (production_sheets'te yaşanan kök neden; bkz. 20240214). RLS asıl kapı —
-- burada yalnız rol yetkisi tamamlanıyor. GRANT idempotenttir.
-- ============================================================================

grant select, insert, update, delete on public.operation_documents            to authenticated, service_role;
grant select, insert, update, delete on public.document_templates             to authenticated, service_role;
grant select, insert, update, delete on public.document_template_versions     to authenticated, service_role;
grant select, insert, update, delete on public.operation_spreadsheets         to authenticated, service_role;
grant select, insert, update, delete on public.operation_spreadsheet_versions to authenticated, service_role;
