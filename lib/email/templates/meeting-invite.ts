// Toplantı daveti — EKİP DIŞI katılımcılara giden tek mail.
//
// Aslı Hanım (2026-09-07):
//   "Sabri Bey diye bizim dışımızda üreticimiz var… Toplantı mailini sen
//    buraya, şuraya bir artı koysan, bir e-mail hesabı girdirsen artıyla."
//   "Onlara 'SİZE YENİ BİR GÖREV ATANDI' DEĞİL DE 'TOPLANTIYA DAVET
//    EDİLDİNİZ' şeklinde olmalı."
//   "Artık SON TARİH diye bir şey yok — direkt TOPLANTI TARİHİ, Türkiye saati
//    ve parantezde NY saati ile beraber gönderilsin."
//
// Görev maili (task-event.ts) burada KULLANILMAZ: o mail bir göreve, bir son
// tarihe ve uygulamadaki bir bağlantıya işaret eder. Dışarıdan gelen kişinin
// hesabı yoktur; ona "Görevi görüntüle" düğmesi göstermek çalışmayan bir kapı
// açmak olurdu. Bu yüzden düğme yok, gövdede toplantının kendisi var.

import type { EmailMessage } from "../types";
import {
  EMAIL_BRAND_FOOTER_NAME,
  renderDetailCard,
  renderDetailRow,
  renderEmailShell,
  renderHeading,
  renderParagraph,
} from "./shared";

export interface MeetingInviteParams {
  to: string;
  /** "EF Bol Model Elbise Fitting" — toplantının başlığı. */
  meetingTitle: string;
  /** Hazır etiket: "8 Eylül 2026 Pazartesi". */
  dateLabel: string;
  /** Türkiye saati — ASIL saat ("16:00"). */
  istanbulTime: string | null;
  /** New York saati — parantez içinde yedek ("09:00"). */
  newYorkTime: string | null;
  /** Toplantının gündemi; boş olabilir. */
  topics?: string[];
  /** Daveti gönderen ("Aslı Filinta"). */
  actorName?: string | null;
  /** Toplantı notu / açıklaması. */
  note?: string | null;
}

/**
 * SAAT SATIRI. Türkiye saati önde, New York parantezde — davet edilen kişi
 * İstanbul'da; kendi saatini aramak zorunda kalmasın. Türkiye saati
 * hesaplanamazsa (bozuk kayıt) yalnız NY yazılır; hiçbir durumda "saat yok"
 * denip boş bırakılmaz.
 */
export function meetingTimeLabel(istanbulTime: string | null, newYorkTime: string | null): string | null {
  if (istanbulTime && newYorkTime) return `${istanbulTime} (New York ${newYorkTime})`;
  if (istanbulTime) return istanbulTime;
  if (newYorkTime) return `New York ${newYorkTime}`;
  return null;
}

export function meetingInviteEmail(params: MeetingInviteParams): EmailMessage {
  const { to, meetingTitle, dateLabel, istanbulTime, newYorkTime, topics = [], actorName, note } = params;

  const heading = "Toplantıya davet edildiniz";
  const lead = actorName?.trim()
    ? `${actorName.trim()} sizi bir toplantıya davet etti. Detaylar aşağıdadır:`
    : "Bir toplantıya davet edildiniz. Detaylar aşağıdadır:";

  const timeLabel = meetingTimeLabel(istanbulTime, newYorkTime);
  const cleanTopics = topics.map((t) => t.trim()).filter(Boolean);

  /* SON TARİH YOK. Görev mailindeki "Son tarih" satırının yerini toplantının
     kendi tarihi ve saati alır — davet edilen kişi için anlamlı olan tek
     zaman budur. */
  const detailPairs: Array<[string, string]> = [["Toplantı", meetingTitle]];
  detailPairs.push(["Tarih", dateLabel]);
  if (timeLabel) detailPairs.push(["Saat", timeLabel]);
  if (cleanTopics.length) detailPairs.push(["Konular", cleanTopics.join(" · ")]);

  const text = [
    "Merhaba,",
    "",
    lead,
    "",
    ...detailPairs.map(([label, value]) => `${label}: ${value}`),
    ...(note?.trim() ? ["", note.trim()] : []),
    "",
    "İyi çalışmalar,",
    EMAIL_BRAND_FOOTER_NAME,
  ].join("\n");

  const html = renderEmailShell({
    title: heading,
    preheader: `${meetingTitle} — ${dateLabel}${timeLabel ? ` ${timeLabel}` : ""}`,
    bodyHtml: [
      renderHeading(heading),
      renderParagraph("Merhaba,"),
      renderParagraph(lead),
      renderDetailCard(
        detailPairs.map(([label, value]) => renderDetailRow(label, value)).join("\n"),
      ),
      ...(note?.trim() ? [renderParagraph(note.trim())] : []),
    ].join("\n"),
  });

  return {
    to,
    subject: `Toplantı daveti: ${meetingTitle} — ${dateLabel}`,
    text,
    html,
  };
}
