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
    documents/ sheets/ library/     AF Teamwork (documents = giriş; sheets ve
                        library onun kutucukları — sidebar'da tek satır)
    activity/ archive/ trash/ settings/ profile/ rules/
  api/inbound-email/    email-to-task webhook (feature-flagged)
components/             alan başına klasör (ui/ = paylaşılan primitifler —
                        TileGrid.tsx TEK giriş deseni: Pano kişi kartı dili
                        Collection, AF Teamwork ve Library'de aynen tekrar eder;
                        planning/ board/ task/ collection/ production/ finance/
                        modules/ layout/ dashboard/ …)
lib/
  supabase/             browser | server | middleware clients
  actions/              server actions (all mutations live here)
  planning/ collection/ production/  alan yardımcıları (kategoriler, maliyet, xlsx)
  planning/timezones.ts kayıtlı toplantı saati NEW YORK'tur; İstanbul hesaplanır
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
- **SADELİK KURALI (Aslı Hanım, 2026-08-24): "İsmi, işi, tarihi bu kadar."**
  Ekrana bir sayı ya da durum etiketi eklemeden önce şu testi uygula:
  *bir kişiyi ya da bir işi PUANLIYOR mu?* (4 görev, 3 gecikti, 2 eksik,
  N puan, "bu hafta tamamlandı") → **ekleme**. *Baktığın listeyi TARİF mi
  ediyor?* (kategori ağacındaki ürün adedi, filtrelenmiş tablonun satır
  sayısı) → serbest. Kart başına EN FAZLA bir rozet; durumu sütun/sayfa zaten
  söylüyorsa çip tekrardır. "Mühendis gibi hissetmek istemiyorum."
- **TEK TASARIM DİLİ (Aslı Hanım, 2026-08-28): "Bir tasarımı yaptığın zaman
  o tasarımı her yerde devam ettirmen gerekiyor… O da branding'ini destekleyen
  bir şey olur."** Bir modülün GİRİŞ ekranı her zaman `components/ui/TileGrid`
  kutucuklarıdır (referans: Pano kişi kartı). Yeni bir liste/ağaç/açılır-kutu
  düzeni İCAT ETME; solda ayrı gezinme paneli açma; "muhasebeci gibi" alt alta
  select dizme. Süzgeç kuralı: **başlık · tür · departman**, fazlası satırın
  içinde yazar.
- Giriş rotası /home (Ana Sayfa) — tüm roller. İçerik "bugün ne yapacağım?":
  işler ZAMANA göre gruplu (Gecikmiş · Bugün · Bu hafta · Sonrası · Tarihsiz)
  + bugünün ve haftanın toplantıları. KISAYOL IZGARASI YOK (2026-08-29:
  "zaten yanda var her şey") — gezinme sol menü ve /modules hub'ıdır.
- Sidebar 3 sabit grup (Core Operations / Product & Office / Admin); yeni
  modülün kapısı /modules hub'ıdır — sidebar'a başlık eklemek kullanıcı onayı
  ister. Gezinme listesi ELLE YAZILMAZ: `lib/nav/app-nav.ts` tek kaynaktır ve
  satırları MODULE_DIRECTORY'den türetir; sol menü, mobil menü çekmecesi ve
  /modules hub'ı hep aynı adı/ikonu/bölümü gösterir. Admin bölümü YALNIZ
  yöneticinin müdahale ettiği yüzeylerdir; "Operation Modules" bir modül değil
  DİZİN olduğu için gruplara girmez, menünün altında ayrı durur.
- Mobil: alt gezinme dört sekme + "Menu" (soldan açılan tam menü çekmecesi;
  masaüstü menüsüyle aynı bölümler + Profilim/Çıkış). Telefonda erişilemeyen
  ekran BIRAKMA — kısayol ızgarası yok, tek kapı bu çekmece.
- Sayfa ADLARI İngilizce, içerik Türkçe (Aslı Hanım, 2026-08-20). Tek
  terminoloji: aynı ekran her yerde aynı adla (registry MODULE_DIRECTORY ↔
  AppHeader PAGE_TITLES ↔ sidebar ↔ page metadata.title).
- `app/(app)/layout.tsx`'e sorgu EKLEME — kabuk her gezinmede çalışır.
- Font Inter (variable, `--font-sans-face`); hizalı rakamlar `tabular-nums`.
  `-webkit-font-smoothing` KULLANMA — macOS'ta metni bulanıklaştırıyor. Animasyonlar
  globals.css'teki `anim-*`/`stagger-children` sınıflarıyla (yeni bağımlılık yok).
- tailwind-merge cn() içindeki border-l renklerini yutar → renkli sol kenarı
  cn() dışında ver ya da absolute 3px bar kullan.

## Yedekleme
Ayarlar → Yedekleme: `/api/backup` (yalnız yönetici) çalışma alanının tüm
tablolarını JSON + CSV olarak, `?files=1` ile depolamadaki dosyalarla birlikte
tek bir .zip'e akıtır. ZIP yazıcısı bağımlılıksızdır (`lib/backup/zip.ts`),
kapsam `lib/backup/collect.ts`'te tanımlıdır — **yeni tablo eklediğinde o
listeye de ekle**, yoksa yedeğe girmez. Her indirme `workspace_backups`'a
yazılır; Ayarlar ve Ana Sayfa "7 günden eski yedek" uyarısını oradan okur.

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
