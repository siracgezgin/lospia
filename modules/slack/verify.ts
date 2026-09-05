// Module: Slack — HMAC signature verification for incoming slash commands
// gated by NEXT_PUBLIC_FEATURE_SLACK_ENABLED=true
//
// Server-only: the signing secret must never reach the browser.

import { createHmac, timingSafeEqual } from "node:crypto";
import { featureFlags } from "@/lib/utils/feature-flags";

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET ?? "";
const SLACK_SIGNATURE_VERSION = "v0";
/** Replay window Slack recommends. */
const MAX_SKEW_SECONDS = 300;
/** Bir webhook çağrısı sunucuyu asla asılı bırakmasın. */
const SEND_TIMEOUT_MS = 10_000;

/** Sabit süreli karşılaştırma — uzunluk farkında da patlamaz. */
function equals(expected: string, received: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Verify a Slack request signature.
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export async function verifySlackSignature(request: Request): Promise<boolean> {
  // Bayrak kapalıyken bu modül HİÇBİR isteği doğrulamaz — diğer dördüyle aynı
  // desen (bkz. uploads / ai / realtime / email-to-task). Kapalı bir modülün
  // "bazen çalışıyor" olması en kötü hâldir.
  if (!featureFlags.slack) return false;
  if (!SLACK_SIGNING_SECRET) return false;

  const timestamp = request.headers.get("x-slack-request-timestamp");
  const signature = request.headers.get("x-slack-signature");

  if (!timestamp || !signature) return false;

  // Reject requests older than the replay window. A non-numeric header used to
  // slip through here: `Math.abs(NaN) > 300` is false, so "abc" passed the
  // freshness check. Parse first, then require a finite number.
  const sentAt = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(sentAt)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - sentAt) > MAX_SKEW_SECONDS) return false;

  const body = await request.clone().text();
  const sigBase = `${SLACK_SIGNATURE_VERSION}:${timestamp}:${body}`;
  const computed =
    `${SLACK_SIGNATURE_VERSION}=` +
    createHmac("sha256", SLACK_SIGNING_SECRET).update(sigBase, "utf8").digest("hex");

  return equals(computed, signature);
}

/**
 * Send a message to a Slack incoming webhook URL.
 * Returns false (never throws) so a failed notification can't break a flow.
 */
export async function sendSlackMessage(
  webhookUrl: string,
  text: string,
  blocks?: object[],
): Promise<boolean> {
  if (!featureFlags.slack) return false;
  if (!webhookUrl.startsWith("https://")) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(blocks ? { text, blocks } : { text }),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Durum kodu loglanır; webhook ADRESİ loglanmaz (kendisi bir sırdır).
      console.error(`[slack] mesaj gönderilemedi: ${res.status}`);
    }
    return res.ok;
  } catch (error) {
    console.error(
      "[slack] webhook çağrısı başarısız:",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}
