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
  drive_link: "bg-[#dcf0e6] text-[#1f6e4d]",
  google_doc: "bg-[#e8f1fd] text-[#1a4889]",
  google_sheet: "bg-[#dcf0e6] text-[#1f6e4d]",
  canva: "bg-[#e8f1fd] text-[#1a4889]",
  figma: "bg-[#f1ecfc] text-[#5325a3]",
  pdf_link: "bg-[#fdeae7] text-[#971f12]",
  word_link: "bg-[#e8f1fd] text-[#1a4889]",
  excel_link: "bg-[#dcf0e6] text-[#1f6e4d]",
  website: "bg-[#eef0f2] text-[#5c636b]",
  internal_note: "bg-[#f6ecd4] text-[#8a6516]",
  other: "bg-[#eef0f2] text-[#5c636b]",
};

export const OFFICE_STATUS_TONE: Record<string, string> = {
  draft: "bg-[#eef0f2] text-[#5c636b]",
  in_review: "bg-[#f6ecd4] text-[#8a6516]",
  approved: "bg-[#dcf0e6] text-[#1f6e4d]",
  archived: "bg-[#eef0f2] text-[#7a828b]",
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
  general: "bg-[#eef0f2] text-[#5c636b]",
  email: "bg-[#e8f1fd] text-[#1a4889]",
  whatsapp: "bg-[#dcf0e6] text-[#1f6e4d]",
  document: "bg-[#f1ecfc] text-[#5325a3]",
  internal: "bg-[#f6ecd4] text-[#8a6516]",
  other: "bg-[#eef0f2] text-[#5c636b]",
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
  draft: "bg-[#eef0f2] text-[#5c636b]",
  active: "bg-[#dcf0e6] text-[#1f6e4d]",
  locked: "bg-[#f6ecd4] text-[#8a6516]",
  archived: "bg-[#eef0f2] text-[#7a828b]",
};
