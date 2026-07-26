import type { Metadata } from "next";
import { headers } from "next/headers";
import { Manrope } from "next/font/google";
import { getAppBrandForHost } from "@/lib/branding";
import "./globals.css";

// Ürün yazı yüzü — Manrope (variable). Geometrik-hümanist, Türkçe (latin-ext)
// tam destekli, tabular rakamları güçlü; sistem fontuna göre belirgin karakter
// kazandırır. next/font self-host eder: harici istek yok, CLS yok.
const manrope = Manrope({
  subsets: ["latin", "latin-ext"],
  variable: "--font-manrope",
  display: "swap",
});

// Metadata is HOST-AWARE. The whole app is already dynamically rendered (the
// root `/` reads the host to route marketing-vs-app), so resolving metadata
// per request here costs nothing and keeps ONE source of truth: the same brand
// resolver that drives the UI (getAppBrandForHost) also drives the tab title
// and favicon. This is what stops the Lospia favicon/title from leaking onto
// the AF Operasyon pilot host. Tenant/workspace NAMES remain DB-rendered UI
// data, separate from this product/pilot metadata.
export async function generateMetadata(): Promise<Metadata> {
  const host = (await headers()).get("host");
  const brand = getAppBrandForHost(host);
  const m = brand.metadata;

  // Prefer the actual request origin for OG/metadataBase; fall back to the
  // brand's canonical site when the host is missing or local.
  const isLocal = !host || host.startsWith("localhost") || host.startsWith("127.");
  const metadataBase = new URL(
    isLocal ? m.siteUrl : `https://${host.split(":")[0]}`,
  );

  return {
    metadataBase,
    title: {
      default: m.titleDefault,
      template: m.titleTemplate,
    },
    description: m.description,
    applicationName: m.applicationName,
    icons: {
      icon: [
        { url: m.icons.icon, sizes: "any" },
        { url: m.icons.png, type: "image/png" },
      ],
      shortcut: m.icons.icon,
      apple: m.icons.apple,
    },
    openGraph: {
      type: "website",
      siteName: m.applicationName,
      title: m.titleDefault,
      description: m.description,
      url: m.siteUrl,
      locale: "tr_TR",
    },
    twitter: {
      card: "summary_large_image",
      title: m.titleDefault,
      description: m.description,
    },
    // Internal operations tool — keep it out of search indexes.
    robots: { index: false, follow: false },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className={`h-full antialiased ${manrope.variable}`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
