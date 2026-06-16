// Module: Slack — HMAC signature verification for incoming slash commands
// gated by NEXT_PUBLIC_FEATURE_SLACK_ENABLED=true

import { createHmac, timingSafeEqual } from "crypto";

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET ?? "";
const SLACK_SIGNATURE_VERSION = "v0";

/**
 * Verify a Slack request signature.
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export async function verifySlackSignature(request: Request): Promise<boolean> {
  if (!SLACK_SIGNING_SECRET) return false;

  const timestamp = request.headers.get("x-slack-request-timestamp");
  const signature = request.headers.get("x-slack-signature");

  if (!timestamp || !signature) return false;

  // Reject requests older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  const body = await request.clone().text();
  const sigBase = `${SLACK_SIGNATURE_VERSION}:${timestamp}:${body}`;
  const hmac = createHmac("sha256", SLACK_SIGNING_SECRET);
  hmac.update(sigBase);
  const computed = `${SLACK_SIGNATURE_VERSION}=` + hmac.digest("hex");

  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Send a message to a Slack incoming webhook URL.
 */
export async function sendSlackMessage(
  webhookUrl: string,
  text: string,
  blocks?: object[]
): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(blocks ? { text, blocks } : { text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
