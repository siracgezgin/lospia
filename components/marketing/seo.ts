import type { Metadata } from "next";

// Lospia public-site metadata. The root layout stays AF-branded (noindex);
// marketing routes override it with these values. TODO: switch metadataBase
// to the final Lospia domain once it is confirmed (see docs/rota.md).
export const LOSPIA_SITE_NAME = "Lospia";

export const LOSPIA_HOME_TITLE =
  "Lospia | Operasyonlarınızı Tek Panelde Yönetin";

export const LOSPIA_HOME_DESCRIPTION =
  "Lospia; marka, e-ticaret, içerik ve operasyon ekiplerinin Excel ve WhatsApp'a dağılmış işlerini görevler, sorumlular, onaylar ve haftalık görünürlükle tek panelde toplar.";

export const LOSPIA_HOME_METADATA: Metadata = {
  title: { absolute: LOSPIA_HOME_TITLE },
  description: LOSPIA_HOME_DESCRIPTION,
  applicationName: LOSPIA_SITE_NAME,
  openGraph: {
    type: "website",
    siteName: LOSPIA_SITE_NAME,
    title: LOSPIA_HOME_TITLE,
    description: LOSPIA_HOME_DESCRIPTION,
    locale: "tr_TR",
  },
  twitter: {
    card: "summary_large_image",
    title: LOSPIA_HOME_TITLE,
    description: LOSPIA_HOME_DESCRIPTION,
  },
  // Marketing pages are public — override the app-wide noindex.
  robots: { index: true, follow: true },
};
