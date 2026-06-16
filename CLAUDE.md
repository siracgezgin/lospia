@AGENTS.md

# Aslı Filinta Operasyon

Dahili görev yönetim sistemi. Local-first, sıfır harici maliyet, üretime hazır.

## Stack
- Next.js 16 (App Router) · TypeScript · Tailwind v4
- Supabase local (Postgres · Auth · Storage) + `@supabase/ssr`
- Row Level Security on every table
- `dnd-kit` (Kanban) · `@tanstack/react-table` (list) · `recharts` (dashboard)
- `date-fns` · `zod` · `fractional-indexing` · `lucide-react`

## Commands
```bash
npm run dev          # start dev server (http://localhost:3000)
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run lint         # next lint

# Supabase (requires Docker Desktop running)
supabase start       # start local stack
supabase db reset    # apply migrations + seed.sql
supabase status      # get local URLs + keys (fill .env.local)
supabase gen types typescript --local > types/database.ts
```

## Project structure
```
app/
  (auth)/login/         sign-in / sign-up
  (app)/                authenticated area (middleware-protected)
    board/              Kanban view
    list/               table view
    tasks/[id]/         task detail
    dashboard/          analytics tiles
    calendar/           month grid
    settings/           workspace settings
  api/
    inbound-email/      email-to-task webhook (feature-flagged)
components/
  ui/                   shared primitives
  board/                Kanban-specific Client components
  list/                 TanStack Table components
  task/                 task card, form, detail panels
  layout/               sidebar, nav, header
  notifications/        bell + popover
  calendar/             month grid
  dashboard/            chart tiles
lib/
  supabase/             browser | server | middleware clients
  actions/              server actions (all mutations live here)
  utils/                cn(), formatters, feature-flag helpers
modules/
  uploads/              Supabase Storage (UPLOADS_ENABLED)
  slack/                webhook sender + HMAC verifier (SLACK_ENABLED)
  email-to-task/        inbound email handler (EMAIL_TO_TASK_ENABLED)
  ai/                   summarizeTask action (AI_ENABLED)
  realtime/             task-detail subscription (REALTIME_ENABLED)
supabase/
  migrations/           all SQL migrations
  seed.sql              dev seed data
types/
  database.ts           generated from Supabase schema (Phase 14)
  index.ts              re-exports + app-specific types
scripts/
  mock-inbound-email.ts local email-to-task test script
```

## Feature flags
All default to `false`. Set in `.env.local`:
- `NEXT_PUBLIC_FEATURE_UPLOADS_ENABLED`
- `NEXT_PUBLIC_FEATURE_SLACK_ENABLED`
- `NEXT_PUBLIC_FEATURE_EMAIL_TO_TASK_ENABLED`
- `NEXT_PUBLIC_FEATURE_AI_ENABLED`
- `NEXT_PUBLIC_FEATURE_REALTIME_ENABLED`

## Safety rules
- Never commit real secrets. Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.
- Never bypass RLS for normal app reads/writes.
- Ask before installing global packages.
- Ask before deleting any file.
- `.env.local` is gitignored — fill from `supabase status` after `supabase start`.
