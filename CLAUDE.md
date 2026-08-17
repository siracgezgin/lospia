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
proxy.ts                auth gate (Next 16: middleware renamed → proxy)
app/
  (auth)/login/         sign-in
  (marketing)/          Lospia public site (host-gated; AF host never serves it)
  (app)/                authenticated area (proxy-protected)
    home/               Ana Sayfa — giriş rotası (herkes): bana atananlar,
                        bugünün planı, role göre kısayol ızgarası
    planning/           haftalık toplantı takvimi (yazım admin-only; üye salt-okur)
    board/ admin-board/ Kanban (+ yönetici görünümü)
    list/               table view
    tasks/[id]/         task detail (+ @modal intercepted drawer)
    calendar/           month grid ("Görev Takvimi")
    dashboard/          analytics ("Raporlar")
    collection/         Koleksiyon: föy tarayıcı + maliyet (/collection/maliyet)
    production/[id]/    Üretim Föyü editörü (+ XLSX export routes)
    finance/            ödeme takibi (admin-only, RLS dahil)
    modules/            Operasyon Modülleri hub (Çekirdek + departman kartları)
    crm/ creative/      contacts + kreatif link registry (admin)
    documents/ templates/ sheets/   Ofis Merkezi
    activity/ archive/ trash/ settings/ profile/ rules/
  api/inbound-email/    email-to-task webhook (feature-flagged)
components/             alan başına klasör (ui/ = paylaşılan primitifler;
                        planning/ board/ task/ collection/ production/ finance/
                        modules/ layout/ dashboard/ …)
lib/
  supabase/             browser | server | middleware clients
  actions/              server actions (all mutations live here)
  planning/ collection/ production/  alan yardımcıları (kategoriler, maliyet, xlsx)
  modules/registry.ts   MODULE_DIRECTORY — "ne nerede"nin tek kaynağı.
                        KURAL: isim-only başlık yok; bir rota EN FAZLA bir kez,
                        TEK kanonik isimle listelenir (sidebar + PAGE_TITLES
                        ile birebir aynı)
  notifications/        notifyTaskEvent (tek bildirim kapısı — asla direkt insert)
  utils/                cn(), formatters, feature-flag helpers
modules/                feature-flag'li entegrasyonlar (uploads/slack/email/ai/realtime)
supabase/migrations/    all SQL — İDEMPOTENT yaz (if not exists / drop-if-exists
                        + create) ve yeni tabloya AÇIK GRANT ver (authenticated,
                        service_role); prod'a push'u kullanıcı elle çalıştırır
types/
  database.ts           generated from Supabase schema
  index.ts              re-exports + app-specific types
```

## UI kuralları
- Giriş rotası /home (Ana Sayfa) — tüm roller; kısayol kartları registry'den
  role göre filtrelenir. /modules yönetici genel-bakış hub'ıdır (sayaçlı).
- Sidebar 3 sabit grup (Çalışma / Ürün / Yönetim); yeni modülün kapısı Ana
  Sayfa kısayolları + /modules hub'ıdır — sidebar'a başlık eklemek kullanıcı
  onayı ister.
- Tek terminoloji: aynı ekran her yerde aynı adla (registry MODULE_DIRECTORY ↔
  AppHeader PAGE_TITLES ↔ sidebar ↔ page metadata.title).
- `app/(app)/layout.tsx`'e sorgu EKLEME — kabuk her gezinmede çalışır.
- Font Inter (variable, `--font-sans-face`); hizalı rakamlar `tabular-nums`.
  `-webkit-font-smoothing` KULLANMA — macOS'ta metni bulanıklaştırıyor. Animasyonlar
  globals.css'teki `anim-*`/`stagger-children` sınıflarıyla (yeni bağımlılık yok).
- tailwind-merge cn() içindeki border-l renklerini yutar → renkli sol kenarı
  cn() dışında ver ya da absolute 3px bar kullan.

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
