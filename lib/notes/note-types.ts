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

// Small, corporate badge tones — aligned with the board chip palette (blue for
// informational, amber for pending action, sky for handoff, violet for approval).
export const NOTE_TYPE_BADGE: Record<TaskNoteType, string> = {
  info: "bg-blue-50 text-blue-700 border border-blue-200",
  action_required: "bg-amber-50 text-amber-700 border border-amber-200",
  handoff: "bg-sky-50 text-sky-700 border border-sky-200",
  approval_waiting: "bg-violet-50 text-violet-700 border border-violet-200",
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
