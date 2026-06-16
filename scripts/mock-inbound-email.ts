#!/usr/bin/env ts-node
// Local mock script: simulates an inbound email payload to /api/inbound-email
// Usage: npx ts-node scripts/mock-inbound-email.ts
//
// Requires NEXT_PUBLIC_FEATURE_EMAIL_TO_TASK_ENABLED=true in .env.local
// and the dev server running on http://localhost:3000

import { createHmac } from "crypto";

const EMAIL_SECRET = process.env.EMAIL_INBOUND_SECRET ?? "";
const DEV_URL = "http://localhost:3000/api/inbound-email";

async function main() {
  const payload = {
    subject: "[Mock] Task from email: Fix the login page bug",
    body_text: "The login form is not showing error messages when the password is wrong.\n\nSteps to reproduce:\n1. Go to /login\n2. Enter wrong password\n3. No error shown",
    from: "alice@taskos.local",
    workspace_alias: "spikos-dev",
  };

  let hmac_signature = "";
  if (EMAIL_SECRET) {
    const rawBody = JSON.stringify(payload);
    hmac_signature = createHmac("sha256", EMAIL_SECRET).update(rawBody).digest("hex");
  }

  const body = { ...payload, hmac_signature };

  console.log("Sending mock email payload to", DEV_URL);
  console.log("Payload:", JSON.stringify(payload, null, 2));

  const res = await fetch(DEV_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  console.log("\nResponse:", res.status, JSON.stringify(data, null, 2));

  if (!res.ok) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
