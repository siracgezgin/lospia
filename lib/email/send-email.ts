// ---------------------------------------------------------------------------
// Email dispatch entry point
// ---------------------------------------------------------------------------
// The single function every caller uses. It decides — from server-only env —
// whether to send at all and which provider to use, then delegates. It is
// deliberately total: it NEVER throws. Configuration problems and provider
// errors come back as `skipped`/`error` results so the caller's real work
// (saving a lead, writing a notification) is never interrupted by mail.
//
// SECURITY: server-only. No email secret is ever read outside this tree, and
// the browser guard hard-fails if this module is bundled for the client.

import type { EmailMessage, SendEmailResult } from "./types";
import { createNoopProvider } from "./providers/noop";
import { createGmailProvider } from "./providers/gmail";

if (typeof window !== "undefined") {
  throw new Error("lib/email/send-email.ts must never be imported in the browser");
}

export async function sendEmail(message: EmailMessage): Promise<SendEmailResult> {
  // Master switch. Nothing is sent unless explicitly enabled.
  if (process.env.EMAIL_NOTIFICATIONS_ENABLED !== "true") {
    return { status: "skipped", reason: "EMAIL_NOTIFICATIONS_ENABLED is not 'true'" };
  }

  const providerName = (process.env.EMAIL_PROVIDER ?? "noop").toLowerCase();

  let provider;
  switch (providerName) {
    case "gmail":
      provider = createGmailProvider();
      break;
    case "":
    case "noop":
      provider = createNoopProvider();
      break;
    default:
      return { status: "skipped", reason: `Unknown EMAIL_PROVIDER "${providerName}"` };
  }

  try {
    return await provider.send(message);
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}
