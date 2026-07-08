import Link from "next/link";
import { LOSPIA_LOGO, PRODUCT_NAME } from "@/lib/branding";
import styles from "./MarketingHeader.module.css";

// Shared public-site chrome: frosted light sticky navbar + light footer around
// any marketing page. Server component, no client JS — links only. Nav section
// links point to homepage anchors so we don't overbuild standalone subpages yet.
//
// Visual language (marketing only): light premium canvas — white / soft
// off-white, deep graphite text, Lospia cobalt/indigo accents, hairline slate
// borders. Scoped to these components with explicit utility classes so the
// light product/app design tokens stay untouched.

// The horizontal Lospia wordmark asset is dark navy and reads cleanly on a
// light canvas, so the public site uses it directly.
function Wordmark() {
  return (
    <Link
      href="/"
      className="flex shrink-0 select-none items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2"
      aria-label={PRODUCT_NAME}
    >
      {/* Explicit intrinsic dimensions: Safari sizes `w-auto` images at 0px
          until the file loads unless the aspect ratio is known up front, which
          let the nav collapse against the wordmark. */}
      <img
        src={LOSPIA_LOGO}
        alt={PRODUCT_NAME}
        width={926}
        height={313}
        className="h-7 w-auto"
        draggable={false}
      />
    </Link>
  );
}

const NAV_LINKS = [
  { href: "/#urun", label: "Ürün" },
  { href: "/#nasil-calisir", label: "Nasıl çalışır?" },
  { href: "/#fiyatlandirma", label: "Fiyatlandırma" },
  { href: "/#demo", label: "Demo" },
];

export function MarketingHeader() {
  return (
    // Layout lives entirely in MarketingHeader.module.css (plain CSS grid), not
    // in Tailwind arbitrary/JIT utilities. The served Safari build was dropping
    // the JIT `grid-cols-[…]` / `col-start-*` / `justify-self-*` classes, so the
    // three zones collapsed into a vertical block stack. Plain CSS can't collapse
    // that way. `fixed` (not `sticky`) because globals.css guards html/body with
    // `overflow-x: clip/hidden`, and the hidden fallback silently disables
    // position:sticky descendants.
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <div className={styles.logo}>
          <Wordmark />
        </div>
        <nav className={styles.nav}>
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={styles.navLink}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className={styles.cta}>
          <Link href="/request-access" className={styles.ctaLink}>
            Kurulum görüşmesi planla
          </Link>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto flex max-w-[1360px] flex-col gap-6 px-4 py-12 sm:px-6 md:flex-row md:items-start md:justify-between lg:px-10">
        <div className="max-w-xs space-y-3">
          <img
            src={LOSPIA_LOGO}
            alt={PRODUCT_NAME}
            className="h-7 w-auto"
            draggable={false}
          />
          <p className="text-sm leading-relaxed text-slate-500">
            Büyüyen ekipler için kurulum destekli operasyon paneli.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-8 gap-y-3 text-sm text-slate-600">
          {[
            { href: "/request-access", label: "Kurulum görüşmesi" },
            { href: "/legal/privacy-policy", label: "Gizlilik Politikası" },
            { href: "/legal/terms-of-service", label: "Kullanım Koşulları" },
            { href: "/login", label: "Giriş" },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-sm underline-offset-4 transition-colors duration-150 hover:text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="border-t border-slate-200">
        <p className="mx-auto max-w-[1360px] px-4 py-5 text-xs text-slate-400 sm:px-6 lg:px-10">
          © {new Date().getFullYear()} {PRODUCT_NAME}. Tüm hakları saklıdır.
        </p>
      </div>
    </footer>
  );
}

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900 antialiased">
      <MarketingHeader />
      {/* Spacer matching the fixed header height (64px mobile / 72px desktop),
          driven by the same CSS module so the two can never drift apart —
          prevents content from sliding under the bar and keeps anchor offsets
          unchanged. */}
      <div aria-hidden className={styles.spacer} />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
