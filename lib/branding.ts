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
}

export const LOSPIA_BRAND: AppBrand = {
  key: "lospia",
  name: PRODUCT_NAME,
  icon: LOSPIA_ICON,
  logo: LOSPIA_LOGO,
  loginLogo: LOSPIA_LOGO,
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
};

/**
 * Resolve the app-shell brand for a request host. The AF Operasyon pilot host
 * keeps its own branding; everything else (lospia.com, www, previews,
 * localhost) is Lospia.
 */
export function getAppBrandForHost(host: string | null | undefined): AppBrand {
  return isAfOperationsHost(host) ? AF_BRAND : LOSPIA_BRAND;
}
