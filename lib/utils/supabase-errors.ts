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
type SetupTopic = "crm" | "creative" | "office" | "generic";

function detectTopic(error: AnyError): SetupTopic {
  const msg = messageOf(error).toLowerCase();
  if (msg.includes("creative_assets")) return "creative";
  if (
    msg.includes("operation_documents") ||
    msg.includes("document_templates") ||
    msg.includes("document_template_versions") ||
    msg.includes("operation_spreadsheets") ||
    msg.includes("operation_spreadsheet_versions")
  ) {
    return "office";
  }
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
  office:
    "Doküman / Şablon / Tablo alanları için veritabanı güncellemesi bekleniyor. Migration uygulandıktan sonra bu modül aktif olacak.",
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

/* ── ŞEMA DIŞI HATALAR DA TÜRKÇEDİR ─────────────────────────────────────────
   Migration hataları çevriliyordu, geri kalanında Postgres/PostgREST/Storage'ın
   ham İNGİLİZCE metni doğrudan ekrana düşüyordu: "new row violates row-level
   security policy for table …" gibi bir cümle kullanıcıya hiçbir şey
   söylemiyor, üstelik yapabileceği bir şey olduğu hâlde (yetki iste, oturumu
   tazele, adı değiştir) onu söylemiyor.

   Eşleme KULLANICININ YAPABİLECEĞİ ŞEYE göre yazılır, hatanın adına göre
   değil. Eşleşmeyen hatada ham metin PARANTEZ İÇİNDE kalır: cümle Türkçe olur
   ama destek için iz kaybolmaz. */
const OPERATIONAL_BY_CODE: Record<string, string> = {
  "23505": "Aynı kayıt zaten var.",
  "23503": "Bu kayıt başka kayıtlara bağlı; önce onları kaldırmanız gerekiyor.",
  "23502": "Zorunlu bir alan boş bırakılmış.",
  "23514": "Girilen değer bu alan için geçerli değil.",
  "22001": "Girilen metin bu alan için çok uzun.",
  "22P02": "Girilen değerin biçimi hatalı.",
  "42501": "Bu işlem için yetkiniz yok.",
  "57014": "İşlem çok uzun sürdü ve durduruldu. Daha dar bir aralık deneyin.",
  PGRST116: "Kayıt bulunamadı ya da görme yetkiniz yok.",
  PGRST301: "Oturumunuzun süresi dolmuş. Sayfayı yenileyip tekrar deneyin.",
};

const OPERATIONAL_PATTERNS: [RegExp, string][] = [
  [/row-level security|permission denied|insufficient privilege|not authorized|forbidden|\b403\b/i,
    "Bu işlem için yetkiniz yok."],
  [/jwt|invalid token|token .*expire|\b401\b/i,
    "Oturumunuzun süresi dolmuş. Sayfayı yenileyip tekrar deneyin."],
  [/failed to fetch|fetch failed|network|econnrefused|enotfound|socket hang up/i,
    "Bağlantı kurulamadı. Tekrar deneyin."],
  [/exceeded the maximum allowed size|payload too large|\b413\b/i,
    "Dosya boyut sınırını aşıyor."],
  [/already exists|duplicate/i,
    "Aynı adla bir kayıt zaten var. Adını değiştirip tekrar deneyin."],
  /* Yalnız gerçek sunucu kodları (50x): geniş `5\d\d` kalıbı "character
     varying(500)" gibi cümlelere de takılıp yanlış cevap veriyordu. */
  [/timeout|timed out|service unavailable|\b50[0-4]\b/i,
    "Sunucu şu an yanıt vermiyor; birkaç dakika sonra tekrar deneyin."],
];

/** Şema dışı bir hatanın Türkçe karşılığı — eşleşme yoksa ham metni parantezde
 *  taşıyan genel cümle. Asla boş ya da İngilizce dönmez. */
function toOperationalMessage(error: AnyError): string {
  if (error?.code && OPERATIONAL_BY_CODE[error.code]) return OPERATIONAL_BY_CODE[error.code];
  const msg = messageOf(error);
  for (const [re, tr] of OPERATIONAL_PATTERNS) if (re.test(msg)) return tr;
  const raw = (error?.message ?? "").trim();
  return raw ? `Beklenmeyen bir hata oluştu (${raw})` : "Beklenmeyen bir hata oluştu.";
}

/**
 * Convenience for server actions: returns the friendly Turkish setup message
 * when the error is a missing-schema one, otherwise the caller's own fallback,
 * otherwise a Turkish sentence for the actual failure. A raw English message
 * never reaches the user on its own.
 */
export function toActionErrorMessage(error: AnyError, fallback?: string): string {
  const friendly = getFriendlyDatabaseSetupMessage(error);
  if (friendly) return friendly;
  return fallback ?? toOperationalMessage(error);
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
