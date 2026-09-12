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
  canva: "bg-[#eef0ff] text-[#1a4d9f]",
  google_drive: "bg-[#dcf0e0] text-[#1e713d]",
  dropbox: "bg-[#dcf5f9] text-[#185860]",
  figma: "bg-[#f6eefe] text-[#5b1cd8]",
  website: "bg-[#e8f0f6] text-[#535b60]",
  other: "bg-[#e8f0f6] text-[#535b60]",
};

export const CREATIVE_STATUS_TONE: Record<string, string> = {
  draft: "bg-[#e8f0f6] text-[#535b60]",
  in_review: "bg-[#f5dac0] text-[#70470f]",
  approved: "bg-[#dcf0e0] text-[#1e713d]",
  archived: "bg-[#e8f0f6] text-[#596268]",
};
