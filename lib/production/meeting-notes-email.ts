/**
 * FÖYÜN TOPLANTI NOTLARI → E-POSTA.
 *
 * Aslı Hanım (8.11.2026 toplantısı): toplantıda föye yazılan notlar ilgili
 * kişilere e-postayla gitsin; kişi panelden seçilsin, panelde olmayan biri
 * için adres elle yazılsın. Sıraç: mevcut mail altyapısı (toplantı daveti ve
 * AF Teamwork paylaşımıyla aynı kabuk ve aynı gönderici).
 *
 * Posta notların KENDİSİNİ taşır — alıcı panele girmeden okuyabilsin (dışarıdan
 * biri de alabilir) — ve föye götüren tek bir düğme. Fiyat, maliyet ve ölçü
 * GİTMEZ: bu posta toplantıda konuşulanın kaydıdır, föyün kopyası değil.
 * Kullanıcının yazdığı her metin `shared.ts` yardımcılarıyla kaçırılır.
 */

import type { EmailMessage } from "@/lib/email/types";
import {
  EMAIL_BRAND_FOOTER_NAME, escapeHtml, renderButton, renderDetailCard, renderDetailRow,
  renderEmailShell, renderFallbackLink, renderHeading, renderParagraph,
} from "@/lib/email/templates/shared";
import type { OrderReviewNote } from "@/types";

export interface MeetingNotesEmailParams {
  to: string;
  sheetTitle: string;
  productCode?: string | null;
  /** Okunur karar etiketi ("Onaylandı") — yoksa satırı çizilmez. */
  decisionLabel?: string | null;
  critique?: string | null;
  notes: OrderReviewNote[];
  /** Föyün paneldeki adresi. */
  url: string;
  actorName?: string | null;
  /** Gönderenin serbest notu. */
  note?: string | null;
}

const dateTR = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
};

/** Boş olmayan notlar, en yeni üstte. */
export function printableNotes(notes: OrderReviewNote[] | null | undefined): OrderReviewNote[] {
  return (Array.isArray(notes) ? notes : [])
    .filter((n) => (n.text ?? "").trim() !== "")
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function meetingNotesEmail(params: MeetingNotesEmailParams): EmailMessage {
  const { to, sheetTitle, productCode, decisionLabel, url, actorName } = params;
  const notes = printableNotes(params.notes);
  const critique = (params.critique ?? "").trim();
  const note = (params.note ?? "").trim();
  const who = actorName?.trim();
  const title = sheetTitle.trim() || "Üretim föyü";

  const subject = `Toplantı notları — ${title}${productCode?.trim() ? ` (${productCode.trim()})` : ""}`;
  const lead = who
    ? `${who} bu ürünün toplantı notlarını sizinle paylaştı.`
    : "Bu ürünün toplantı notları sizinle paylaşıldı.";

  const details: [string, string][] = [["Ürün", title]];
  if (productCode?.trim()) details.push(["Ürün kodu", productCode.trim()]);
  if (decisionLabel?.trim()) details.push(["Karar", decisionLabel.trim()]);

  // ── Düz metin ────────────────────────────────────────────────────────────
  const text = [
    "Merhaba,",
    "",
    lead,
    "",
    ...details.map(([k, v]) => `${k}: ${v}`),
    ...(note ? ["", note] : []),
    ...(notes.length ? ["", "NOTLAR", ...notes.flatMap((n) => ["", dateTR(n.date), n.text.trim()])] : []),
    ...(critique ? ["", "ÜRÜN KRİTİKLERİ / DENEME NOTLARI", critique] : []),
    "",
    `Föy: ${url}`,
    "",
    `— ${who || "Aslı Filinta ekibi"} · ${EMAIL_BRAND_FOOTER_NAME}`,
  ].join("\n");

  // ── HTML ─────────────────────────────────────────────────────────────────
  const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const block = (heading: string, inner: string) =>
    `<h2 style="margin: 22px 0 8px; font-family: ${FONT}; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #5b6872;">${escapeHtml(heading)}</h2>${inner}`;
  const pre = (body: string) =>
    `<p style="margin: 0 0 12px; font-family: ${FONT}; font-size: 15px; line-height: 1.6; color: #10171c; white-space: pre-line;">${escapeHtml(body)}</p>`;
  const noteRows = notes
    .map((n) =>
      `<p style="margin: 0 0 2px; font-family: ${FONT}; font-size: 12.5px; font-weight: 600; color: #00537a;">${escapeHtml(dateTR(n.date))}</p>${pre(n.text.trim())}`)
    .join("");

  const bodyHtml =
    renderHeading(`Toplantı notları — ${title}`) +
    renderParagraph(lead) +
    renderDetailCard(details.map(([k, v]) => renderDetailRow(k, v)).join("")) +
    (note
      ? `<p style="margin: 0 0 16px; padding: 10px 12px; background: #f4f7f9; border-left: 3px solid #c6d3db; font-family: ${FONT}; font-size: 15px; line-height: 1.6; color: #10171c; white-space: pre-line;">${escapeHtml(note)}</p>`
      : "") +
    (notes.length ? block("Notlar", noteRows) : "") +
    (critique ? block("Ürün kritikleri / deneme notları", pre(critique)) : "") +
    renderButton(url, "Föyü aç") +
    renderFallbackLink(url);

  return { to, subject, text, html: renderEmailShell({ title: subject, bodyHtml, preheader: lead }) };
}
