const TZ = "Europe/Istanbul";
const LOCALE = "tr-TR";

// Short Turkish month names for human-friendly stamps.
const MONTHS_SHORT = [
  "Oca", "Şub", "Mar", "Nis", "May", "Haz",
  "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
];

export function formatDateTimeTR(iso: string): string {
  // Seconds intentionally dropped — minute precision is enough everywhere.
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function formatDateTR(
  iso: string,
  opts: Omit<Intl.DateTimeFormatOptions, "timeZone"> = { day: "numeric", month: "short" },
): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, ...opts }).format(new Date(iso));
}

// ── Istanbul-local calendar helpers ───────────────────────────────────────────
// Intl gives us the wall-clock parts in Europe/Istanbul regardless of the
// runtime timezone, so "today / yesterday" comparisons stay correct on Vercel.
function istanbulParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return {
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    month: Number(get("month")),
    day: Number(get("day")),
    year: Number(get("year")),
    hhmm: `${get("hour")}:${get("minute")}`,
  };
}

/** "29 Haz 15:07" (this year) or "29 Haz 2026 15:07" (other years). */
function fullStampTR(p: ReturnType<typeof istanbulParts>, includeYear: boolean): string {
  const base = `${p.day} ${MONTHS_SHORT[p.month - 1]}`;
  return includeYear ? `${base} ${p.year} ${p.hhmm}` : `${base} ${p.hhmm}`;
}

/**
 * Human, Turkish notification stamp:
 *   today      → "Bugün · 2 saat önce (15:07)" / "Bugün · 12 dk önce (15:07)" /
 *                "Bugün · az önce (15:07)"
 *   yesterday  → "Dün (29 Haz 15:07)"
 *   this year  → "29 Haz 15:07"
 *   older      → "29 Haz 2026 15:07"
 */
export function formatNotificationTimeTR(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const p = istanbulParts(then);
  const n = istanbulParts(now);

  if (p.ymd === n.ymd) {
    const diffMs = now.getTime() - then.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    let rel: string;
    if (diffMin < 1) rel = "az önce";
    else if (diffMin < 60) rel = `${diffMin} dk önce`;
    else rel = `${Math.floor(diffMin / 60)} saat önce`;
    return `Bugün · ${rel} (${p.hhmm})`;
  }

  // Yesterday (Istanbul-local) → compare calendar day.
  const yest = istanbulParts(new Date(now.getTime() - 24 * 3600 * 1000));
  if (p.ymd === yest.ymd) {
    return `Dün (${p.day} ${MONTHS_SHORT[p.month - 1]} ${p.hhmm})`;
  }

  return fullStampTR(p, p.year !== n.year);
}

/**
 * Compact stamp for note authorship lines:
 *   today     → "Bugün 14:32"
 *   yesterday → "Dün 18:10"
 *   this year → "29 Haz 15:07"
 *   older     → "29 Haz 2026 15:07"
 */
export function formatNoteTimeTR(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const p = istanbulParts(then);
  const n = istanbulParts(now);

  if (p.ymd === n.ymd) return `Bugün ${p.hhmm}`;

  const yest = istanbulParts(new Date(now.getTime() - 24 * 3600 * 1000));
  if (p.ymd === yest.ymd) return `Dün ${p.hhmm}`;

  return fullStampTR(p, p.year !== n.year);
}
