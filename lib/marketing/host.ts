// Hostname-safe marketing routing — single source of truth.
//
// Lospia is the platform; AF Operasyon (operasyon.aslifilinta.com) is the
// first pilot workspace and must keep its existing app/login behavior.
// The public Lospia marketing pages ("/", "/request-access", "/legal/*")
// are only served on NON-AF hosts (localhost, future lospia.com, previews).
//
// Env (both optional, safe defaults):
//   NEXT_PUBLIC_AF_OPERATIONS_HOST      default "operasyon.aslifilinta.com"
//   NEXT_PUBLIC_MARKETING_SITE_ENABLED  default "true" — set "false" to force
//                                       the pre-marketing behavior everywhere.

const AF_OPERATIONS_HOST = (
  process.env.NEXT_PUBLIC_AF_OPERATIONS_HOST || "operasyon.aslifilinta.com"
).toLowerCase();

/** Strip port ("localhost:3000" → "localhost") and normalize case. */
function normalizeHost(host: string | null | undefined): string {
  if (!host) return "";
  return host.split(":")[0].trim().toLowerCase();
}

/** True when the request is being served on the AF Operasyon pilot domain. */
export function isAfOperationsHost(host: string | null | undefined): boolean {
  return normalizeHost(host) === AF_OPERATIONS_HOST;
}

/** Marketing site is on unless explicitly disabled via env. */
export function isMarketingSiteEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MARKETING_SITE_ENABLED !== "false";
}

/**
 * Should this host serve the public Lospia marketing pages?
 * AF host never does — it keeps the protected-app-only experience.
 */
export function isMarketingHost(host: string | null | undefined): boolean {
  return isMarketingSiteEnabled() && !isAfOperationsHost(host);
}

/** Public marketing paths — everything else stays auth-gated as before. */
export function isMarketingPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/request-access" ||
    pathname === "/legal" ||
    pathname.startsWith("/legal/")
  );
}
