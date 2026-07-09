// ---------------------------------------------------------------------------
// Request-access lead validation — the single source of truth
// ---------------------------------------------------------------------------
// Shared by the client form (nicer inline UX) and the server action (the
// AUTHORITATIVE gate before any Supabase insert). This module is isomorphic:
// it imports nothing server-only, so the client bundle can reuse the exact
// same rules and messages. The server MUST still call `leadSchema.safeParse`
// — client checks are a convenience, never the security boundary.
//
// Design choices:
//   • Phone is validated + normalized with a dependency-free heuristic (no
//     libphonenumber-js) to keep the "zero external cost" project ethos and
//     avoid a new dependency. It targets Turkish + generic international
//     numbers and rejects the obvious fakes (55555555555, 00000000000, …).
//     A future upgrade to libphonenumber-js is noted in the audit report.
//   • Free-text fields reject embedded HTML / script / links rather than
//     silently stripping them, so nothing script-y is ever persisted.

import { z } from "zod";

// Enums must mirror the homepage pricing bands and the workflow-tool options
// rendered in the form. Kept here so the form imports them from one place.
export const TEAM_SIZES = ["1-15", "16-50", "51+"] as const;
export const WORKFLOW_TOOLS = [
  "Excel",
  "WhatsApp",
  "Notion",
  "ClickUp / Monday / Asana",
  "Diğer",
] as const;

export type TeamSize = (typeof TEAM_SIZES)[number];
export type WorkflowTool = (typeof WORKFLOW_TOOLS)[number];

// ── Shared content guards ────────────────────────────────────────────────────

/** Any angle bracket or a raw HTML entity — the cheapest reliable "no markup". */
const HTML_RE = /[<>]/;
/** URL-ish content: a scheme, protocol-relative, or a bare www. host. */
const URL_RE = /(https?:\/\/|www\.|:\/\/)/i;

/** True when the value contains no angle-bracket markup. */
function isMarkupFree(value: string): boolean {
  return !HTML_RE.test(value);
}

/** True when the value does not look like it embeds a URL. */
function isLinkFree(value: string): boolean {
  return !URL_RE.test(value);
}

/**
 * Reject single-character spam ("aaaaaa", "......") and strings dominated by
 * one repeated character. Conservative on purpose: real Turkish names/brands
 * always clear this. Only fires when the input has 3+ chars.
 */
function isNotRepetitiveGibberish(value: string): boolean {
  const compact = value.replace(/\s+/g, "");
  if (compact.length < 3) return true;
  const distinct = new Set(compact.toLowerCase()).size;
  // 1 distinct char = pure repeat; 2 distinct across a long run is still spammy.
  if (distinct <= 1) return false;
  if (compact.length >= 6 && distinct <= 2) return false;
  return true;
}

// ── Field schemas ────────────────────────────────────────────────────────────

const nameSchema = z
  .string()
  .trim()
  .min(2, "Ad soyad en az 2 karakter olmalı.")
  .max(80, "Ad soyad en fazla 80 karakter olabilir.")
  .refine(isMarkupFree, "Ad soyad geçersiz karakter içeriyor.")
  .refine(isLinkFree, "Ad soyad alanına bağlantı yazmayın.")
  .refine((v) => !v.includes("@"), "Ad soyad alanına e-posta yazmayın.")
  .refine(isNotRepetitiveGibberish, "Geçerli bir ad soyad girin.");

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "E-posta gerekli.")
  .max(255, "E-posta en fazla 255 karakter olabilir.")
  .refine((v) => !/\s/.test(v), "E-posta boşluk içeremez.")
  .pipe(z.email("Geçerli bir e-posta adresi girin."));

const companySchema = z
  .string()
  .trim()
  .min(2, "Şirket / marka adı en az 2 karakter olmalı.")
  .max(120, "Şirket / marka adı en fazla 120 karakter olabilir.")
  .refine(isMarkupFree, "Şirket / marka adı geçersiz karakter içeriyor.")
  .refine(isLinkFree, "Şirket / marka adı alanına bağlantı yazmayın.")
  .refine(isNotRepetitiveGibberish, "Geçerli bir şirket / marka adı girin.");

// Optional free text: empty/absent is fine; when present it must be meaningful
// and markup-free. Empty string is normalized to null before parsing.
const painSchema = z
  .string()
  .trim()
  .min(5, "Biraz daha detay verin (en az 5 karakter).")
  .max(1000, "En fazla 1000 karakter yazabilirsiniz.")
  .refine(isMarkupFree, "Metin geçersiz karakter (< veya >) içeriyor.")
  .nullable()
  .optional();

// ── Phone: dependency-free validation + normalization ────────────────────────

/**
 * Normalize a raw phone string to a canonical form and validate it.
 * Returns the normalized value or `null` if it can't be salvaged.
 *
 * Accepts:
 *   • Turkish mobile/landline: 05XXXXXXXXX, 5XXXXXXXXX, +905XXXXXXXXX, 90…
 *   • Generic international: +<country><subscriber>, 10–15 digits total.
 * Rejects obvious fakes: all-identical digits, <3 distinct digits, and strict
 * ascending/descending runs (1234567890 / 0987654321).
 */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Keep a single leading + then digits only.
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;

  if (isFakeDigitRun(digits)) return null;

  // Turkish normalization → canonical 0XXXXXXXXXX (11 digits). Only genuine
  // TR shapes are accepted without a "+"; anything else must be explicit E.164
  // (leading +) so junk like 1234567890 doesn't slip through as a "landline".
  //   5XXXXXXXXX     (10) mobile without leading 0 → add it
  //   0XXXXXXXXXX    (11) mobile/landline with leading 0 → keep
  //   90XXXXXXXXXX   (12) with country code → strip to 0…
  if (!hasPlus) {
    if (digits.length === 10 && digits[0] === "5") return "0" + digits;
    if (digits.length === 11 && digits[0] === "0") return digits;
    if (digits.length === 12 && digits.startsWith("90")) return "0" + digits.slice(2);
    return null;
  }

  // International: keep E.164-ish "+<digits>".
  if (digits.startsWith("90") && digits.length === 12) return "0" + digits.slice(2);
  return "+" + digits;
}

/** Detect the classic fake patterns humans type to skip a phone field. */
function isFakeDigitRun(digits: string): boolean {
  if (new Set(digits).size < 3) return true; // 5555…, 0000…, 1212…
  // Strictly ascending or descending consecutive run.
  let asc = true;
  let desc = true;
  for (let i = 1; i < digits.length; i++) {
    const d = digits.charCodeAt(i) - digits.charCodeAt(i - 1);
    if (d !== 1) asc = false;
    if (d !== -1) desc = false;
  }
  return asc || desc;
}

// Phone is required by the form. We validate the RAW string with a refine so we
// can surface a friendly message, then the server re-normalizes for storage.
const phoneSchema = z
  .string()
  .trim()
  .min(1, "Telefon gerekli.")
  .max(30, "Telefon numarası çok uzun.")
  .refine((v) => normalizePhone(v) !== null, "Geçerli bir telefon numarası girin.");

// ── Honeypot ─────────────────────────────────────────────────────────────────
// A field real users never see or fill. Bots that autofill every input trip it.
// When set, the server returns a benign success WITHOUT inserting (see action).
export const HONEYPOT_FIELD = "company_website";

// ── Full schema ──────────────────────────────────────────────────────────────

export const requestAccessSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  company_name: companySchema,
  phone: phoneSchema,
  team_size: z.enum(TEAM_SIZES).nullable().optional(),
  current_workflow_tool: z.enum(WORKFLOW_TOOLS).nullable().optional(),
  main_operational_pain: painSchema,
});

export type RequestAccessInput = z.infer<typeof requestAccessSchema>;

/** First user-facing error message, or null when valid. */
export function firstIssue(input: unknown): string | null {
  const parsed = requestAccessSchema.safeParse(input);
  return parsed.success ? null : parsed.error.issues[0].message;
}
