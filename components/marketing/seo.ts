import type { Metadata } from "next";

// Lospia public-site metadata. The root layout stays AF-branded (noindex);
// marketing routes override it with these values. TODO: switch metadataBase
// to the final Lospia domain once it is confirmed (see docs/rota.md).
export const LOSPIA_SITE_NAME = "Lospia";

export const LOSPIA_HOME_TITLE =
  "Lospia | Marka Ekipleri İçin Premium Operasyon Paneli";

export const LOSPIA_HOME_DESCRIPTION =
  "Lospia, moda, e-ticaret ve yaratıcı ekiplerin Excel ve WhatsApp tabanlı operasyonlarını görevler, sorumlular, onaylar ve haftalık görünürlükle tek panelde yönetmesini sağlar.";

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
