# Lospia — Brand Notes

## Product vs. Customer

| Context | Name |
|---|---|
| Platform / product | **Lospia** |
| GitHub repository | `siracgezgin/lospia` |
| First pilot workspace | **AF Operasyon** (Aslı Filinta) |
| Sidebar wordmark (pilot) | Aslı Filinta logo (`aslifilinta.png`) |

## What NOT to rename right now

The app is branded for its first pilot customer (Aslı Filinta / AF Operasyon). Do not do
a mass rename of "AF Operasyon" → "Lospia" across the codebase. The pilot workspace
name lives in the database seed, not in the app code.

**Do not touch:**
- `supabase/seed.sql` workspace name — AF Operasyon stays as-is for the pilot
- Sidebar Aslı Filinta wordmark (`aslifilinta.png`) — pilot-specific branding
- Any task data or workspace settings

## Where Lospia branding will eventually go

- Login/landing page (`app/(auth)/login/`) — add "Powered by Lospia" or similar
- `<title>` and meta tags in `app/layout.tsx`
- Generic error pages
- Favicon (`public/favicon.ico`)
- `package.json` `name` field (currently `spikos-taskos`)

## Planned renames (do not execute without explicit approval)

- [ ] `package.json` name: `spikos-taskos` → `lospia`
- [ ] Local folder `~/Projects/spikos-taskos` can be renamed to `lospia` after sync
- [ ] Login page: add Lospia branding without breaking AF pilot
- [ ] `supabase/config.toml` `project_id`: `spikos-taskos` → `lospia` (local only, no prod impact)

## Multi-workspace future

Lospia is designed to be multi-workspace. AF Operasyon is workspace 1.
The `provision_workspace()` function already handles new workspace creation.
Future customers get their own workspace, their own branding can be injected via
workspace settings without touching code.
