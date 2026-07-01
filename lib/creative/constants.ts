/**
 * Kreatif Linkler — controlled vocabularies (Turkish UI, stable stored keys).
 */
import type { CreativeProvider, CreativeStatus } from "@/types";

export const CREATIVE_PROVIDERS: { key: CreativeProvider; label: string }[] = [
  { key: "canva", label: "Canva" },
  { key: "google_drive", label: "Google Drive" },
  { key: "dropbox", label: "Dropbox" },
  { key: "figma", label: "Figma" },
  { key: "website", label: "Web" },
  { key: "other", label: "Diğer" },
];

export const CREATIVE_STATUSES: { key: CreativeStatus; label: string }[] = [
  { key: "draft", label: "Taslak" },
  { key: "in_review", label: "Onay bekliyor" },
  { key: "approved", label: "Onaylandı" },
  { key: "archived", label: "Arşivlendi" },
];

const PROVIDER_LABELS = new Map(CREATIVE_PROVIDERS.map((p) => [p.key, p.label]));
const STATUS_LABELS = new Map(CREATIVE_STATUSES.map((s) => [s.key, s.label]));

export function providerLabel(key: string | null | undefined): string {
  if (!key) return "Diğer";
  return PROVIDER_LABELS.get(key as CreativeProvider) ?? key;
}
export function creativeStatusLabel(key: string | null | undefined): string {
  if (!key) return "Taslak";
  return STATUS_LABELS.get(key as CreativeStatus) ?? key;
}

export const PROVIDER_TONE: Record<string, string> = {
  canva: "bg-[#e8f1fd] text-[#1a4889]",
  google_drive: "bg-[#dcf0e6] text-[#1f6e4d]",
  dropbox: "bg-[#e6f6f7] text-[#11707a]",
  figma: "bg-[#f1ecfc] text-[#5325a3]",
  website: "bg-[#eef0f2] text-[#5c636b]",
  other: "bg-[#eef0f2] text-[#5c636b]",
};

export const CREATIVE_STATUS_TONE: Record<string, string> = {
  draft: "bg-[#eef0f2] text-[#5c636b]",
  in_review: "bg-[#f6ecd4] text-[#8a6516]",
  approved: "bg-[#dcf0e6] text-[#1f6e4d]",
  archived: "bg-[#eef0f2] text-[#7a828b]",
};
