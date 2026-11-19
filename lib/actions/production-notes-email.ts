"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send-email";
import { toActionErrorMessage } from "@/lib/utils/supabase-errors";
import { getDisplayNotificationEmail } from "@/lib/utils/notification-email";
import { logWorkspaceActivity } from "@/lib/activity/log-workspace-activity";
import { DECISIONS } from "@/lib/order-review/model";
import { meetingNotesEmail, printableNotes } from "@/lib/production/meeting-notes-email";
import type { OrderReviewDecision, OrderReviewNote } from "@/types";

/**
 * FÖYÜN TOPLANTI NOTLARINI E-POSTAYLA GÖNDER (8.11.2026 toplantısı).
 *
 * Alıcı iki kaynaktan gelir — AF Teamwork paylaşımıyla aynı düzen
 * (lib/actions/document-files.ts → sendDocumentByEmail):
 *   • panelden seçilen kişi: adresi KİMLİKTEN çözülür (bildirim adresi, yoksa
 *     profil adresi); adres istemciden alınmaz,
 *   • elle yazılan adres: tek tek doğrulanır.
 * Aynı adrese tek posta gider. Posta GERİ ALINAMAZ: kaydetmenin yan etkisi
 * değildir, yalnız "Gönder"e basılınca çalışır.
 */

const AUTH_REQUIRED = "Kimlik doğrulama gerekli.";
const NOT_FOUND = "Föy bulunamadı.";
const MAIL_NOT_CONFIGURED =
  "E-posta gönderimi bu ortamda kapalı. Sunucuda EMAIL_NOTIFICATIONS_ENABLED=true ve bir e-posta sağlayıcısı tanımlı olmalı.";

const APP_BASE_URL = (
  process.env.EMAIL_TASK_BASE_URL ?? "https://operasyon.aslifilinta.com"
).replace(/\/+$/, "");

const Input = z.object({
  memberIds: z.array(z.string().min(1).max(64)).max(50).optional().default([]),
  recipients: z
    .array(z.string().trim().email("Geçersiz e-posta adresi."))
    .max(20, "Tek seferde en fazla 20 adrese gönderilebilir.")
    .optional()
    .default([]),
  note: z.string().trim().max(1000).optional().nullable(),
}).refine((v) => v.memberIds.length + v.recipients.length > 0, {
  message: "En az bir kişi seçin ya da e-posta adresi girin.",
});

export type SendMeetingNotesInput = z.input<typeof Input>;

export async function sendSheetMeetingNotes(
  sheetId: string,
  input: SendMeetingNotesInput,
): Promise<{ ok: true; sent: string[]; failed: { to: string; reason: string }[] } | { error: string }> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: AUTH_REQUIRED };
  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  const workspaceId = (member as { workspace_id: string } | null)?.workspace_id;
  if (!workspaceId) return { error: AUTH_REQUIRED };

  const { data: row, error: readErr } = await supabase
    .from("production_sheets")
    .select("id, title, product_code, meeting_notes, review_critique, review_decision")
    .eq("id", sheetId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (readErr) return { error: toActionErrorMessage(readErr) };
  if (!row) return { error: NOT_FOUND };
  const sheet = row as {
    id: string; title: string | null; product_code: string | null;
    meeting_notes: OrderReviewNote[] | null; review_critique: string | null;
    review_decision: OrderReviewDecision | null;
  };

  /* Boş posta gitmez: gönderilen şey DİSKTEKİ notlardır. */
  const notes = printableNotes(sheet.meeting_notes);
  if (!notes.length && !(sheet.review_critique ?? "").trim()) {
    return { error: "Gönderilecek not yok. Önce not ekleyin." };
  }

  /* Seçilen kişilerin adresi kimlikten çözülür; adresi olmayan sessizce
     düşmez, sonuçta yazar. */
  const noAddress: { to: string; reason: string }[] = [];
  const memberEmails: string[] = [];
  if (parsed.data.memberIds.length) {
    const { data: mrows } = await supabase
      .from("workspace_members")
      .select("user_id, notification_email, profiles(full_name, email)")
      .eq("workspace_id", workspaceId)
      .in("user_id", parsed.data.memberIds);
    type P = { full_name: string | null; email: string | null };
    for (const m of (mrows ?? []) as { user_id: string; notification_email: string | null; profiles: P | P[] | null }[]) {
      const pr = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      const { email } = getDisplayNotificationEmail({
        notification_email: m.notification_email,
        profiles: { email: pr?.email ?? null },
      });
      if (email) memberEmails.push(email);
      else noAddress.push({ to: pr?.full_name || "Adsız kişi", reason: "E-posta adresi tanımlı değil" });
    }
  }
  const recipients = [
    ...new Set([...memberEmails, ...parsed.data.recipients].map((r) => r.trim().toLowerCase())),
  ];
  if (!recipients.length) {
    return { error: noAddress.length
      ? "Seçilen kişilerin e-posta adresi tanımlı değil (Ayarlar → Kişiler)."
      : "Gönderilecek adres bulunamadı." };
  }

  const { data: actor } = await supabase
    .from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();
  const actorName =
    ((actor?.full_name as string | null) || (actor?.email as string | null)) ?? null;
  const decisionLabel = sheet.review_decision
    ? DECISIONS.find((d) => d.key === sheet.review_decision)?.label ?? null
    : null;

  const sent: string[] = [];
  const failed: { to: string; reason: string }[] = [...noAddress];
  for (const to of recipients) {
    const res = await sendEmail(
      meetingNotesEmail({
        to,
        sheetTitle: sheet.title ?? "",
        productCode: sheet.product_code,
        decisionLabel,
        critique: sheet.review_critique,
        notes,
        url: `${APP_BASE_URL}/production/${sheet.id}`,
        actorName,
        note: parsed.data.note ?? null,
      }),
    );
    /* Posta hiç yapılandırılmamışsa her adres aynı sebeple düşer; ilk
       cevapta durur ve bunu açıkça söyleriz. */
    if (res.status === "skipped") return { error: MAIL_NOT_CONFIGURED };
    if (res.status === "sent") sent.push(to);
    else failed.push({ to, reason: res.error });
  }

  if (sent.length) {
    /* KİME gittiği günlüğe yazılır (föy içeriği sistemin dışına çıkıyor).
       Ayrı eylem adı: SHEET_SENT "föyü üreticiye gönderdi" demek, bu o değil. */
    await logWorkspaceActivity(supabase, {
      workspaceId, actorId: user.id,
      action: "sheet_notes_sent", entityType: "production_sheet",
      entityId: sheet.id, entityLabel: sheet.title ?? "Föy",
      metadata: { to: sent, failed: failed.map((f) => f.to) },
    });
  }
  return { ok: true, sent, failed };
}
