import type { TaskStatus, TaskPriority } from "@/types";

// ---- 3-column visual board ----

export type BoardColId = "yapilacak" | "devam_ediyor" | "kontrol_onay" | "tamamlandi";

export const BOARD_COLUMNS: {
  id: BoardColId;
  label: string;
  statuses: TaskStatus[];
  targetStatus: TaskStatus;
}[] = [
  { id: "yapilacak",    label: "Yapılacak",     statuses: ["backlog", "ready", "blocked"], targetStatus: "ready" },
  { id: "devam_ediyor", label: "Devam ediyor",  statuses: ["in_progress"],                 targetStatus: "in_progress" },
  { id: "kontrol_onay", label: "Kontrol / Onay", statuses: ["review"],                      targetStatus: "review" },
  { id: "tamamlandi",   label: "Tamamlandı",    statuses: ["done"],                        targetStatus: "done" },
];

export function getTaskColId(status: TaskStatus): BoardColId {
  for (const col of BOARD_COLUMNS) {
    if ((col.statuses as TaskStatus[]).includes(status)) return col.id;
  }
  return "yapilacak";
}

// Status options shown in the card quick-edit dropdown (alias for USER_STATUS_OPTIONS, defined after it)
export const CARD_STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "ready",       label: "Yapılacak" },
  { value: "in_progress", label: "Devam ediyor" },
  { value: "blocked",     label: "Bekliyor" },
  { value: "review",      label: "Kontrol / Onay" },
  { value: "done",        label: "Tamamlandı" },
];

// Project options for custom_fields.project
// Aslı Hanım (2026-08-19): "Online demiyoruz, online'ın her şeyi AFCOM demek."
export const PROJECT_OPTIONS = [
  "AFCOM",
  "Lookbook",
  "AFR-AF Operasyon",
  "Genel",
] as const;

// ---- Internal status list (all) ----
export const TASK_STATUSES: TaskStatus[] = [
  "backlog",
  "ready",
  "in_progress",
  "blocked",
  "review",
  "done",
  "archived",
];

// Simplified user-facing labels (4 visible states)
export const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog:    "Yapılacak",
  ready:      "Yapılacak",
  in_progress: "Devam ediyor",
  blocked:    "Bekliyor",
  review:     "Kontrol / Onay",
  done:       "Tamamlandı",
  archived:   "Arşivlendi",
};

// User-facing dropdown options
export const USER_STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "ready",       label: "Yapılacak" },
  { value: "in_progress", label: "Devam ediyor" },
  { value: "blocked",     label: "Bekliyor" },
  { value: "review",      label: "Kontrol / Onay" },
  { value: "done",        label: "Tamamlandı" },
];

export const TASK_PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Düşük",
  medium: "Orta",
  high: "Yüksek",
  urgent: "Acil",
};

// Stable URL slugs for saved-view names (shared by KanbanBoard + AppSidebar)
export const SAVED_VIEW_SLUG_MAP: Record<string, string> = {
  "Tüm işler":         "all",
  "Bana atananlar":    "mine",
  "Bu hafta":          "this-week",
  "Gecikenler":        "overdue",
  "Tamamlananlar":     "done",
  "Onay bekleyenler":  "waiting-approval",
};

export const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};
