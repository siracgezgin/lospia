# Lospia — Deployment Checklist

> **Do not deploy until every section is checked.**
> Do not use production Supabase until explicitly set up here.

---

## A. GitHub

- [x] Private repo created: `siracgezgin/lospia`
- [x] `main` branch pushed and tracking `origin/main`
- [x] No secrets committed (`.env*` files are gitignored)
- [x] No CSV/XLSX import files committed (`data/` is gitignored)
- [x] `.env.example` present with placeholder values only
- [x] Latest commit: `d2ea134 chore: tighten .gitignore for production safety`
- [x] RBAC verified 89/89 on local

---

## B. Supabase Production

> Do these steps manually in the Supabase dashboard or CLI after authenticating.
> **Never seed fake dev users (alice/bob/nisa/viewer) to production.**

- [ ] Create a new Supabase project at https://supabase.com (call it `lospia` or `lospia-prod`)
- [ ] Note project URL and anon key from Settings → API
- [ ] Apply all migrations:
  ```bash
  supabase link --project-ref <YOUR_PROJECT_REF>
  supabase db push
  # Do NOT run supabase db reset — that would wipe prod data
  ```
- [ ] DO NOT run `supabase/seed.sql` on production (dev data only)
- [ ] Create real pilot user(s) via Supabase Auth dashboard
  - Invite Aslı Filinta user(s) via email
  - Assign `owner` role manually in `workspace_members` table
- [ ] After Vercel URL is known, add it to Supabase Auth:
  - Settings → Auth → URL Configuration → Site URL: `https://lospia.vercel.app`
  - Additional redirect URLs: `https://lospia.vercel.app/**`
- [ ] Collect these values (keep them secure, never paste into chat):
  - `NEXT_PUBLIC_SUPABASE_URL` = `https://<ref>.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `eyJ...`

---

## C. Vercel

> Import from GitHub. Do not deploy until env vars are set.

- [ ] Go to https://vercel.com → Add New Project → Import `siracgezgin/lospia`
- [ ] Framework preset: **Next.js** (auto-detected)
- [ ] Root directory: `/` (default)
- [ ] Set environment variables in Vercel dashboard **before first deploy**:

  | Variable | Value | Note |
  |---|---|---|
  | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | From Supabase Settings → API |
  | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | From Supabase Settings → API |
  | `NEXT_PUBLIC_FEATURE_UPLOADS_ENABLED` | `false` | Keep off until S3/Storage configured |
  | `NEXT_PUBLIC_FEATURE_SLACK_ENABLED` | `false` | Keep off |
  | `NEXT_PUBLIC_FEATURE_EMAIL_TO_TASK_ENABLED` | `false` | Keep off |
  | `NEXT_PUBLIC_FEATURE_AI_ENABLED` | `false` | Keep off until AI key ready |
  | `NEXT_PUBLIC_FEATURE_REALTIME_ENABLED` | `false` | Keep off |

- [ ] **Do not** add `SUPABASE_SERVICE_ROLE_KEY` — the app does not use it in runtime code
- [ ] Click Deploy and watch build logs
- [ ] Build command: `npm run build` (auto-detected)
- [ ] Output directory: `.next` (auto-detected)

---

## D. Post-deploy Verification

Run these checks after the first successful deploy:

- [ ] `https://your-app.vercel.app/login` renders without error
- [ ] Login with a real production user works
- [ ] `/board` loads with correct workspace data
- [ ] `/list` loads
- [ ] `/calendar` loads
- [ ] `/rules` loads
- [ ] Role permissions work (try owner and member actions)
- [ ] No console errors (open browser DevTools)
- [ ] Supabase Auth redirect URLs are set correctly (no redirect_uri mismatch errors)

---

## E. Required Env Vars Summary

### Minimum required for production

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### All feature flags (default off — safe)

```
NEXT_PUBLIC_FEATURE_UPLOADS_ENABLED=false
NEXT_PUBLIC_FEATURE_SLACK_ENABLED=false
NEXT_PUBLIC_FEATURE_EMAIL_TO_TASK_ENABLED=false
NEXT_PUBLIC_FEATURE_AI_ENABLED=false
NEXT_PUBLIC_FEATURE_REALTIME_ENABLED=false
```

### Optional (only needed when enabling features)

```
# Only if EMAIL_TO_TASK_ENABLED=true
EMAIL_INBOUND_SECRET=<hmac-secret>

# Only if AI_ENABLED=true
ANTHROPIC_API_KEY=<key>

# Only if SLACK_ENABLED=true
SLACK_SIGNING_SECRET=<secret>
```

---

## F. Security Notes

- `SUPABASE_SERVICE_ROLE_KEY` is **not used** by any runtime code — do not add to Vercel
- All database writes go through RLS policies — no client can bypass row-level security
- Server actions in `lib/actions/` enforce RBAC before any DB mutation
- Feature flags default to `false` — unneeded features are unreachable even if keys exist

---

## G. Current Status

| Item | Status |
|---|---|
| GitHub push | ✅ Done — `d2ea134` |
| Supabase production | ⏳ Pending — set up manually |
| Vercel import | ⏳ Pending — after Supabase ready |
| Production deploy | 🚫 Not yet — awaiting env vars |
