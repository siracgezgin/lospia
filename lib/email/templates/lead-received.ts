// Internal notification template — a new request-access lead arrived.
//
// This mail goes ONLY to an internal Lospia address (LEAD_NOTIFICATION_TO /
// sales@lospia.com), never to the lead themselves.

import type { EmailMessage } from "../types";

export interface LeadReceivedData {
  name: string;
  email: string;
  company_name: string;
  team_size?: string | null;
  current_workflow_tool?: string | null;
  main_operational_pain?: string | null;
  note?: string | null;
  created_at?: string | null;
}

export function leadReceivedEmail(to: string, data: LeadReceivedData): EmailMessage {
  const lines = [
    "Yeni Lospia erişim talebi alındı.",
    "",
    `Ad: ${data.name}`,
    `E-posta: ${data.email}`,
    `Şirket / Marka: ${data.company_name}`,
  ];
  if (data.team_size) lines.push(`Ekip boyutu: ${data.team_size}`);
  if (data.current_workflow_tool) lines.push(`Mevcut araç: ${data.current_workflow_tool}`);
  if (data.main_operational_pain)
    lines.push(`Ana operasyon sıkıntısı: ${data.main_operational_pain}`);
  if (data.note) lines.push(`Not: ${data.note}`);
  if (data.created_at) lines.push(`Tarih: ${data.created_at}`);
  lines.push("", "—", "Lospia");

  return {
    to,
    subject: `Yeni Lospia erişim talebi — ${data.company_name}`,
    text: lines.join("\n"),
  };
}
