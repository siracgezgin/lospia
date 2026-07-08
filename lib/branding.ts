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
