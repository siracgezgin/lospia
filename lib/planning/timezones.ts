/**
 * Takvimin İKİ saati.
 *
 * Aslı Hanım (2026-08-28): "O 9'u New York yaz. Bir de yanına İstanbul bir
 * hücre daha aç. İstanbul saatini de gir ki insanlar bilsin İstanbul'da kaçtı."
 *
 * Kayıtlı `time_slot` NEW YORK duvar saatidir — takvim Aslı Hanım'ın saatine
 * göre kuruldu ("benim saatime göre okuttum bir tek"). İstanbul saati burada
 * HESAPLANIR; ikinci bir kolon tutmuyoruz, çünkü elle girilen fark (7 sa / 8
 * sa) yaz saati geçişlerinde yılda iki kez yanlışa düşer.
 *
 * Intl ile yapılıyor, yeni bağımlılık yok.
 */

export const HOME_TZ = "America/New_York";
export const HOME_LABEL = "NY";
export const AWAY_TZ = "Europe/Istanbul";
export const AWAY_LABEL = "IST";

const SLOT_RE = /^(\d{1,2}):(\d{2})/;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "9:00" → "09:00"; tanınmayan değer olduğu gibi döner. */
export function normalizeSlot(slot: string | null | undefined): string {
  const m = SLOT_RE.exec((slot ?? "").trim());
  if (!m) return (slot ?? "").trim();
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/** Bir anın verilen bölgedeki UTC farkı (ms). */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"), get("month") - 1, get("day"),
    get("hour") % 24, get("minute"), get("second"),
  );
  return asUtc - instant.getTime();
}

/**
 * New York duvar saatini İstanbul duvar saatine çevirir.
 * `dayShift` gün taşmasını söyler (21:00 NY → 04:00 İstanbul, ertesi gün).
 * Girdi çözülemezse null döner — çağıran yer tek saat gösterir.
 */
export function toIstanbulTime(
  dateIso: string,
  slot: string,
): { time: string; dayShift: -1 | 0 | 1 } | null {
  const t = SLOT_RE.exec((slot ?? "").trim());
  const d = DAY_RE.exec((dateIso ?? "").trim());
  if (!t || !d) return null;

  const naive = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  // Duvar saatini gerçek ana çevir. İki adım: ilk fark tahmini yaz saati
  // sınırında bir saat şaşabilir, ikinci geçiş onu düzeltir.
  let utc = naive - tzOffsetMs(new Date(naive), HOME_TZ);
  utc = naive - tzOffsetMs(new Date(utc), HOME_TZ);
  const instant = new Date(utc);

  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: AWAY_TZ, hour12: false, hour: "2-digit", minute: "2-digit",
  }).format(instant).replace(/^24:/, "00:");

  const awayDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: AWAY_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(instant);
  const homeDay = `${d[1]}-${d[2]}-${d[3]}`;

  return { time, dayShift: awayDay > homeDay ? 1 : awayDay < homeDay ? -1 : 0 };
}

/** Ekranda gösterilecek hazır etiket: "16:00" · "04:00 +1" · null. */
export function istanbulLabel(dateIso: string, slot: string): string | null {
  const r = toIstanbulTime(dateIso, slot);
  if (!r) return null;
  return r.dayShift === 0 ? r.time : `${r.time} ${r.dayShift > 0 ? "+1" : "−1"}`;
}
