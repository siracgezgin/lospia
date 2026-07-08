// Gmail API email provider.
//
// Sends via the Gmail REST API over HTTPS (users.messages.send) using an OAuth2
// refresh token. NO SMTP / Nodemailer connection is opened. This provider adds
// ZERO new dependencies: token refresh and send are plain `fetch` calls, and
// the MIME message is assembled by hand (base64 body + RFC 2047 headers so
// Turkish characters survive).
//
// SECURITY: all Gmail secrets are read from server-only env here. This module
// must never reach the browser — the guard below hard-fails if it does.

import type { EmailMessage, EmailProvider, SendEmailResult } from "../types";

if (typeof window !== "undefined") {
  throw new Error("lib/email/providers/gmail.ts must never be imported in the browser");
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
// userId "me" resolves to the mailbox that owns the refresh token. The actual
// From address (including a send-as alias like notifications@lospia.com) is
// controlled by the From header, which is driven by EMAIL_FROM.
const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export function createGmailProvider(): EmailProvider {
  return { send };
}

async function send(message: EmailMessage): Promise<SendEmailResult> {
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_OAUTH_REFRESH_TOKEN;
  const sender = process.env.GMAIL_SENDER ?? process.env.EMAIL_FROM;

  // Missing config must never crash the build or the calling flow. Skip safely.
  if (!clientId || !clientSecret || !refreshToken || !sender) {
    return { status: "skipped", reason: "Gmail OAuth env not fully configured" };
  }

  const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);
  const raw = base64url(buildMime(message, resolveFrom(sender)));

  const res = await fetch(SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      status: "error",
      error: `Gmail send failed (${res.status}): ${body.slice(0, 300)}`,
    };
  }

  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return { status: "sent", id: data.id };
}

async function getAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gmail token refresh failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Gmail token refresh returned no access_token");
  return data.access_token;
}

// From header: "EMAIL_FROM_NAME" <EMAIL_FROM>, falling back to the sender.
function resolveFrom(sender: string): string {
  const email = process.env.EMAIL_FROM ?? sender;
  const name = process.env.EMAIL_FROM_NAME;
  return name ? `${encodeHeaderWord(name)} <${email}>` : email;
}

// Assemble a minimal RFC 2822 message. The body is base64-encoded so Turkish
// characters and long lines are transmitted safely regardless of content.
function buildMime(message: EmailMessage, from: string): string {
  return [
    `From: ${from}`,
    `To: ${message.to}`,
    `Subject: ${encodeHeaderWord(message.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(message.text, "utf8").toString("base64"),
  ].join("\r\n");
}

// RFC 2047 encoded-word for header values that contain non-ASCII (Turkish).
function encodeHeaderWord(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function base64url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
