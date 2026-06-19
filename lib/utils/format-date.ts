const TZ = "Europe/Istanbul";
const LOCALE = "tr-TR";

export function formatDateTimeTR(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function formatDateTR(
  iso: string,
  opts: Omit<Intl.DateTimeFormatOptions, "timeZone"> = { day: "numeric", month: "short" },
): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, ...opts }).format(new Date(iso));
}
