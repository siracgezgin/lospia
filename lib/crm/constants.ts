/**
 * CRM v0 — controlled vocabularies with Turkish labels.
 *
 * Stored values are stable keys (never shown raw to the user); the UI always
 * renders the Turkish label. Segment/status maps are intentionally small — this
 * is lightweight relationship management, not a deal pipeline.
 */

export const CRM_SEGMENTS = [
  { key: "vip", label: "VIP" },
  { key: "wholesale", label: "Toptan" },
  { key: "konsinye", label: "Konsinye" },
  { key: "pr", label: "PR" },
  { key: "influencer", label: "Influencer" },
  { key: "basin", label: "Basın" },
  { key: "stylist", label: "Stylist" },
  { key: "celebrity", label: "Celebrity" },
  { key: "isbirligi", label: "İşbirliği" },
  { key: "tedarikci", label: "Tedarikçi" },
  { key: "diger", label: "Diğer" },
] as const;

export type CrmSegmentKey = (typeof CRM_SEGMENTS)[number]["key"];

export const CRM_STATUSES = [
  { key: "aktif", label: "Aktif" },
  { key: "takipte", label: "Takipte" },
  { key: "beklemede", label: "Beklemede" },
  { key: "pasif", label: "Pasif" },
] as const;

export type CrmStatusKey = (typeof CRM_STATUSES)[number]["key"];

export const CRM_SOURCE_CHANNELS = [
  { key: "instagram", label: "Instagram" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "referans", label: "Referans" },
  { key: "etkinlik", label: "Etkinlik" },
  { key: "web", label: "Web" },
  { key: "diger", label: "Diğer" },
] as const;

const SEGMENT_LABELS = new Map<string, string>(CRM_SEGMENTS.map((s) => [s.key, s.label]));
const STATUS_LABELS = new Map<string, string>(CRM_STATUSES.map((s) => [s.key, s.label]));
const SOURCE_LABELS = new Map<string, string>(CRM_SOURCE_CHANNELS.map((s) => [s.key, s.label]));

export function segmentLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return SEGMENT_LABELS.get(key) ?? key;
}
export function statusLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return STATUS_LABELS.get(key) ?? key;
}
export function sourceLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return SOURCE_LABELS.get(key) ?? key;
}

// Soft badge tone per segment (reuses the muted palette used across the app).
export const SEGMENT_TONE: Record<string, string> = {
  vip: "bg-[#fbf2e2] text-[#8a5e14]",
  wholesale: "bg-[#e8f1fd] text-[#1a4889]",
  konsinye: "bg-[#e6f6f7] text-[#11707a]",
  pr: "bg-[#fce9f3] text-[#9a216c]",
  influencer: "bg-[#f1ecfc] text-[#5325a3]",
  basin: "bg-[#eff2f6] text-[#43526b]",
  stylist: "bg-[#f9eef1] text-[#9c3a55]",
  celebrity: "bg-[#fdeae7] text-[#971f12]",
  isbirligi: "bg-[#fdf0e3] text-[#964b0c]",
  tedarikci: "bg-[#f4f1e2] text-[#675c16]",
  diger: "bg-[#eef0f2] text-[#5c636b]",
};

export const STATUS_TONE: Record<string, string> = {
  aktif: "bg-[#dcf0e6] text-[#1f6e4d]",
  takipte: "bg-[#e3effb] text-[#1f5fa8]",
  beklemede: "bg-[#f6ecd4] text-[#8a6516]",
  pasif: "bg-[#eef0f2] text-[#7a828b]",
};
