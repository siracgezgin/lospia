// Internal notification template — a new request-access lead arrived.
//
// This mail goes ONLY to an internal Lospia address (LEAD_NOTIFICATION_TO /
// sales@lospia.com), never to the lead themselves.

import type { EmailMessage } from "../types";
import {
  renderButton,
  renderDetailRow,
  renderEmailShell,
  renderHeading,
  renderParagraph,
} from "./shared";

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

// Where the internal CTA points. Reuses the existing task base-url env with the
// same fallback as the notification bridge; no new env is introduced.
const DEFAULT_PANEL_URL = "https://operasyon.aslifilinta.com";

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

  // Build the HTML detail table from the same fields (each value escaped inside
  // renderDetailRow). Optional fields are only rendered when present.
  const rows = [
    renderDetailRow("Ad", data.name),
    renderDetailRow("E-posta", data.email),
    renderDetailRow("Şirket / Marka", data.company_name),
  ];
  if (data.team_size) rows.push(renderDetailRow("Ekip boyutu", data.team_size));
  if (data.current_workflow_tool)
    rows.push(renderDetailRow("Mevcut araç", data.current_workflow_tool));
  if (data.main_operational_pain)
    rows.push(renderDetailRow("Ana operasyon sıkıntısı", data.main_operational_pain));
  if (data.note) rows.push(renderDetailRow("Not", data.note));
  if (data.created_at) rows.push(renderDetailRow("Tarih", data.created_at));

  const panelUrl = process.env.EMAIL_TASK_BASE_URL ?? DEFAULT_PANEL_URL;

  const html = renderEmailShell({
    title: "Yeni Lospia erişim talebi",
    bodyHtml: [
      renderHeading("Yeni görüşme talebi"),
      renderParagraph("Web sitesi üzerinden yeni bir Lospia erişim talebi geldi."),
      `<table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; margin: 0 0 20px;">${rows.join(
        "",
      )}</table>`,
      renderButton(panelUrl, "Lospia paneline git"),
    ].join("\n"),
  });

  return {
    to,
    subject: `Yeni Lospia erişim talebi — ${data.company_name}`,
    text: lines.join("\n"),
    html,
  };
}
