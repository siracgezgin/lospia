/**
 * Person display helpers — single source of truth for how a person's name maps
 * to a compact initials badge and a full display name across the app.
 *
 * Initials rules (per AF request):
 *   1. Two+ words  → first letter of first word + first letter of last word
 *                    "Sıraç Gezgin" → "SG", "Şeyda Nisa Demireğer" → "ŞD"
 *   2. One word    → first letter only ("Nisa" → "N", "Gül" → "G")
 *   3. Legacy abbreviation already like AF / EF / MK / SG → kept as-is
 *   4. No name     → "?"
 *
 * Turkish casing is respected via locale-aware uppercase (i→İ, ı→I, ş→Ş, …).
 * Full names are never discarded — use getPersonDisplayName() for tooltips,
 * detail pages, and aria-labels.
 */

export type PersonLike =
  | string
  | { full_name?: string | null; email?: string | null; name?: string | null }
  | null
  | undefined;

/** Resolve the best available name string from a person-like input. */
function resolveName(p: PersonLike): string {
  if (!p) return "";
  if (typeof p === "string") return p.trim();
  return (p.full_name ?? p.name ?? p.email ?? "").trim();
}

const upperTR = (s: string) => s.charAt(0).toLocaleUpperCase("tr-TR");

/** Full display name (falls back to "—" when unknown). */
export function getPersonDisplayName(p: PersonLike): string {
  return resolveName(p) || "—";
}

/** Compact initials for a badge/avatar. See module docs for the rules. */
export function getPersonInitials(p: PersonLike): string {
  let name = resolveName(p);
  if (!name) return "?";

  // Legacy abbreviation already supplied (AF, EF, MK, SG): keep verbatim.
  if (/^[A-ZÇĞİÖŞÜ]{2,4}$/.test(name)) return name;

  // Bare email → use the local part as the name source.
  if (!name.includes(" ") && name.includes("@")) {
    name = name.split("@")[0].replace(/[._-]+/g, " ").trim();
  }

  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return upperTR(words[0]) || "?";
  return upperTR(words[0]) + upperTR(words[words.length - 1]);
}

/** Badge label = initials. Separate name kept for call-site clarity/extension. */
export function getPersonBadgeLabel(p: PersonLike): string {
  return getPersonInitials(p);
}
