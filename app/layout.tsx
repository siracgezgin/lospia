import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = "https://operasyon.aslifilinta.com";
// Product-level branding — the app's identity is Lospia. Tenant/workspace
// names (e.g. "Aslı Filinta Operasyon") stay inside the app as workspace data
// and are rendered from the DB, not from this product metadata.
const SITE_TITLE = "Lospia";
const SITE_DESCRIPTION =
  "Lospia; görevler, ekip akışı, onaylar ve operasyon takibi için modern bir çalışma alanı.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s · ${SITE_TITLE}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_TITLE,
  openGraph: {
    type: "website",
    siteName: SITE_TITLE,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: "tr_TR",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  // Internal operations tool — keep it out of search indexes.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
