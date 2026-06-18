-- Add 'viewer' role to workspace_role enum.
-- ALTER TYPE … ADD VALUE cannot run inside a transaction in PG < 12;
-- Supabase local runs each migration in its own transaction so this is safe.
ALTER TYPE workspace_role ADD VALUE IF NOT EXISTS 'viewer';
