import type { TaskStatus, TaskPriority } from "@/types";

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

export const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};
