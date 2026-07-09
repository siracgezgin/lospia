"use server";

import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send-email";
import { leadReceivedEmail } from "@/lib/email/templates/lead-received";
import {
  requestAccessSchema,
  normalizePhone,
  HONEYPOT_FIELD,
  type RequestAccessInput,
} from "@/lib/validation/request-access";

// Public request-access lead capture — the ONLY unauthenticated mutation in
// the app. Writes to request_access_leads, which is insert-only under RLS
// (no select/update/delete policies), so nothing can be read back through
// the anon key even if this action is abused.
//
// Validation is the SERVER's job: whatever the client sent, we re-parse with
// the shared `requestAccessSchema` (lib/validation/request-access.ts) before
// touching Supabase. The client form uses the same schema for nicer UX, but
// this parse is the authoritative gate.
//
// After a successful insert it fires a best-effort internal notification mail
// (see the email dispatch below). Mail is a bonus — lead'ler her durumda
// Supabase dashboard'dan da takip edilir.

export type { RequestAccessInput };

/** Extra fields the action accepts beyond the validated schema. */
export type SubmitRequestAccessInput = RequestAccessInput & {
  /** Bot honeypot — real users leave this empty. */
  [HONEYPOT_FIELD]?: string;
};

export async function submitRequestAccess(
  input: SubmitRequestAccessInput
): Promise<{ success?: true; error?: string }> {
  // Honeypot: a filled hidden field means a bot. Return a benign success so
  // the bot gets no signal, but persist nothing.
  const honeypot = (input as Record<string, unknown>)[HONEYPOT_FIELD];
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    return { success: true };
  }

  const parsed = requestAccessSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Merge the normalized phone into the free-text note column (no `phone`
  // column exists yet — adding one needs a migration we don't run this phase).
  const noteParts: string[] = [];
  const normalizedPhone = parsed.data.phone ? normalizePhone(parsed.data.phone) : null;
  if (normalizedPhone) noteParts.push(`Telefon: ${normalizedPhone}`);
  const note = noteParts.join("\n") || null;

  const supabase = await createClient();
  const { error } = await supabase.from("request_access_leads").insert({
    name: parsed.data.name,
    email: parsed.data.email,
    company_name: parsed.data.company_name,
    team_size: parsed.data.team_size ?? null,
    current_workflow_tool: parsed.data.current_workflow_tool ?? null,
    main_operational_pain: parsed.data.main_operational_pain || null,
    note,
    source: "website",
  });

  if (error) {
    // Don't leak DB internals to an anonymous visitor.
    return { error: "Talebiniz kaydedilemedi. Lütfen tekrar deneyin." };
  }

  // Best-effort internal notification. The lead is already persisted; a mail
  // failure must never turn a successful submit into an error for the visitor.
  // This goes ONLY to an internal Lospia address, never to the lead.
  try {
    const to = process.env.LEAD_NOTIFICATION_TO ?? "sales@lospia.com";
    await sendEmail(
      leadReceivedEmail(to, {
        name: parsed.data.name,
        email: parsed.data.email,
        company_name: parsed.data.company_name,
        team_size: parsed.data.team_size ?? null,
        current_workflow_tool: parsed.data.current_workflow_tool ?? null,
        main_operational_pain: parsed.data.main_operational_pain ?? null,
        note,
        created_at: new Date().toISOString(),
      })
    );
  } catch {
    // swallow — submit already succeeded
  }

  return { success: true };
}
