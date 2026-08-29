// Shared note-workflow constants (client + server safe — no server imports).
//
// task_notes.note_type drives what an operational note MEANS (plain info vs an
// action someone must take), task_notes.action_status drives feed carry-over
// ("open" action notes stay visible week-to-week until claimed/closed), and the
// assignment action describes what the note does to task responsibility.

import type { TaskNoteType, TaskNoteActionStatus } from "@/types";

export const NOTE_TYPES: TaskNoteType[] = [
  "info",
  "action_required",
  "handoff",
  "approval_waiting",
];

export const NOTE_TYPE_LABELS: Record<TaskNoteType, string> = {
  info: "Bilgilendirme",
  action_required: "Aksiyon gerekli",
  handoff: "Sorumlu değişimi / devir",
  approval_waiting: "Onay bekliyor",
};

// Not türü rozetleri — anlamsal token'lar (globals.css): bilgi=info, eylem
// gerekli=hold (bekleyen iş), devir=marka, onay=approval. Ham Tailwind paleti
// (blue-50, amber-700…) uygulamanın renk sisteminin dışında kalıyordu.
export const NOTE_TYPE_BADGE: Record<TaskNoteType, string> = {
  info: "bg-info/10 text-info",
  action_required: "bg-hold/10 text-hold",
  handoff: "bg-brand-soft text-brand-strong",
  approval_waiting: "bg-approval/10 text-approval",
};

export function isNoteType(v: unknown): v is TaskNoteType {
  return typeof v === "string" && (NOTE_TYPES as string[]).includes(v);
}

/** Defensive read — pre-migration rows have no note_type column. */
export function asNoteType(v: unknown): TaskNoteType {
  return isNoteType(v) ? v : "info";
}

export function asNoteActionStatus(v: unknown): TaskNoteActionStatus {
  return v === "seen" || v === "claimed" || v === "closed" ? v : "open";
}

// What an operational note does to task responsibility.
export type NoteAssignmentAction = "none" | "add_responsible" | "handoff";

export const NOTE_ASSIGNMENT_LABELS: Record<NoteAssignmentAction, string> = {
  none: "Sadece not ekle",
  add_responsible: "Sorumlu olarak ekle",
  handoff: "Görevi devret",
};
