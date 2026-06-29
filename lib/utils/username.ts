// Username normalization + validation, shared by signup, login and the team
// access (Ekip erişimi) admin form. Rules: lowercase, trimmed, 3–32 characters,
// only letters / digits / dot / underscore / hyphen. ASCII only (no Turkish
// characters) for stability — the same rule the DB enforces.

export const USERNAME_FORMAT_ERROR =
  "Kullanıcı adı yalnızca harf, rakam, nokta, tire ve alt çizgi içerebilir.";
export const USERNAME_LENGTH_ERROR =
  "Kullanıcı adı 3 ile 32 karakter arasında olmalıdır.";
export const USERNAME_REQUIRED_ERROR = "Kullanıcı adı gerekli.";

const USERNAME_RE = /^[a-z0-9._-]+$/;

/** Lowercase + trim. Does not validate. */
export function normalizeUsername(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

export type UsernameResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

/** Normalize and validate a username, returning the clean value or an error. */
export function validateUsername(raw: string | null | undefined): UsernameResult {
  const value = normalizeUsername(raw);
  if (value.length === 0) return { ok: false, error: USERNAME_REQUIRED_ERROR };
  if (value.length < 3 || value.length > 32) {
    return { ok: false, error: USERNAME_LENGTH_ERROR };
  }
  if (!USERNAME_RE.test(value)) {
    return { ok: false, error: USERNAME_FORMAT_ERROR };
  }
  return { ok: true, value };
}
