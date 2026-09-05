/**
 * Cloudflare Email Routing Worker Stub
 * ------------------------------------
 * Deploy this worker in Cloudflare Dashboard → Email Routing → Workers.
 * It receives inbound emails and forwards them to /api/inbound-email.
 *
 * Environment variables to set in the Cloudflare Worker:
 *   TASKOS_INBOUND_URL   = https://your-domain.com/api/inbound-email
 *   EMAIL_INBOUND_SECRET = same value as EMAIL_INBOUND_SECRET in the app
 *
 * SIGNING CONTRACT (must match app/api/inbound-email/route.ts):
 *   The signature is HMAC-SHA256 (hex) of the EXACT request body bytes and
 *   travels in the `x-email-signature` header — never inside the JSON. Signing
 *   a payload and then adding the signature to that same payload changes the
 *   bytes the server verifies, which is why the old in-body `hmac_signature`
 *   field could never match. The body is serialized once and both signed and
 *   sent, so signer and verifier always see the same bytes.
 *
 * Cloudflare email worker API:
 *   https://developers.cloudflare.com/email-routing/email-workers/
 *
 * @example Deploy with:
 *   wrangler deploy modules/email-to-task/cloudflare-worker.ts --name taskos-email
 */

import { createHmac } from "node:crypto";

interface Env {
  TASKOS_INBOUND_URL: string;
  EMAIL_INBOUND_SECRET: string;
}

/** Body size the app accepts comfortably; keeps oversized mail out. */
const MAX_BODY_CHARS = 10_000;

// Cloudflare email worker handler signature
export default {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async email(message: EmailMessage, env: Env, _ctx: any): Promise<void> {
    if (!env.TASKOS_INBOUND_URL || !env.EMAIL_INBOUND_SECRET) {
      // Fail loudly: a silently dropped email is worse than a bounced one.
      throw new Error("TASKOS_INBOUND_URL and EMAIL_INBOUND_SECRET must both be set");
    }

    const subject = message.headers.get("subject") ?? "(no subject)";
    const from = message.from;

    // Extract workspace alias from the To address:
    // Expected format: <alias>+<workspace-slug>@your-domain.com
    // e.g., tasks+spikos-dev@your-domain.com → workspace_alias = "spikos-dev"
    const to = message.to ?? "";
    const aliasMatch = to.match(/\+([^@]+)@/);
    const workspace_alias = aliasMatch?.[1] ?? "default";

    // Read email body (plain text)
    const rawBody = await new Response(message.raw).text();
    const body_text = rawBody.slice(0, MAX_BODY_CHARS);

    // Serialize ONCE — these are the exact bytes that get signed and sent.
    const requestBody = JSON.stringify({ subject, from, workspace_alias, body_text });
    const signature = createHmac("sha256", env.EMAIL_INBOUND_SECRET)
      .update(requestBody, "utf8")
      .digest("hex");

    const response = await fetch(env.TASKOS_INBOUND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-email-signature": signature,
      },
      body: requestBody,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`inbound-email failed: ${response.status} ${errText.slice(0, 500)}`);
    }
  },
};

// Type stub for Cloudflare Email Routing (not in standard @types/node)
interface EmailMessage {
  from: string;
  to: string;
  headers: Headers;
  raw: ReadableStream;
  rawSize: number;
}
