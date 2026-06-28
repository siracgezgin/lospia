/**
 * Visual semantics — single source of truth for how a task's meaning maps to
 * color and badges across Board, List, Dashboard and Calendar.
 *
 * COLOR HIERARCHY (do not mix these up):
 *   1. Card surface + accent  → CATEGORY / work-area  (primary identity)
 *   2. Status chip            → state (Gecikti / Bekliyor / Onay bekliyor)
 *   3. Due-date color         → urgency
 *   4. Priority chip          → importance
 *   5. DONE                   → the ONLY state that overrides the card to green
 *
 * State never recolors the card except `done`. An overdue Lookbook task is a
 * lavender card with a red "Gecikti" chip — NOT a red card.
 *
 * NOTE on Tailwind: border-l-{color} is stripped by tailwind-merge when combined
 * with border-l width utilities. These classes are consumed as plain template
 * strings (never through cn()). See KanbanBoard.
 */

import type { TaskPriority, TaskStatus } from "@/types";

// ── Card visual style (category-driven, plus the reserved done style) ─────────

export interface CardStyle {
  surface: string; // bg-* fill
  border: string;  // border-* (all sides, soft)
  accent: string;  // border-l-* colored strip
  chip: string;    // bg-* text-* for the category chip
  dot: string;     // bg-* for the leading dot
}

// Curated pastel families. None of these is the success-green — that hue is
// reserved exclusively for completed tasks (DONE_STYLE).
const FAMILY: Record<string, CardStyle> = {
  lavender: { surface: "bg-[#f4f1fb]", border: "border-[#e4ddf3]", accent: "border-l-[#9b80d6]", chip: "bg-[#ece5fa] text-[#5b46a0]", dot: "bg-[#7c5cbf]" },
  blue:     { surface: "bg-[#eef4fc]", border: "border-[#d9e6f5]", accent: "border-l-[#5b93d6]", chip: "bg-[#e3edfa] text-[#285a8c]", dot: "bg-[#3b7bb5]" },
  teal:     { surface: "bg-[#e8f6f8]", border: "border-[#cfe8eb]", accent: "border-l-[#2f9aa6]", chip: "bg-[#dbf0f3] text-[#1d6d76]", dot: "bg-[#1f97a3]" }, // cyan-teal, NOT green
  brown:    { surface: "bg-[#f6f0e8]", border: "border-[#e8dccb]", accent: "border-l-[#bb8d5e]", chip: "bg-[#f0e6d6] text-[#7a4e24]", dot: "bg-[#a3673a]" },
  orange:   { surface: "bg-[#fcf1e9]", border: "border-[#f4e1cf]", accent: "border-l-[#e2894a]", chip: "bg-[#fbe7d7] text-[#9c531c]", dot: "bg-[#dd7a2e]" },
  sand:     { surface: "bg-[#faf6e4]", border: "border-[#ede3c1]", accent: "border-l-[#cca73c]", chip: "bg-[#f5ecc6] text-[#7d6010]", dot: "bg-[#bf9a2e]" },
  amber:    { surface: "bg-[#fbf2e2]", border: "border-[#eedfc0]", accent: "border-l-[#d29a3e]", chip: "bg-[#f7ead0] text-[#8a5e14]", dot: "bg-[#c98e20]" },
  slate:    { surface: "bg-[#eff2f6]", border: "border-[#dee4ec]", accent: "border-l-[#7184a0]", chip: "bg-[#e6ebf2] text-[#43526b]", dot: "bg-[#5b6e8a]" },
  rose:     { surface: "bg-[#f9eef1]", border: "border-[#eed9e0]", accent: "border-l-[#cd7c91]", chip: "bg-[#f6e5ec] text-[#9c3a55]", dot: "bg-[#c0566f]" },
  pink:     { surface: "bg-[#f8eef4]", border: "border-[#ecd7e6]", accent: "border-l-[#c069a0]", chip: "bg-[#f5e3f0] text-[#933a78]", dot: "bg-[#b85aa0]" },
};

// The ONLY green treatment in the system — reserved for completed tasks.
export const DONE_STYLE: CardStyle = {
  surface: "bg-[#edf7f1]",
  border: "border-[#d4ebdf]",
  accent: "border-l-[#36a06d]",
  chip: "bg-[#d9f0e4] text-[#1f6e4d]",
  dot: "bg-[#2e9367]",
};

// Uncategorized → neutral white card (no faked identity).
const CATEGORY_NONE: CardStyle = {
  surface: "bg-white",
  border: "border-[#e9ecf1]",
  accent: "border-l-[#e3e6ea]",
  chip: "bg-[#eef0f2] text-[#5c636b]",
  dot: "bg-[#aab1ba]",
};

// Stable name → family (covers clean names, legacy A/B prefixes, and CAPS imports).
const CATEGORY_FAMILY: Record<string, keyof typeof FAMILY> = {
  "Lookbook": "lavender", "A — Lookbook": "lavender",
  "Teknik SEO": "blue", "B — Teknik SEO": "blue", "SEO": "blue",
  "GEO / AI": "teal", "B — GEO / AI": "teal", "GEO/AI": "teal",
  "Erişim": "brown", "B — Erişim": "brown",
  "İçerik": "orange", "Icerik": "orange", "İÇERİK": "orange",
  "Üretim": "sand", "ÜRETİM": "sand",
  "Operasyon": "slate", "OPERASYON": "slate",
  "Kumaş Siparişi": "amber", "Sipariş": "amber", "SİPARİŞ": "amber",
  "Sistem": "blue", "SİSTEM": "blue",
  "Satın Alma": "brown", "SATIN ALMA": "brown",
  "Tasarım": "rose", "TASARIM": "rose",
  "Pazarlama": "pink",
  "Görsel Düzenleme": "rose", "GÖRSEL DÜZENLEME": "rose",
  "Fiyat Çalışma": "sand", "FİYAT ÇALIŞMA": "sand",
};

// Deterministic fallback for unknown categories (green excluded on purpose).
const FALLBACK: (keyof typeof FAMILY)[] = ["lavender", "blue", "teal", "brown", "orange", "slate", "rose", "pink", "amber", "sand"];

function hashIndex(s: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % mod;
}

/** Category card style (active tasks). Stable per category name. */
export function getCategoryCardStyle(category?: string | null): CardStyle {
  if (!category) return CATEGORY_NONE;
  const fam = CATEGORY_FAMILY[category] ?? FALLBACK[hashIndex(category, FALLBACK.length)];
  return FAMILY[fam];
}

/**
 * Resolved card style. DONE overrides everything with the reserved green;
 * otherwise the category owns the card color.
 */
export function getCardStyle(t: { status: TaskStatus; custom_fields?: unknown }): CardStyle {
  if (t.status === "done") return DONE_STYLE;
  const category = (t.custom_fields as Record<string, unknown> | undefined)?.category as string | undefined;
  return getCategoryCardStyle(category);
}

// Back-compat alias (older imports). Returns the active category style.
export const getCategoryStyle = getCategoryCardStyle;

// ── Department-driven card colour (AF Operasyon model) ────────────────────────
// AF Operasyon is organised by department, not by the (changing) topic/konu.
// A department's color_key maps to a pastel family. 'green' is remapped to teal
// because green is reserved exclusively for completed tasks (DONE_STYLE).
const DEPT_COLOR_TO_FAMILY: Record<string, keyof typeof FAMILY> = {
  purple: "lavender",
  lavender: "lavender",
  orange: "orange",
  blue: "blue",
  pink: "pink",
  rose: "rose",
  green: "teal",   // reserved → use teal instead
  teal: "teal",
  amber: "amber",
  sand: "sand",
  slate: "slate",
  brown: "brown",
};

/** Department card style from a department color_key. Neutral when absent. */
export function getDepartmentCardStyle(colorKey?: string | null): CardStyle {
  if (!colorKey) return CATEGORY_NONE;
  const fam = DEPT_COLOR_TO_FAMILY[colorKey] ?? FALLBACK[hashIndex(colorKey, FALLBACK.length)];
  return FAMILY[fam];
}

/**
 * Resolved card style for a task in the department model. DONE overrides to the
 * reserved green; otherwise the department owns the colour. Tasks with no
 * department render neutral (never a faked identity).
 */
export function getTaskCardStyle(status: TaskStatus, deptColorKey?: string | null): CardStyle {
  if (status === "done") return DONE_STYLE;
  return getDepartmentCardStyle(deptColorKey);
}

// ── Task state (SECONDARY — chips / due-date color only, never card color) ────

export type CardState = "overdue" | "blocked" | "approval" | "due_soon" | "done" | "normal";

export interface CardSignals {
  status: TaskStatus;
  due_date: string | null;
  completed_at?: string | null;
  approval_required?: boolean | null;
  approval_status?: string | null;
  waiting_on_member_id?: string | null;
  waiting_on_contact_id?: string | null;
}

/** Precedence-ordered operational state (drives the secondary chip, not color). */
export function getCardState(t: CardSignals): CardState {
  const today = new Date().toISOString().slice(0, 10);
  if (t.status === "done") return "done";
  if (!!t.due_date && t.due_date < today) return "overdue";

  const needsApproval = !!t.approval_required && t.approval_status !== "approved";
  const isWaiting = t.status === "blocked" || t.waiting_on_member_id != null || t.waiting_on_contact_id != null;
  if (needsApproval) return "approval";
  if (isWaiting) return "blocked";

  if (t.due_date) {
    const soon = new Date(today + "T00:00:00");
    soon.setDate(soon.getDate() + 3);
    if (t.due_date <= soon.toISOString().slice(0, 10)) return "due_soon";
  }
  return "normal";
}

export const STATE_LABEL: Record<CardState, string | null> = {
  overdue: "Gecikti",
  blocked: "Bekliyor",
  approval: "Onay bekliyor",
  due_soon: null, // conveyed by amber due-date
  done: null,     // conveyed by green card + struck title
  normal: null,
};

export const STATE_BADGE: Record<CardState, string> = {
  overdue:  "bg-[#fbe6e2] text-[#a83a2c]",
  blocked:  "bg-[#f6ecd4] text-[#8a6516]",
  approval: "bg-[#ece4fa] text-[#5e44a0]",
  due_soon: "bg-[#fbeede] text-[#a05f1c]",
  done:     "bg-[#dcf0e6] text-[#1f6e4d]",
  normal:   "bg-[#eef0f2] text-[#5c636b]",
};

export interface TaskStateMarkers {
  isDone: boolean;
  overdue: boolean;
  shouldStrike: boolean;
  chip: { label: string; className: string } | null;
  dueDateClass: string;
}

/** State overlay markers: a chip + due-date color. NEVER the card surface. */
export function getTaskStateMarkers(t: CardSignals): TaskStateMarkers {
  const state = getCardState(t);
  const label = STATE_LABEL[state];
  return {
    isDone: state === "done",
    overdue: state === "overdue",
    shouldStrike: state === "done",
    chip: label ? { label, className: STATE_BADGE[state] } : null,
    dueDateClass:
      state === "overdue" ? "text-danger font-semibold"
      : state === "due_soon" ? "text-warning font-medium"
      : "text-subtle",
  };
}

// ── Priority (escalation chip — only Orta/Yüksek/Acil) ────────────────────────

export const PRIORITY_CHIP: Record<TaskPriority, string> = {
  low:    "bg-[#eef0f2] text-[#7a828b]",
  medium: "bg-[#fbeede] text-[#a05f1c]",
  high:   "bg-[#fbe6e2] text-[#a83a2c] ring-1 ring-[#f0c5bd]",
  urgent: "bg-[#c0392b] text-white font-semibold",
};

export const PRIORITY_SHOW_ON_BOARD: Record<TaskPriority, boolean> = {
  low: false,
  medium: false, // "Orta" is the default — no chip, keeps cards uncluttered
  high: true,
  urgent: true,
};

// ── Status dot (lists / minimal contexts) ─────────────────────────────────────

export const STATUS_DOT: Record<TaskStatus, string> = {
  backlog:     "bg-[#98a0a8]",
  ready:       "bg-[#3b7bb5]",
  in_progress: "bg-[#7c5cbf]",
  blocked:     "bg-[#b8851f]",
  review:      "bg-[#c77d2e]",
  done:        "bg-[#2e9367]",
  archived:    "bg-[#cdd2d8]",
};
