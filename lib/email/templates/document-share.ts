// Paylaşım maili — AF Teamwork'teki bir KLASÖRÜ ya da kaydı ilgililere duyurur.
//
// Sıraç (2026-09-12):
//   "Amaç dosya gönderme değil, onları sisteme davet etme. İndirme işi sonraki
//    aşamalarda. Şimdi sadece böyle bir klasör olduğunu paylaşmak — yani
//    kişilere, gelip görsünler."
//
// BU MAİL DOSYA TESLİM ETMEZ. İlk sürümünde her dosya için imzalı indirme
// bağlantısı taşıyordu; yanlış kurulmuştu. Bu mail bir DAVETTİR: "şöyle bir
// klasör var, panele gel ve bak" der. Tek bir düğmesi vardır ve o düğme
// AF Operasyon'a, paylaşılan kaydın durduğu yere götürür.
//
// Neden bu doğru: içerik panelde yaşıyor, orada güncelleniyor ve orada
// yetkiye bağlı. Maile kopyalanan bir dosya o andan sonra kendi hayatını
// yaşar — eskir, yetkiden çıkar, geri alınamaz. Davet ise her zaman güncel
// olanı gösterir.
//
// İÇİNDE NE VAR sorusu yine cevaplanır: klasörün dosya adları düz metin
// olarak listelenir (bağlantısız). Alıcı neye çağrıldığını bilerek gelsin.
//
// ERİŞİM AÇIKÇA YAZILIR: bağlantı panele gider, yani alıcının erişimi olmalı.
// Kapalı kapıya yönlendirip "çalışmıyor" cevabı almak istemiyoruz; erişimi
// yoksa kiminle konuşacağını da söylüyoruz.
//
// Toplantı davetiyle (meeting-invite.ts) aynı kabuk ve aynı ton kullanılır.

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

/** Klasör içeriğinde listelenen tek kayıt — yalnız tanıtım, bağlantı yok. */
export interface SharedFile {
  name: string;
  /** "PDF · 4,2 MB" gibi tek satırlık tarif. */
  meta: string;
}

export interface DocumentShareParams {
  to: string;
  /** Paylaşılanın adı — "2026 Kış Koleksiyonu" ya da "Maliyet Raporu.pdf". */
  fileName: string;
  /** Okunur tür etiketi — "Klasör", "PDF", "Excel", "Yazı", "Tablo". */
  kindLabel: string;
  /** PANELDEKİ adres — kaydın durduğu yere götürür. */
  url: string;
  /** Bulunduğu yol — "Koleksiyon / Sunumlar". */
  folderPath?: string | null;
  /** Tek dosyada boyut etiketi — "4,2 MB". */
  sizeLabel?: string | null;
  /** Paylaşan kişi ("Aslı Filinta"). */
  actorName?: string | null;
  /** Paylaşanın serbest notu. */
  note?: string | null;
  /** KLASÖRDE içindekiler; tek kayıtta boş. */
  files?: ReadonlyArray<SharedFile>;
  /** Listelenenden fazlası varsa kaçının yazılmadığı — sessiz kırpma yok. */
  omittedCount?: number;
}

export function documentShareEmail(params: DocumentShareParams): EmailMessage {
  const {
    to, fileName, kindLabel, url, folderPath,
    sizeLabel, actorName, note, files = [], omittedCount = 0,
  } = params;

  const isFolder = kindLabel === "Klasör";
  const what = isFolder ? "bir klasör" : "bir kayıt";
  const heading = isFolder ? "Sizinle bir klasör paylaşıldı" : "Sizinle bir kayıt paylaşıldı";
  const who = actorName?.trim();
  const lead = who
    ? `${who} AF Operasyon'da sizinle ${what} paylaştı.`
    : `AF Operasyon'da sizinle ${what} paylaşıldı.`;

  const detailPairs: Array<[string, string]> = [
    [isFolder ? "Klasör" : "Kayıt", fileName],
    ["Tür", kindLabel],
  ];
  if (folderPath?.trim()) detailPairs.push(["Konum", folderPath.trim()]);
  if (sizeLabel?.trim()) detailPairs.push(["Boyut", sizeLabel.trim()]);
  if (isFolder && files.length + omittedCount > 0) {
    detailPairs.push(["İçerik", `${files.length + omittedCount} dosya`]);
  }

  /* DÜĞMENİN NE YAPTIĞI YAZILIR — ve mailin ne YAPMADIĞI da. Alıcı ek arayıp
     "dosya nerede?" diye geri yazmasın. */
  const linkExplainer = isFolder
    ? "Aşağıdaki düğme sizi AF Operasyon'da bu klasöre götürür; dosyaları orada görebilirsiniz. Bu mailde dosya eki yoktur — içerik panelde durur ve orada güncel kalır."
    : "Aşağıdaki düğme sizi AF Operasyon'da bu kaydın durduğu yere götürür. Bu mailde dosya eki yoktur — içerik panelde durur ve orada güncel kalır.";

  const accessNote =
    "Panele erişiminiz yoksa açılmayacaktır; bu durumda maili gönderen kişiyle iletişime geçin.";

  const omittedLine =
    omittedCount > 0
      ? `Klasörde ${omittedCount} dosya daha var; mail uzamasın diye listelenmedi.`
      : null;

  // ── Düz metin ────────────────────────────────────────────────────────────
  const text = [
    "Merhaba,",
    "",
    lead,
    "",
    ...detailPairs.map(([label, value]) => `${label}: ${value}`),
    ...(note?.trim() ? ["", note.trim()] : []),
    ...(isFolder && files.length
      ? ["", "Klasörde neler var:", ...files.map((f) => `• ${f.name} (${f.meta})`)]
      : []),
    ...(omittedLine ? [omittedLine] : []),
    "",
    linkExplainer,
    "",
    "Panelde aç:",
    url,
    "",
    accessNote,
    "",
    "İyi çalışmalar,",
    EMAIL_BRAND_FOOTER_NAME,
  ].join("\n");

  // ── HTML ─────────────────────────────────────────────────────────────────
  const body: string[] = [
    renderHeading(heading),
    renderParagraph("Merhaba,"),
    renderParagraph(lead),
    renderDetailCard(
      detailPairs.map(([label, value]) => renderDetailRow(label, value)).join("\n"),
    ),
  ];
  if (note?.trim()) body.push(renderParagraph(note.trim()));
  if (isFolder && files.length) {
    body.push(renderParagraph("Klasörde neler var:"));
    body.push(renderFileList(files));
    if (omittedLine) body.push(renderParagraph(omittedLine));
  }
  body.push(renderParagraph(linkExplainer));
  body.push(renderButton(url, isFolder ? "Klasörü panelde aç" : "Panelde aç"));
  body.push(renderFallbackLink(url));
  body.push(renderParagraph(accessNote));

  const html = renderEmailShell({
    title: heading,
    preheader: `${fileName}${folderPath?.trim() ? ` — ${folderPath.trim()}` : ""}`,
    bodyHtml: body.join("\n"),
  });

  return {
    to,
    subject: `${isFolder ? "Klasör" : "Kayıt"} paylaşıldı: ${fileName}`,
    text,
    html,
  };
}
