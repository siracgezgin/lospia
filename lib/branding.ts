// Central source of truth for Lospia product branding.
//
// Product brand = Lospia. Workspace / tenant names (e.g. "Aslı Filinta
// Operasyon") are USER DATA and are rendered separately from these assets —
// never swap a tenant name for the product logo, or vice versa.
//
// Asset note: the supplied .svg files are base64-embedded rasters (no vector
// paths), so SVG offers no crispness advantage over PNG here. The square
// `logo` asset pads the horizontal wordmark inside a 1:1 canvas, which renders
// as an unreadable speck at header sizes — so UI uses `logo-wordmark.png`, a
// trimmed horizontal crop generated from it. The tight, square `icon` asset is
// used as-is. The original square deliverables remain available below.

export const PRODUCT_NAME = "Lospia";

/**
 * Full horizontal wordmark — login/auth, marketing header + footer, expanded
 * sidebar. Trimmed to its content box so it reads cleanly at small heights.
 */
export const LOSPIA_LOGO = "/brand/lospia/logo-wordmark.png";

/** Original square wordmark deliverable (padded canvas) — kept for reference. */
export const LOSPIA_LOGO_SQUARE = "/brand/lospia/logo.svg";
export const LOSPIA_LOGO_SQUARE_PNG = "/brand/lospia/logo.png";

/** Icon mark — favicon, tiny surfaces, collapsed sidebar. */
export const LOSPIA_ICON = "/brand/lospia/icon.svg";
export const LOSPIA_ICON_PNG = "/brand/lospia/icon.png";

/** Monochrome icon variants for contrast-constrained surfaces. */
export const LOSPIA_ICON_BLACK = "/brand/lospia/icon_black.svg";
export const LOSPIA_ICON_WHITE = "/brand/lospia/icon_white.svg";

// ---------------------------------------------------------------------------
// Host-aware app-shell branding
// ---------------------------------------------------------------------------
// Lospia is the platform, but the app is a single multi-tenant deployment that
// also serves the AF Operasyon pilot on operasyon.aslifilinta.com. That pilot
// keeps its OWN logo — the Lospia mark must never overwrite it. Until per-
// workspace logo storage exists, the correct brand is chosen from the request
// host (see getAppBrandForHost). This is intentionally the seam a future
// per-tenant branding model plugs into: swap the host lookup for a workspace
// field and the call sites don't change.

import { isAfOperationsHost } from "@/lib/marketing/host";

/**
 * Host-aware browser/tab metadata. Fed straight into the root layout's
 * `generateMetadata` so the tab title AND favicon/app icons match the same
 * host that the UI branding does — no more Lospia favicon leaking onto the AF
 * pilot host. Icons point at /public assets (the file-convention icons under
 * app/ were removed on purpose: Next gives those higher priority and they
 * would override anything set here).
 */
export interface AppBrandMetadata {
  /** <title> used on segments without their own title (e.g. marketing home). */
  titleDefault: string;
  /** Template applied to child page titles, e.g. "%s | AF Operasyon". */
  titleTemplate: string;
  /** applicationName + OG siteName. */
  applicationName: string;
  /** Meta description. */
  description: string;
  /** Canonical site origin for this brand (OG url / metadataBase fallback). */
  siteUrl: string;
  /** Favicon + apple-touch icon paths, all under /public. */
  icons: { icon: string; png: string; apple: string };
}

export interface AppBrand {
  /** Stable key for the resolved brand. */
  key: "lospia" | "af";
  /** Alt text / brand name. */
  name: string;
  /** Small mark — sidebar brand row + collapsed rail. */
  icon: string;
  /** Horizontal wordmark lockup — expanded sidebar footer. */
  logo: string;
  /** Wide login-card logo. */
  loginLogo: string;
  /** Optional pilot/tenant subline on the login card (AF only). */
  loginSubtitle?: string;
  /**
   * Sidebar-footer lockup height class. The footer logo is a deliberate brand
   * sign-off, not a watermark, so it sits larger than the compact header mark.
   * AF's horizontal wordmark needs more height than the Lospia lockup to read
   * with equal presence.
   */
  footerLogoHeightClass: string;
  /** Browser/tab metadata (title + favicon/app icons). */
  metadata: AppBrandMetadata;
}

export const LOSPIA_BRAND: AppBrand = {
  key: "lospia",
  name: PRODUCT_NAME,
  icon: LOSPIA_ICON,
  logo: LOSPIA_LOGO,
  loginLogo: LOSPIA_LOGO,
  footerLogoHeightClass: "h-9",
  metadata: {
    titleDefault: "Lospia | Operasyon Paneli",
    titleTemplate: "%s | Lospia",
    applicationName: "Lospia",
    description:
      "Lospia; görevler, ekip akışı, onaylar ve operasyon takibi için modern bir çalışma alanı.",
    siteUrl: "https://lospia.com",
    // Preserved copies of the former app/ convention icons — byte-identical to
    // the Lospia favicon that shipped before, just served from /public now.
    icons: {
      icon: "/brand/lospia/favicon.ico",
      png: "/brand/lospia/icon-app.png",
      apple: "/brand/lospia/apple-icon.png",
    },
  },
};

// AF Operasyon pilot assets — the original pre-Lospia deliverables, still in
// public/brands. Never replaced by the Lospia mark on the AF host.
export const AF_ICON = "/brands/af-icon.png";
export const AF_LOGO = "/brands/asli-filinta-logo.png";
export const AF_LOGIN_LOGO = "/brands/aslifilinta-login.png";

export const AF_BRAND: AppBrand = {
  key: "af",
  name: "Aslı Filinta",
  icon: AF_ICON,
  logo: AF_LOGO,
  loginLogo: AF_LOGIN_LOGO,
  loginSubtitle: "Aslı Filinta Operasyon",
  // AF's wordmark is a wide horizontal lockup that reads small; give it more
  // height so the sign-off feels intentional and balanced.
  footerLogoHeightClass: "h-11",
  metadata: {
    titleDefault: "AF Operasyon",
    titleTemplate: "%s | AF Operasyon",
    applicationName: "AF Operasyon",
    description:
      "Aslı Filinta Operasyon — görev, onay ve haftalık takip paneli.",
    siteUrl: "https://operasyon.aslifilinta.com",
    // The AF mark is a single square PNG; reuse it for every icon slot.
    icons: {
      icon: "/brands/af-icon.png",
      png: "/brands/af-icon.png",
      apple: "/brands/af-icon.png",
    },
  },
};

/**
 * Resolve the app-shell brand for a request host. The AF Operasyon pilot host
 * keeps its own branding; everything else (lospia.com, www, previews,
 * localhost) is Lospia.
 */
export function getAppBrandForHost(host: string | null | undefined): AppBrand {
  return isAfOperationsHost(host) ? AF_BRAND : LOSPIA_BRAND;
}
