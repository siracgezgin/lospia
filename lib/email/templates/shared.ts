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

// Brand palette — mirrors the app's UI tokens (globals.css --brand family) so
// mail and product read as one system. Kept small and inline-friendly.
const COLORS = {
  pageBg: "#f4f5f7",
  cardBg: "#ffffff",
  border: "#e5e7eb",
  heading: "#111827",
  body: "#374151",
  muted: "#6b7280",
  brand: "#2f5d6b", // app --brand (petrol)
  brandStrong: "#264c58", // app --brand-strong
  brandSoft: "#eaf2f4", // app --brand-soft
  brandText: "#ffffff",
} as const;

const FONT_STACK =
  "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Brand line shown at the top of every email and referenced in the footer.
// Single source of truth so the header, footer, subjects and signatures never
// drift. `EMAIL_BRAND_NAME` is the top banner; `EMAIL_BRAND_FOOTER_NAME` is the
// plain product name used in the footer note, subjects and signatures.
export const EMAIL_BRAND_NAME = "AF Operasyon";
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
 * centred white card (max 600px) with a brand accent bar, a wordmark header
 * and a muted footer. `bodyHtml` is expected to already be safe HTML (built
 * from escaped fragments by the caller). `preheader` is the hidden preview
 * line mail clients show next to the subject — pass the one-sentence gist.
 */
export function renderEmailShell(params: {
  title: string;
  bodyHtml: string;
  preheader?: string;
}): string {
  const { title, bodyHtml, preheader } = params;
  const safeTitle = escapeHtml(title);
  const preheaderHtml = preheader
    ? `<div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">${escapeHtml(
        preheader,
      )}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <title>${safeTitle}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: ${COLORS.pageBg};">
    ${preheaderHtml}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${COLORS.pageBg};">
      <tr>
        <td align="center" style="padding: 32px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 600px;">
            <tr>
              <td style="padding: 0 4px 14px;">
                <span style="font-family: ${FONT_STACK}; font-size: 14px; font-weight: 700; letter-spacing: 2px; color: ${COLORS.brandStrong}; text-transform: uppercase;">${EMAIL_BRAND_NAME}</span>
                <span style="font-family: ${FONT_STACK}; font-size: 12px; color: ${COLORS.muted};">&nbsp;·&nbsp;Görev Bildirimi</span>
              </td>
            </tr>
            <tr>
              <td style="background-color: ${COLORS.cardBg}; border: 1px solid ${COLORS.border}; border-top: 3px solid ${COLORS.brand}; border-radius: 10px; padding: 32px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding: 18px 4px 0; font-family: ${FONT_STACK}; font-size: 12px; line-height: 1.6; color: ${COLORS.muted};">
                Bu e-posta ${EMAIL_BRAND_FOOTER_NAME} görev sistemi tarafından otomatik gönderilmiştir; yanıtlamanız gerekmez.<br />
                Bildirim tercihlerinizi uygulamadaki Profil sayfanızdan yönetebilirsiniz.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * A soft-background detail card of "label → value" rows (task title, due date, …).
 * Values are user-derived and escaped by `renderDetailRow`. Rows with no value
 * should be filtered by the caller before rendering.
 */
export function renderDetailCard(rowsHtml: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 4px 0 20px; background-color: ${COLORS.brandSoft}; border-radius: 8px;">
      <tr>
        <td style="padding: 14px 18px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${rowsHtml}
          </table>
        </td>
      </tr>
    </table>`;
}

/**
 * Muted fallback link line under the CTA button — some clients strip buttons;
 * the raw URL keeps the mail actionable everywhere.
 */
export function renderFallbackLink(href: string): string {
  const safeHref = escapeHtml(href);
  return `<p style="margin: 12px 0 0; font-family: ${FONT_STACK}; font-size: 12px; line-height: 1.6; color: ${COLORS.muted};">
    Buton açılmıyorsa bu bağlantıyı kullanın:<br />
    <a href="${safeHref}" style="color: ${COLORS.brand}; word-break: break-all;">${safeHref}</a>
  </p>`;
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
