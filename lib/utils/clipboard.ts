/**
 * Clipboard helpers for the Şablon Kütüphanesi copy buttons.
 *
 * copyRichText writes text/html + text/plain together (so pasting into
 * Gmail/Word keeps formatting, pasting into WhatsApp falls back to plain
 * text). Every path degrades gracefully: ClipboardItem → writeText → false.
 */

export async function copyPlainText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function copyRichText(html: string, plain: string): Promise<boolean> {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
      return true;
    } catch {
      // fall through to plain text
    }
  }
  return copyPlainText(plain);
}
