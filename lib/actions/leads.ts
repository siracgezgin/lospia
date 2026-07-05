"use server";

import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

// Public request-access lead capture — the ONLY unauthenticated mutation in
// the app. Writes to request_access_leads, which is insert-only under RLS
// (no select/update/delete policies), so nothing can be read back through
// the anon key even if this action is abused.
//
// TODO: e-posta bildirimi (Resend) bu fazda yok — Resend güvenli şekilde
// yapılandırılana kadar lead'ler Supabase dashboard'dan takip edilir.

const WORKFLOW_TOOLS = [
  "Excel",
  "WhatsApp",
  "Notion",
  "ClickUp / Monday / Asana",
  "Diğer",
] as const;

const TEAM_SIZES = ["1-5", "6-15", "16-40", "40+"] as const;

const LeadSchema = z.object({
  name: z.string().trim().min(1, "İsim gerekli").max(200),
  email: z
    .string()
    .trim()
    .min(1, "E-posta gerekli")
    .max(320)
    .email("Geçerli bir e-posta adresi girin"),
  company_name: z.string().trim().min(1, "Şirket / marka adı gerekli").max(200),
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

  const supabase = await createClient();
  const { error } = await supabase.from("request_access_leads").insert({
    ...parsed.data,
    team_size: parsed.data.team_size ?? null,
    current_workflow_tool: parsed.data.current_workflow_tool ?? null,
    main_operational_pain: parsed.data.main_operational_pain || null,
    note: parsed.data.note || null,
    source: "website",
  });

  if (error) {
    // Don't leak DB internals to an anonymous visitor.
    return { error: "Talebiniz kaydedilemedi. Lütfen tekrar deneyin." };
  }
  return { success: true };
}
