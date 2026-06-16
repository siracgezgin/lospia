/**
 * Cloudflare Email Routing Worker Stub
 * ------------------------------------
 * Deploy this worker in Cloudflare Dashboard → Email Routing → Workers.
 * It receives inbound emails and forwards them to SpikOS TaskOS's /api/inbound-email.
 *
 * Environment variables to set in the Cloudflare Worker:
 *   TASKOS_INBOUND_URL  = https://your-domain.com/api/inbound-email
 *   EMAIL_INBOUND_SECRET = same value as in your app's .env.local
 *
 * Cloudflare email worker API:
 *   https://developers.cloudflare.com/email-routing/email-workers/
 *
 * @example Deploy with:
 *   wrangler deploy modules/email-to-task/cloudflare-worker.ts --name taskos-email
 */

import { createHmac } from "crypto";

interface Env {
  TASKOS_INBOUND_URL: string;
  EMAIL_INBOUND_SECRET: string;
}

// Cloudflare email worker handler signature
export default {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async email(message: EmailMessage, env: Env, _ctx: any): Promise<void> {
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
    const body_text = rawBody.slice(0, 10000); // limit body size

    const payload = { subject, from, workspace_alias, body_text };
    const rawPayload = JSON.stringify(payload);

    // Compute HMAC signature
    let hmac_signature = "";
    if (env.EMAIL_INBOUND_SECRET) {
      hmac_signature = createHmac("sha256", env.EMAIL_INBOUND_SECRET)
        .update(rawPayload)
        .digest("hex");
    }

    const response = await fetch(env.TASKOS_INBOUND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, hmac_signature }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`TaskOS inbound failed: ${response.status} ${errText}`);
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
