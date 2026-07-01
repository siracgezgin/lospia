/**
 * Friendly handling for "the migration hasn't been applied to this DB yet"
 * errors coming from Supabase / PostgREST.
 *
 * When a new table or column exists in the code but not yet in the production
 * schema, PostgREST returns raw English errors like:
 *   - "Could not find the table 'public.creative_assets' in the schema cache"
 *   - "Could not find the 'crm_status' column of 'workspace_contacts' ..."
 *   - code PGRST204 (column not found) / 42P01 (relation does not exist)
 *
 * These must never reach the end user. We detect them and swap in a clear
 * Turkish, action-oriented message for the admin. The raw text can still be
 * surfaced as an optional technical note (dev/admin only).
 */

export interface DbLikeError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

type AnyError = DbLikeError | null | undefined;

// Postgres/PostgREST codes that mean "schema is behind the code".
const MISSING_SCHEMA_CODES = new Set([
  "PGRST204", // column not found in schema cache (insert/update)
  "PGRST205", // table not found in schema cache
  "42P01", // undefined_table
  "42703", // undefined_column
]);

const MISSING_SCHEMA_PATTERNS: RegExp[] = [
  /schema cache/i,
  /could not find the table/i,
  /could not find the '.*' column/i,
  /could not find the .* column/i,
  /relation .* does not exist/i,
  /column .* does not exist/i,
];

function messageOf(error: AnyError): string {
  if (!error) return "";
  return [error.message, error.details, error.hint].filter(Boolean).join(" ");
}

/** True when the error means "required table/column not migrated yet". */
export function isMissingSchemaError(error: AnyError): boolean {
  if (!error) return false;
  if (error.code && MISSING_SCHEMA_CODES.has(error.code)) return true;
  const msg = messageOf(error);
  return MISSING_SCHEMA_PATTERNS.some((re) => re.test(msg));
}

/** Which module/feature the missing-schema error is about (for wording). */
type SetupTopic = "crm" | "creative" | "generic";

function detectTopic(error: AnyError): SetupTopic {
  const msg = messageOf(error).toLowerCase();
  if (msg.includes("creative_assets")) return "creative";
  if (
    msg.includes("workspace_contacts") ||
    msg.includes("crm_status") ||
    msg.includes("segment") ||
    msg.includes("user_id") ||
    msg.includes("owner_id") ||
    msg.includes("next_follow_up")
  ) {
    return "crm";
  }
  return "generic";
}

const SETUP_MESSAGES: Record<SetupTopic, string> = {
  crm: "CRM alanları için veritabanı güncellemesi bekleniyor. Migration uygulandıktan sonra yeni ilişki ekleme ve kişi eşleştirme aktif olacak.",
  creative:
    "Kreatif Linkler tablosu henüz production veritabanında oluşturulmamış. Migration uygulandıktan sonra bağlantı ekleme aktif olacak.",
  generic:
    "Bu modül için veritabanı güncellemesi bekleniyor. Yönetici olarak migration uygulandıktan sonra bu alan aktif olacak.",
};

/**
 * A user-facing Turkish message for a missing-schema error, tuned to the module
 * it came from. Returns null when the error is NOT a schema/migration issue, so
 * callers can fall back to their own message for real errors.
 */
export function getFriendlyDatabaseSetupMessage(error: AnyError): string | null {
  if (!isMissingSchemaError(error)) return null;
  return SETUP_MESSAGES[detectTopic(error)];
}

/**
 * Convenience for server actions: returns the friendly Turkish setup message
 * when the error is a missing-schema one, otherwise the provided fallback (the
 * raw message by default). Ensures a raw English "Could not find…" never leaks.
 */
export function toActionErrorMessage(error: AnyError, fallback?: string): string {
  const friendly = getFriendlyDatabaseSetupMessage(error);
  if (friendly) return friendly;
  return fallback ?? error?.message ?? "Beklenmeyen bir hata oluştu.";
}

/**
 * Structured view of a missing-schema situation for setup banners: whether a
 * migration is required, the friendly message, and the raw technical detail
 * (only shown collapsed to admins).
 */
export function maybeDatabaseSetupRequired(error: AnyError): {
  setupRequired: boolean;
  message: string | null;
  technicalDetail: string | null;
} {
  if (!isMissingSchemaError(error)) {
    return { setupRequired: false, message: null, technicalDetail: null };
  }
  return {
    setupRequired: true,
    message: getFriendlyDatabaseSetupMessage(error),
    technicalDetail: messageOf(error) || null,
  };
}
