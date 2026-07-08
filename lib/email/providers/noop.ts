// No-op email provider — the safe default.
//
// Used when EMAIL_NOTIFICATIONS_ENABLED is not "true", when EMAIL_PROVIDER is
// unset/"noop", or as a graceful fallback. It never sends anything and never
// throws, so the app boots and behaves identically with mail disabled.

import type { EmailProvider } from "../types";

export function createNoopProvider(): EmailProvider {
  return {
    async send() {
      return { status: "skipped", reason: "noop provider" };
    },
  };
}
