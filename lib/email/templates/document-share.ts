// Paylaşım maili — AF Teamwork'teki bir DOSYAYI ya da bir KLASÖRÜ mailler.
//
// Sıraç (2026-09-12):
//   "Klasörün içine diyelim rapor veya sunum ekledik, onların da yanına mail
//    atılma ibaresi olsun, mail atalım. Calendar'daki gibi."
//   "Burda paylaş olsun ve linki açıklaması vs olsun profesyonelce mailde."
//
// NEDEN EK DEĞİL BAĞLANTI: bu mail dosyayı EKLEMEZ, güvenli bir indirme
// bağlantısı taşır. Üç gerekçe:
//   1. `EmailMessage` ek taşımıyor; Gmail sağlayıcısı multipart/alternative
//      gönderiyor, multipart/mixed değil. Ek desteği ayrı bir iştir.
//   2. Yükleme sınırı 25 MB; çoğu posta sunucusu 10-25 MB'lık eki reddeder.
//      Föy taraması ya da sunum tam da o boyuttadır — "gönderdim" deyip
//      sessizce düşen mail, hiç göndermemekten kötüdür. Bir klasörde bunun
//      birkaç katı olabilir; ek göndermek orada tümüyle imkânsız.
//   3. Bağlantı SÜRELİDİR ve çalışma alanının denetiminde kalır: yanlış kişiye
//      gitse bile süresi dolar. Ek bir kez çıktıktan sonra geri alınamaz.
//
// BAĞLANTI AÇIKLANIR. Alıcı çoğu zaman ekip dışından biri (üretici, tedarikçi)
// ve eline "şuraya tıkla" diyen bir mail geçiyor. Mailde şunlar AÇIKÇA yazar:
// bağlantının ne yaptığı (indirir mi, panele mi gider), ne kadar geçerli
// olduğu, hesap gerekip gerekmediği. Tıklamadan önce bilinsin diye — hem
// güven verir hem "bağlantı çalışmıyor" diye geri dönüşü keser.
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
  renderFileList,
  renderHeading,
  renderParagraph,
} from "./shared";

/** Klasör paylaşımında listelenen tek dosya. */
export interface SharedFile {
  name: string;
  /** "PDF · 4,2 MB" gibi tek satırlık tarif. */
  meta: string;
  /** İmzalı indirme adresi. */
  url: string;
}

export interface DocumentShareParams {
  to: string;
  /** Dosyanın/klasörün adı — "2026 Kış Koleksiyon Raporu.pdf". */
  fileName: string;
  /** Okunur tür etiketi — "PDF", "Excel", "Sunum", "Yazı", "Klasör". */
  kindLabel: string;
  /** Tek dosyada indirme/görüntüleme adresi; klasörde panel adresi. */
  url: string;
  /** Bağlantının ömrü — "7 gün". Süresizse null (harici bağlantı kaydı). */
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
   * açamayacağını mailde açıkça söyleriz.
   */
  requiresAccount?: boolean;
  /** KLASÖR paylaşımında içindeki dosyalar; tek dosyada boş. */
  files?: ReadonlyArray<SharedFile>;
  /**
   * Klasörde listelenenden FAZLA dosya varsa kaçının yazılmadığı. Sessizce
   * kırpmak "hepsi bu" yanılgısı üretirdi.
   */
  omittedCount?: number;
}

export function documentShareEmail(params: DocumentShareParams): EmailMessage {
  const {
    to, fileName, kindLabel, url, expiresLabel, folderPath,
    sizeLabel, actorName, note, requiresAccount = false,
    files = [], omittedCount = 0,
  } = params;

  const isFolder = files.length > 0 || kindLabel === "Klasör";
  const heading = isFolder ? "Sizinle bir klasör paylaşıldı" : "Sizinle bir dosya paylaşıldı";
  const who = actorName?.trim();
  const lead = who
    ? `${who} sizinle ${isFolder ? "bir klasör" : "bir dosya"} paylaştı.`
    : `Sizinle ${isFolder ? "bir klasör" : "bir dosya"} paylaşıldı.`;

  const detailPairs: Array<[string, string]> = [
    [isFolder ? "Klasör" : "Dosya", fileName],
    ["Tür", kindLabel],
  ];
  if (folderPath?.trim()) detailPairs.push(["Konum", folderPath.trim()]);
  if (sizeLabel?.trim()) detailPairs.push(["Boyut", sizeLabel.trim()]);
  if (isFolder) {
    detailPairs.push(["İçerik", `${files.length + omittedCount} dosya`]);
  }

  /* BAĞLANTININ NE YAPTIĞI YAZILIR. Üç ayrı durum, üç ayrı cümle — alıcı
     tıklamadan önce ne olacağını bilsin. */
  const linkExplainer = isFolder
    ? `Aşağıdaki dosya adlarına tıklayarak tek tek indirebilirsiniz. Bağlantılar ${
        expiresLabel?.trim() ?? "sınırlı bir süre"
      } geçerlidir ve hesap açmanızı gerektirmez; indirdikten sonra dosyalar sizde kalır.`
    : requiresAccount
      ? "Aşağıdaki bağlantı AF Operasyon panelinde açılır. Görebilmek için panele erişiminizin olması gerekir."
      : `Aşağıdaki bağlantı dosyayı doğrudan indirir; hesap açmanızı gerektirmez. ${
          expiresLabel?.trim()
            ? `Bağlantı ${expiresLabel.trim()} geçerlidir — indirdikten sonra dosya sizde kalır.`
            : ""
        }`.trim();

  const omittedLine =
    omittedCount > 0
      ? `Klasörde ${omittedCount} dosya daha var; mail uzamasın diye listelenmedi. Tamamı için bizimle iletişime geçin.`
      : null;

  // ── Düz metin gövdesi ────────────────────────────────────────────────────
  const text = [
    "Merhaba,",
    "",
    lead,
    "",
    ...detailPairs.map(([label, value]) => `${label}: ${value}`),
    ...(note?.trim() ? ["", note.trim()] : []),
    "",
    linkExplainer,
    "",
    ...(isFolder
      ? files.flatMap((f) => [`• ${f.name} (${f.meta})`, `  ${f.url}`])
      : [requiresAccount ? "Görüntüle:" : "İndir:", url]),
    ...(omittedLine ? ["", omittedLine] : []),
    "",
    "İyi çalışmalar,",
    EMAIL_BRAND_FOOTER_NAME,
  ].join("\n");

  // ── HTML gövdesi ─────────────────────────────────────────────────────────
  const body: string[] = [
    renderHeading(heading),
    renderParagraph("Merhaba,"),
    renderParagraph(lead),
    renderDetailCard(
      detailPairs.map(([label, value]) => renderDetailRow(label, value)).join("\n"),
    ),
  ];
  if (note?.trim()) body.push(renderParagraph(note.trim()));
  body.push(renderParagraph(linkExplainer));

  if (isFolder) {
    body.push(renderFileList(files.map((f) => ({ name: f.name, meta: f.meta, href: f.url }))));
    if (omittedLine) body.push(renderParagraph(omittedLine));
  } else {
    body.push(renderButton(url, requiresAccount ? "Dosyayı görüntüle" : "Dosyayı indir"));
    body.push(renderFallbackLink(url));
  }

  const html = renderEmailShell({
    title: heading,
    preheader: `${fileName}${folderPath?.trim() ? ` — ${folderPath.trim()}` : ""}`,
    bodyHtml: body.join("\n"),
  });

  return {
    to,
    subject: `${isFolder ? "Klasör" : "Dosya"} paylaşıldı: ${fileName}`,
    text,
    html,
  };
}
