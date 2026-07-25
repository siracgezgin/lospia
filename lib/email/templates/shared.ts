// ---------------------------------------------------------------------------
// Shared HTML email helpers
// ---------------------------------------------------------------------------
// Dependency-free building blocks for our transactional emails. No React Email,
// no MJML — just small, well-tested string helpers producing inline-styled HTML
// that survives Gmail / Outlook. Every template shares one visual shell so the
// brand stays consistent and the escaping story lives in exactly one place.
//
// SECURITY: user-controlled text (names, titles, company, free-text notes) MUST
// be passed through `escapeHtml` before it reaches any HTML sink. `renderButton`
// and layout links only accept URLs we build ourselves; still, they are placed
// in an attribute context, so escape defensively there too.

/** Escape the five significant HTML characters. Safe for text + attributes. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Brand palette — kept intentionally small and inline-friendly.
const COLORS = {
  pageBg: "#f4f5f7",
  cardBg: "#ffffff",
  border: "#e5e7eb",
  heading: "#111827",
  body: "#374151",
  muted: "#6b7280",
  brand: "#4f46e5", // corporate indigo/blue-purple
  brandText: "#ffffff",
} as const;

const FONT_STACK =
  "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Brand line shown at the top of every email and referenced in the footer.
// Single source of truth so the header, footer, subjects and signatures never
// drift. `EMAIL_BRAND_NAME` is the top banner; `EMAIL_BRAND_FOOTER_NAME` is the
// plain product name used in the footer note, subjects and signatures.
export const EMAIL_BRAND_NAME = "AF-Operasyon Notifications";
export const EMAIL_BRAND_FOOTER_NAME = "AF Operasyon";

/**
 * A single call-to-action button. `label` is treated as trusted UI copy (we
 * never pass user input as a button label), but `href` is escaped for the
 * attribute context as a defensive measure — callers only ever pass URLs we
 * assemble ourselves.
 */
export function renderButton(href: string, label: string): string {
  const safeHref = escapeHtml(href);
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 8px 0 4px;">
      <tr>
        <td align="center" bgcolor="${COLORS.brand}" style="border-radius: 6px;">
          <a href="${safeHref}"
             style="display: inline-block; padding: 12px 24px; font-family: ${FONT_STACK}; font-size: 15px; font-weight: 600; line-height: 1; color: ${COLORS.brandText}; text-decoration: none; border-radius: 6px;">
            ${label}
          </a>
        </td>
      </tr>
    </table>`;
}

/**
 * One "key: value" detail row for the internal lead mail. Both sides are
 * escaped — `value` is user input, `label` is trusted copy escaped for safety.
 */
export function renderDetailRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding: 6px 0; font-family: ${FONT_STACK}; font-size: 14px; color: ${COLORS.muted}; vertical-align: top; width: 180px;">${escapeHtml(
        label,
      )}</td>
      <td style="padding: 6px 0; font-family: ${FONT_STACK}; font-size: 14px; color: ${COLORS.body}; vertical-align: top;">${escapeHtml(
        value,
      )}</td>
    </tr>`;
}

/**
 * Wrap template body HTML in the shared branded shell: light-grey page, a
 * centred white card (max 600px), a small brand line at the top and a
 * muted footer. `bodyHtml` is expected to already be safe HTML (built from
 * escaped fragments by the caller).
 */
export function renderEmailShell(params: { title: string; bodyHtml: string }): string {
  const { title, bodyHtml } = params;
  const safeTitle = escapeHtml(title);

  return `<!DOCTYPE html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <title>${safeTitle}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: ${COLORS.pageBg};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${COLORS.pageBg};">
      <tr>
        <td align="center" style="padding: 24px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 600px;">
            <tr>
              <td style="padding: 0 4px 12px; font-family: ${FONT_STACK}; font-size: 13px; font-weight: 600; letter-spacing: 0.3px; color: ${COLORS.muted}; text-transform: uppercase;">
                ${EMAIL_BRAND_NAME}
              </td>
            </tr>
            <tr>
              <td style="background-color: ${COLORS.cardBg}; border: 1px solid ${COLORS.border}; border-radius: 10px; padding: 32px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding: 16px 4px 0; font-family: ${FONT_STACK}; font-size: 12px; line-height: 1.5; color: ${COLORS.muted};">
                Bu e-posta ${EMAIL_BRAND_FOOTER_NAME} tarafından otomatik gönderildi. Yanıtlamanız gerekmez.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** A heading + one or more paragraphs, the common top of every card body. */
export function renderHeading(text: string): string {
  return `<h1 style="margin: 0 0 16px; font-family: ${FONT_STACK}; font-size: 20px; font-weight: 700; line-height: 1.3; color: ${COLORS.heading};">${escapeHtml(
    text,
  )}</h1>`;
}

/** A body paragraph. `text` is escaped — safe for user-derived copy. */
export function renderParagraph(text: string): string {
  return `<p style="margin: 0 0 16px; font-family: ${FONT_STACK}; font-size: 15px; line-height: 1.6; color: ${COLORS.body};">${escapeHtml(
    text,
  )}</p>`;
}
