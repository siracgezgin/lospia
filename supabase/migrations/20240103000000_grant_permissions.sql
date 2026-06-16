-- =============================================================================
-- Grant table-level permissions to PostgREST roles.
-- RLS policies handle row-level filtering; these grants are the prerequisite
-- that lets the authenticated/anon roles reach the RLS check at all.
-- Without these, PostgREST returns 42501 "permission denied for table ..."
-- before RLS is evaluated.
-- =============================================================================

-- Schema usage
grant usage on schema public to anon, authenticated;

-- Full DML access for authenticated users (RLS enforces row-level rules)
grant select, insert, update, delete
  on all tables in schema public
  to authenticated;

-- Read-only for anon (all rows still blocked by RLS since auth.uid() is null)
grant select
  on all tables in schema public
  to anon;

-- Sequences (needed for any bigint/serial PKs, future use)
grant usage, select
  on all sequences in schema public
  to authenticated, anon;

-- Default privileges for tables created after this point
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant select on tables to anon;

alter default privileges in schema public
  grant usage, select on sequences to authenticated, anon;
