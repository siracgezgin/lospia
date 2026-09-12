// Dosya paylaşımı — AF Teamwork'teki bir kaydı ekip dışına ya da içine mailler.
//
// Sıraç (2026-09-12):
//   "Bu klasörlerde mail atılabilsin. Yani klasörün içine diyelim rapor veya
//    sunum ekledik, onların da yanına mail atılma ibaresi olsun, mail atalım.
//    Calendar'daki gibi."
//
// NEDEN EK DEĞİL BAĞLANTI: bu mail dosyayı EKLEMEZ, güvenli bir indirme
// bağlantısı taşır. Üç gerekçe:
//   1. `EmailMessage` ek taşımıyor; Gmail sağlayıcısı multipart/alternative
//      gönderiyor, multipart/mixed değil. Ek desteği ayrı bir iştir.
//   2. Yükleme sınırı 25 MB; çoğu posta sunucusu 10-25 MB'lık eki reddeder.
//      Föy taraması ya da sunum tam da o boyuttadır — "gönderdim" deyip
//      sessizce düşen mail, hiç göndermemekten kötüdür.
//   3. Bağlantı SÜRELİDİR ve çalışma alanının denetiminde kalır: yanlış kişiye
//      gitse bile süresi dolar. Ek bir kez çıktıktan sonra geri alınamaz.
//
// Toplantı davetiyle (meeting-invite.ts) aynı kabuk ve aynı ton kullanılır —
// dışarıdan gelen kişi iki maili de aynı markadan gelmiş gibi okur.

import type { EmailMessage } from "../types";
import {
  EMAIL_BRAND_FOOTER_NAME,
  renderButton,
  renderDetailCard,
  renderDetailRow,
  renderEmailShell,
  renderFallbackLink,
  renderHeading,
  renderParagraph,
} from "./shared";

export interface DocumentShareParams {
  to: string;
  /** Dosyanın/kaydın adı — "2026 Kış Koleksiyon Raporu.pdf". */
  fileName: string;
  /** Okunur tür etiketi — "PDF", "Excel", "Sunum", "Yazı", "Bağlantı". */
  kindLabel: string;
  /** İndirme ya da görüntüleme adresi. */
  url: string;
  /**
   * Bağlantının ömrü — "7 gün". Süresiz bağlantılarda (harici bir bağlantı
   * kaydı paylaşıldığında) null geçilir ve mailde süre yazmaz.
   */
  expiresLabel?: string | null;
  /** Kaydın bulunduğu klasör yolu — "Koleksiyon / Sunumlar". */
  folderPath?: string | null;
  /** Dosya boyutu etiketi — "4,2 MB". */
  sizeLabel?: string | null;
  /** Göndereni yazar ("Aslı Filinta"). */
  actorName?: string | null;
  /** Gönderenin serbest notu. */
  note?: string | null;
  /**
   * Bağlantı uygulamanın İÇİNE gidiyorsa true — alıcının hesabı yoksa
   * açamayacağını mailde açıkça söyleriz. Yüklenmiş dosyalarda (imzalı depo
   * bağlantısı) false: o adres hesap istemez.
   */
  requiresAccount?: boolean;
}

export function documentShareEmail(params: DocumentShareParams): EmailMessage {
  const {
    to, fileName, kindLabel, url, expiresLabel, folderPath,
    sizeLabel, actorName, note, requiresAccount = false,
  } = params;

  const heading = "Sizinle bir dosya paylaşıldı";
  const who = actorName?.trim();
  const lead = who
    ? `${who} sizinle bir dosya paylaştı.`
    : "Sizinle bir dosya paylaşıldı.";

  const detailPairs: Array<[string, string]> = [["Dosya", fileName], ["Tür", kindLabel]];
  if (folderPath?.trim()) detailPairs.push(["Klasör", folderPath.trim()]);
  if (sizeLabel?.trim()) detailPairs.push(["Boyut", sizeLabel.trim()]);
  if (expiresLabel?.trim()) detailPairs.push(["Bağlantı geçerliliği", expiresLabel.trim()]);

  /* Alıcıya ne yapacağını SÖYLE. "Bağlantı 7 gün geçerli" cümlesi, mailin
     dibinde unutulmuş bir bağlantının neden çalışmadığını sonradan sormayı
     önler. Hesap gerektiren bağlantıda da bunu baştan yazarız. */
  const caution = requiresAccount
    ? "Bu bağlantı AF Operasyon panelinde açılır; görebilmek için panele erişiminiz olmalı."
    : expiresLabel?.trim()
      ? `Bağlantı ${expiresLabel.trim()} boyunca geçerlidir; indirdikten sonra dosya sizde kalır.`
      : null;

  const text = [
    "Merhaba,",
    "",
    lead,
    "",
    ...detailPairs.map(([label, value]) => `${label}: ${value}`),
    ...(note?.trim() ? ["", note.trim()] : []),
    "",
    requiresAccount ? "Görüntüle:" : "İndir:",
    url,
    ...(caution ? ["", caution] : []),
    "",
    "İyi çalışmalar,",
    EMAIL_BRAND_FOOTER_NAME,
  ].join("\n");

  const html = renderEmailShell({
    title: heading,
    preheader: `${fileName}${folderPath?.trim() ? ` — ${folderPath.trim()}` : ""}`,
    bodyHtml: [
      renderHeading(heading),
      renderParagraph("Merhaba,"),
      renderParagraph(lead),
      renderDetailCard(
        detailPairs.map(([label, value]) => renderDetailRow(label, value)).join("\n"),
      ),
      ...(note?.trim() ? [renderParagraph(note.trim())] : []),
      renderButton(url, requiresAccount ? "Dosyayı görüntüle" : "Dosyayı indir"),
      renderFallbackLink(url),
      ...(caution ? [renderParagraph(caution)] : []),
    ].join("\n"),
  });

  return {
    to,
    subject: `Dosya paylaşıldı: ${fileName}`,
    text,
    html,
  };
}
