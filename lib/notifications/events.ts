// ---------------------------------------------------------------------------
// Notification event catalogue (single source of truth)
// ---------------------------------------------------------------------------
// Every notification the app produces is described here as a semantic *event*.
// The catalogue maps each event to:
//   • dbType — one of the existing `notification_type` enum values (the DB
//     column is an enum, so we bucket events onto the closest existing value;
//     the distinct Turkish `title` is what actually distinguishes them in the
//     UI and in the dedupe guard).
//   • title — the short, professional, Turkish headline shown in the panel.
//
// The body is always the task title (callers may append a short suffix such as
// the points delta). Keeping all copy here means no English or ad-hoc Turkish
// strings live scattered across the action files.

import type { Database } from "@/types";

export type NotificationType = Database["public"]["Enums"]["notification_type"];

export type TaskNotificationEvent =
  | "task_assigned"
  | "task_review_requested"
  | "task_completed"
  | "task_reopened"
  | "task_responsibility_added"
  | "task_responsibility_removed"
  | "points_updated"
  | "task_note_added"
  | "task_note_action_required"
  | "task_note_handoff"
  | "task_note_approval_waiting"
  | "task_waiting_on";

export const NOTIFICATION_EVENTS: Record<
  TaskNotificationEvent,
  { dbType: NotificationType; title: string }
> = {
  task_assigned:              { dbType: "task_assigned",        title: "Yeni görev atandı" },
  task_review_requested:      { dbType: "task_status_changed",  title: "Görev onay bekliyor" },
  task_completed:             { dbType: "task_status_changed",  title: "Görev tamamlandı" },
  task_reopened:              { dbType: "task_status_changed",  title: "Görev yeniden açıldı" },
  task_responsibility_added:  { dbType: "task_assigned",        title: "Göreve dahil edildiniz" },
  task_responsibility_removed:{ dbType: "task_status_changed",  title: "Görev sorumluluğunuz kaldırıldı" },
  points_updated:             { dbType: "task_status_changed",  title: "Puanınız güncellendi" },
  task_note_added:            { dbType: "task_note_added",      title: "Göreve not eklendi" },
  // Operational note workflow — same enum bucket (task_note_added), the
  // distinct Turkish title is what the recipient sees and what dedupe keys on.
  task_note_action_required:  { dbType: "task_note_added",      title: "Sizden aksiyon bekleniyor" },
  task_note_handoff:          { dbType: "task_note_added",      title: "Görev sorumluluğu size yönlendirildi" },
  task_note_approval_waiting: { dbType: "task_note_added",      title: "Onayınız bekleniyor" },
  task_waiting_on:            { dbType: "task_waiting_on",      title: "Görev sizi bekliyor" },
};
