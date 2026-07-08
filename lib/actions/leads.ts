"use server";

import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { sendEmail } from "@/lib/email/send-email";
import { leadReceivedEmail } from "@/lib/email/templates/lead-received";

// Public request-access lead capture — the ONLY unauthenticated mutation in
// the app. Writes to request_access_leads, which is insert-only under RLS
// (no select/update/delete policies), so nothing can be read back through
// the anon key even if this action is abused.
//
// After a successful insert it fires a best-effort internal notification mail
// (see the email dispatch below). Mail is a bonus — lead'ler her durumda
// Supabase dashboard'dan da takip edilir.

const WORKFLOW_TOOLS = [
  "Excel",
  "WhatsApp",
  "Notion",
  "ClickUp / Monday / Asana",
  "Diğer",
] as const;

// Bands mirror the public pricing packages (Başlangıç / Marka Operasyon /
// Geniş Ekip). Stored as plain text in request_access_leads.team_size.
const TEAM_SIZES = ["1-15", "16-50", "51+"] as const;

const LeadSchema = z.object({
  name: z.string().trim().min(1, "İsim gerekli").max(200),
  email: z
    .string()
    .trim()
    .min(1, "E-posta gerekli")
    .max(320)
    .email("Geçerli bir e-posta adresi girin"),
  company_name: z.string().trim().min(1, "Şirket / marka adı gerekli").max(200),
  // Phone is captured for the setup call but there is no dedicated column yet
  // (that would need a migration we deliberately don't run in this phase), so
  // it is folded into `note` below rather than dropped.
  phone: z.string().trim().max(50).nullable().optional(),
  team_size: z.enum(TEAM_SIZES).nullable().optional(),
  current_workflow_tool: z.enum(WORKFLOW_TOOLS).nullable().optional(),
  main_operational_pain: z.string().trim().max(2000).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});

export type RequestAccessInput = z.infer<typeof LeadSchema>;

export async function submitRequestAccess(
  input: RequestAccessInput
): Promise<{ success?: true; error?: string }> {
  const parsed = LeadSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Merge phone into the free-text note column (no `phone` column exists yet).
  const noteParts: string[] = [];
  if (parsed.data.phone) noteParts.push(`Telefon: ${parsed.data.phone}`);
  if (parsed.data.note) noteParts.push(parsed.data.note);
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
