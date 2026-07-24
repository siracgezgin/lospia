-- =============================================================================
-- production_sheets — rol GRANT güvencesi (idempotent)
-- =============================================================================
-- "supabase migration up / db push" ile sonradan eklenen tablolar Supabase'in
-- default privileges'ini almayabiliyor; bu durumda service_role/authenticated
-- tabloya erişemez ("permission denied"). 20240212 zaten buluta push edilmişse
-- oradaki düzeltme tekrar çalışmayacağı için bu AYRI migration grant'i garanti
-- eder. GRANT idempotenttir; tekrar uygulanması güvenlidir.
-- =============================================================================

grant select, insert, update, delete on public.production_sheets
  to anon, authenticated, service_role;
