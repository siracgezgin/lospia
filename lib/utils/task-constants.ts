import type { TaskStatus, TaskPriority } from "@/types";

// ---- 3-column visual board ----

export type BoardColId = "yapilacak" | "devam_ediyor" | "tamamlandi";

export const BOARD_COLUMNS: {
  id: BoardColId;
  label: string;
  statuses: TaskStatus[];
  targetStatus: TaskStatus;
}[] = [
  { id: "yapilacak",    label: "Yapılacak",    statuses: ["backlog", "ready", "blocked"], targetStatus: "ready" },
  { id: "devam_ediyor", label: "Devam ediyor", statuses: ["in_progress", "review"],       targetStatus: "in_progress" },
  { id: "tamamlandi",   label: "Tamamlandı",   statuses: ["done"],                        targetStatus: "done" },
];

export function getTaskColId(status: TaskStatus): BoardColId {
  for (const col of BOARD_COLUMNS) {
    if ((col.statuses as TaskStatus[]).includes(status)) return col.id;
  }
  return "yapilacak";
}

// Status options shown in the card quick-edit dropdown
export const CARD_STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "ready",       label: "Yapılacak" },
  { value: "in_progress", label: "Devam ediyor" },
  { value: "blocked",     label: "Bekliyor" },
  { value: "done",        label: "Tamamlandı" },
];

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

export const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "Beklemede",
  ready: "Hazır",
  in_progress: "Devam ediyor",
  blocked: "Bloke",
  review: "İncelemede",
  done: "Tamamlandı",
  archived: "Arşivlendi",
};

export const TASK_PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Düşük",
  medium: "Orta",
  high: "Yüksek",
  urgent: "Acil",
};

// Stable URL slugs for saved-view names (shared by KanbanBoard + AppSidebar)
export const SAVED_VIEW_SLUG_MAP: Record<string, string> = {
  "Tüm işler":      "all",
  "Bana atananlar": "mine",
  "Bu hafta":       "this-week",
  "Gecikenler":     "overdue",
  "Tamamlananlar":  "done",
};

export const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};
