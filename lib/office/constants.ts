/**
 * Office Center — controlled vocabularies (Turkish UI, stable stored keys).
 * Mirrors the lib/creative/constants pattern so badges look consistent.
 */
import type {
  OfficeRecordStatus,
  LinkDocumentType,
  SpreadsheetStatus,
  SpreadsheetType,
  TemplateCategory,
  TemplateChannel,
} from "@/types";

// ── Doküman Merkezi ──────────────────────────────────────────────────────────

/** Bağlantı formu ve filtre için — yüklenen dosya ("file") burada YOK. */
export const DOCUMENT_TYPES: { key: LinkDocumentType; label: string }[] = [
  { key: "drive_link", label: "Drive klasörü" },
  { key: "google_doc", label: "Google Doküman" },
  { key: "google_sheet", label: "Google E-Tablo" },
  { key: "canva", label: "Canva" },
  { key: "figma", label: "Figma" },
  { key: "pdf_link", label: "PDF bağlantısı" },
  { key: "word_link", label: "Word bağlantısı" },
  { key: "excel_link", label: "Excel bağlantısı" },
  { key: "website", label: "Web sayfası" },
  { key: "internal_note", label: "Dahili not" },
  { key: "other", label: "Diğer" },
];

export const OFFICE_STATUSES: { key: OfficeRecordStatus; label: string }[] = [
  { key: "draft", label: "Taslak" },
  { key: "in_review", label: "Onayda" },
  { key: "approved", label: "Onaylandı" },
  { key: "archived", label: "Arşivlendi" },
];

const DOCUMENT_TYPE_LABELS = new Map(DOCUMENT_TYPES.map((t) => [t.key, t.label]));
const OFFICE_STATUS_LABELS = new Map(OFFICE_STATUSES.map((s) => [s.key, s.label]));

export function documentTypeLabel(key: string | null | undefined): string {
  if (!key) return "Diğer";
  // "file" listede yok (elle seçilemez) ama kayıtlarda geçer — adı burada.
  if (key === "file") return "Yüklenen dosya";
  return DOCUMENT_TYPE_LABELS.get(key as LinkDocumentType) ?? key;
}
export function officeStatusLabel(key: string | null | undefined): string {
  if (!key) return "Taslak";
  return OFFICE_STATUS_LABELS.get(key as OfficeRecordStatus) ?? key;
}

export const DOCUMENT_TYPE_TONE: Record<string, string> = {
  drive_link: "bg-[#dcf0e0] text-[#1e713d]",
  google_doc: "bg-[#eef0ff] text-[#1a4d9f]",
  google_sheet: "bg-[#dcf0e0] text-[#1e713d]",
  canva: "bg-[#eef0ff] text-[#1a4d9f]",
  figma: "bg-[#f6eefe] text-[#5b1cd8]",
  pdf_link: "bg-[#ffede8] text-[#9d1c0f]",
  word_link: "bg-[#eef0ff] text-[#1a4d9f]",
  excel_link: "bg-[#dcf0e0] text-[#1e713d]",
  website: "bg-[#e8f0f6] text-[#535b60]",
  internal_note: "bg-[#f5dac0] text-[#70470f]",
  other: "bg-[#e8f0f6] text-[#535b60]",
};

export const OFFICE_STATUS_TONE: Record<string, string> = {
  draft: "bg-[#e8f0f6] text-[#535b60]",
  in_review: "bg-[#f5dac0] text-[#70470f]",
  approved: "bg-[#dcf0e0] text-[#1e713d]",
  archived: "bg-[#e8f0f6] text-[#596268]",
};

// ── Şablon Kütüphanesi ───────────────────────────────────────────────────────

export const TEMPLATE_CATEGORIES: { key: TemplateCategory; label: string }[] = [
  { key: "customer_email", label: "Müşteri e-postası" },
  { key: "whatsapp_message", label: "WhatsApp mesajı" },
  { key: "producer_brief", label: "Üretici briefi" },
  { key: "order_form", label: "Sipariş formu" },
  { key: "pr_influencer", label: "PR / Influencer" },
  { key: "sales", label: "Satış" },
  { key: "after_sales", label: "Satış sonrası" },
  { key: "internal_process", label: "İç süreç" },
  { key: "general", label: "Genel" },
  { key: "other", label: "Diğer" },
];

export const TEMPLATE_CHANNELS: { key: TemplateChannel; label: string }[] = [
  { key: "general", label: "Genel" },
  { key: "email", label: "E-posta" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "document", label: "Doküman" },
  { key: "internal", label: "Dahili" },
  { key: "other", label: "Diğer" },
];

const TEMPLATE_CATEGORY_LABELS = new Map(TEMPLATE_CATEGORIES.map((c) => [c.key, c.label]));
const TEMPLATE_CHANNEL_LABELS = new Map(TEMPLATE_CHANNELS.map((c) => [c.key, c.label]));

export function templateCategoryLabel(key: string | null | undefined): string {
  if (!key) return "Genel";
  return TEMPLATE_CATEGORY_LABELS.get(key as TemplateCategory) ?? key;
}
export function templateChannelLabel(key: string | null | undefined): string {
  if (!key) return "Genel";
  return TEMPLATE_CHANNEL_LABELS.get(key as TemplateChannel) ?? key;
}

export const TEMPLATE_CHANNEL_TONE: Record<string, string> = {
  general: "bg-[#e8f0f6] text-[#535b60]",
  email: "bg-[#eef0ff] text-[#1a4d9f]",
  whatsapp: "bg-[#dcf0e0] text-[#1e713d]",
  document: "bg-[#f6eefe] text-[#5b1cd8]",
  internal: "bg-[#f5dac0] text-[#70470f]",
  other: "bg-[#e8f0f6] text-[#535b60]",
};

/** Standart şablon değişkenleri — form ekranında hızlı ekleme için. */
export const TEMPLATE_VARIABLE_SUGGESTIONS = [
  "{{customer_name}}",
  "{{product_name}}",
  "{{order_no}}",
  "{{delivery_date}}",
  "{{contact_name}}",
  "{{task_title}}",
];

// ── Tablo Merkezi ────────────────────────────────────────────────────────────

export const SHEET_TYPES: { key: SpreadsheetType; label: string }[] = [
  { key: "freeform", label: "Serbest çalışma" },
  { key: "collection", label: "Koleksiyon" },
  { key: "production", label: "Üretim" },
  { key: "inventory", label: "Stok" },
  { key: "finance", label: "Finans" },
  { key: "sales", label: "Satış" },
  { key: "crm", label: "Müşteri / İlişki" },
  { key: "other", label: "Diğer" },
];

export const SHEET_STATUSES: { key: SpreadsheetStatus; label: string }[] = [
  { key: "draft", label: "Taslak" },
  { key: "active", label: "Aktif" },
  { key: "locked", label: "Kilitli" },
  { key: "archived", label: "Arşivlendi" },
];

const SHEET_TYPE_LABELS = new Map(SHEET_TYPES.map((t) => [t.key, t.label]));
const SHEET_STATUS_LABELS = new Map(SHEET_STATUSES.map((s) => [s.key, s.label]));

export function sheetTypeLabel(key: string | null | undefined): string {
  if (!key) return "Serbest çalışma";
  return SHEET_TYPE_LABELS.get(key as SpreadsheetType) ?? key;
}
export function sheetStatusLabel(key: string | null | undefined): string {
  if (!key) return "Taslak";
  return SHEET_STATUS_LABELS.get(key as SpreadsheetStatus) ?? key;
}

export const SHEET_STATUS_TONE: Record<string, string> = {
  draft: "bg-[#e8f0f6] text-[#535b60]",
  active: "bg-[#dcf0e0] text-[#1e713d]",
  locked: "bg-[#f5dac0] text-[#70470f]",
  archived: "bg-[#e8f0f6] text-[#596268]",
};

// ── Yazı Editörü (Word karşılığı) ────────────────────────────────────────────
//
// Aslı Hanım (2026-08-28): "Excel'in yanına Word'ü de gir." Sözlükler burada
// durur ki editör ile temizleyicinin (lib/office/sanitize-html.ts) izin verdiği
// değerler tek yerden okunsun.

/** Yazı tipi ailesi — kısa liste; her değer temizleyicinin `font-family`
 *  kalıbına uyar (harf, rakam, boşluk, virgül, tırnak, tire). */
export const DOC_FONTS: { value: string; label: string }[] = [
  { value: "Inter, sans-serif", label: "Inter" },
  { value: "Arial, Helvetica, sans-serif", label: "Arial" },
  { value: "Calibri, Candara, sans-serif", label: "Calibri" },
  { value: "Verdana, Geneva, sans-serif", label: "Verdana" },
  { value: "Tahoma, Verdana, sans-serif", label: "Tahoma" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "Times New Roman, Times, serif", label: "Times New Roman" },
  { value: "Courier New, Courier, monospace", label: "Courier New" },
];

/** Punto (pt) — Word'ün ölçüsü. Gövdenin varsayılanı 12 pt. */
export const DOC_FONT_SIZES = ["9", "10", "11", "12", "14", "16", "18", "24", "32", "48"];

/** Satır aralığı — Word'ün dört standart adımı. */
export const DOC_LINE_SPACING: { value: string; label: string }[] = [
  { value: "1", label: "1,0" },
  { value: "1.15", label: "1,15" },
  { value: "1.5", label: "1,5" },
  { value: "2", label: "2,0" },
];

/** Gövdenin varsayılan ölçüleri — hem editör hem yazdırma bunları kullanır. */
export const DOC_BASE_FONT_PT = "12";
export const DOC_BASE_LINE_HEIGHT = "1.5";
