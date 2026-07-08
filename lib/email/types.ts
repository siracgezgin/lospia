// ---------------------------------------------------------------------------
// Email abstraction — shared types
// ---------------------------------------------------------------------------
// A minimal, provider-agnostic contract. Callers build an `EmailMessage`, hand
// it to `sendEmail`, and inspect a `SendEmailResult`. Email is always
// best-effort in this app: `sendEmail` never throws for configuration issues,
// it returns a `skipped` result instead so the calling flow (lead submit, task
// notification) is never broken by mail.

export interface EmailMessage {
  /** Single recipient. We send one mail per person — never CC/BCC others. */
  to: string;
  subject: string;
  /** Plain-text body (UTF-8). No HTML in the MVP. */
  text: string;
}

export type SendEmailResult =
  | { status: "sent"; id?: string }
  | { status: "skipped"; reason: string }
  | { status: "error"; error: string };

export interface EmailProvider {
  send(message: EmailMessage): Promise<SendEmailResult>;
}
