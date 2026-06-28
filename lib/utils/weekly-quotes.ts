// Original, brand-compatible short lines for AF Operasyon. Rotated by ISO week
// so the "Haftanın sözü" changes weekly with no backend. Keep them short,
// elegant, and about craft / design / discipline / production / creativity.
// (Original lines — not copyrighted quotations.)
export const WEEKLY_QUOTES: string[] = [
  "İyi iş, detayın sessiz disiplinidir.",
  "Zanaat, fikrin sabırla biçim kazanmış halidir.",
  "Güzel olan, düzenli takip edildiğinde sürdürülebilir olur.",
  "Her koleksiyon önce küçük bir kararla başlar.",
  "Estetik, emekle aynı çizgide yürüdüğünde kalıcıdır.",
  "Bir tasarım, son dikişe kadar düşünülmüş olandır.",
  "Sadelik, gereksizi cesaretle çıkarmaktır.",
  "Kalite, kimse bakmıyorken de aynı özeni göstermektir.",
  "Aceleyle değil, ritimle ilerleyen iş kalıcı olur.",
  "Doğru malzeme, doğru ellerde değer kazanır.",
  "Üretim, hayalin takvime dönüşmüş halidir.",
  "Bir fikir, paylaşıldığında olgunlaşır.",
  "Disiplin, ilhamı sürdürülebilir kılar.",
  "Detaya gösterilen saygı, markanın imzasıdır.",
  "Düzen, yaratıcılığa alan açar.",
  "İyi planlanan iş, sakin tamamlanır.",
  "Zarafet, abartının değil ölçünün eseridir.",
  "Her parça bir hikâye taşır; iyi anlatılanı kalır.",
  "Tutarlılık, güvenin en sade halidir.",
  "Emek görünmez olabilir; sonucu asla.",
  "Yaratıcılık cesaret ister, uygulama sabır.",
  "Bir koleksiyonu bütün yapan, ortak dildir.",
  "Küçük iyileştirmeler büyük farklar yaratır.",
  "Net bir hedef, dağınık çabayı toparlar.",
  "Bugünün düzeni, yarının hızıdır.",
  "Kumaşa değer katan, ona verilen niyettir.",
  "İşi bitirmek de bir tasarım kararıdır.",
  "Sade duran, uzun konuşur.",
  "Ölçmeden kesme; düşünmeden başlama.",
  "Markayı marka yapan, sürdürülen standarttır.",
  "Bir detay eksikse, tasarım henüz bitmemiştir.",
  "Sabır, ustalığın görünmeyen iş gücüdür.",
  "İyi ekip, sessizce uyum içinde çalışandır.",
  "Zarafet, doğru zamanlamayla tamamlanır.",
  "Her teslim, bir sözün tutulmasıdır.",
  "Yaratıcı iş, düzenli zihinden doğar.",
  "Az ama doğru, çok ama dağınıktan iyidir.",
  "Bir markanın hafızası, tuttuğu sözlerdir.",
  "Form, işlevle barıştığında güzelleşir.",
  "Özen, ölçeklenebilir tek lükstür.",
  "İlham gelir geçer; alışkanlık kalır.",
  "Doğru soru, doğru tasarımdan önce gelir.",
  "Bitmiş iş, mükemmel taslaktan değerlidir.",
  "Renk seçilir, uyum kurulur.",
  "Her dikiş, bir kararın kanıtıdır.",
  "Düzenli takip, krizleri sessizce önler.",
  "Kalıcı stil, modanın ötesinde durur.",
  "İyi iş, gürültüsüz konuşur.",
  "Bir fikrin değeri, hayata geçtiğinde ölçülür.",
  "Ortak hedef, bireysel çabayı çoğaltır.",
  "Zamanında yapılan, iki kez yapılmış sayılır.",
  "Markanın ruhu, detaylarda saklıdır.",
];

/** ISO-8601 week number (1–53) for a given date. */
export function isoWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
}

export function quoteForWeek(d: Date = new Date()): { week: number; text: string } {
  const week = isoWeekNumber(d);
  return { week, text: WEEKLY_QUOTES[(week - 1) % WEEKLY_QUOTES.length] };
}
