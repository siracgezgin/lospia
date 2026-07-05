import Link from "next/link";
import { LOSPIA_LOGO, PRODUCT_NAME } from "@/lib/branding";

// Shared public-site chrome: header + footer around any marketing page.
// Server component, no client JS — links only. Nav section links point to
// homepage anchors so we don't overbuild standalone subpages yet.

function Wordmark() {
  return (
    <Link href="/" className="flex items-center select-none">
      <img
        src={LOSPIA_LOGO}
        alt={PRODUCT_NAME}
        className="h-7 w-auto"
        draggable={false}
      />
    </Link>
  );
}

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Wordmark />
        <nav className="hidden items-center gap-7 text-sm text-muted md:flex">
          <Link href="/#urun" className="transition-colors hover:text-ink">
            Ürün
          </Link>
          <Link href="/#kullanim" className="transition-colors hover:text-ink">
            Kullanım alanları
          </Link>
          <Link href="/#fiyatlandirma" className="transition-colors hover:text-ink">
            Fiyatlandırma
          </Link>
          <Link href="/login" className="transition-colors hover:text-ink">
            Giriş
          </Link>
        </nav>
        <Link
          href="/request-access"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-strong"
        >
          Kurulum Görüşmesi Planla
        </Link>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-hairline bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <img
            src={LOSPIA_LOGO}
            alt={PRODUCT_NAME}
            className="h-7 w-auto"
            draggable={false}
          />
          <p className="text-sm text-muted">
            Marka ekipleri için premium operasyon paneli.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
          <Link href="/request-access" className="hover:text-ink">
            Kurulum görüşmesi
          </Link>
          <Link href="/legal/privacy-policy" className="hover:text-ink">
            Gizlilik Politikası
          </Link>
          <Link href="/legal/terms-of-service" className="hover:text-ink">
            Kullanım Koşulları
          </Link>
          <Link href="/login" className="hover:text-ink">
            Giriş
          </Link>
        </nav>
      </div>
      <div className="border-t border-hairline">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-subtle sm:px-6">
          © {new Date().getFullYear()} Lospia. Tüm hakları saklıdır.
        </p>
      </div>
    </footer>
  );
}

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-app">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
