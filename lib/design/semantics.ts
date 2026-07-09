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

// Curated families. None of these is the success-green — that hue is reserved
// exclusively for completed tasks (DONE_STYLE). The six families used by the AF
// departments (red, lavender, blue, orange, pink, brown) are intentionally far
// apart on the colour wheel — crimson, violet, royal blue, burnt orange,
// fuchsia, olive — and carry a strong left accent so a card's colour alone
// identifies its department at a glance.
const FAMILY: Record<string, CardStyle> = {
  // Crimson — the critical Marka Yönetimi / CEO Katmanı family. Distinct from the
  // solid urgent-priority red and from the "rose" pastel.
  red:      { surface: "bg-[#fdeae7]", border: "border-[#f1c3bb]", accent: "border-l-[#d23320]", chip: "bg-[#f8d2cb] text-[#971f12]", dot: "bg-[#d23320]" },
  // Violet — Tasarım & Yaratıcı Yön.
  lavender: { surface: "bg-[#f1ecfc]", border: "border-[#d7c8f3]", accent: "border-l-[#7c3aed]", chip: "bg-[#e6daf9] text-[#5325a3]", dot: "bg-[#7c3aed]" },
  // Royal blue — Satış & Ticaret.
  blue:     { surface: "bg-[#e8f1fd]", border: "border-[#c4daf6]", accent: "border-l-[#2563c9]", chip: "bg-[#d7e6fb] text-[#1a4889]", dot: "bg-[#2563c9]" },
  teal:     { surface: "bg-[#e6f6f7]", border: "border-[#c2e6ea]", accent: "border-l-[#1796a4]", chip: "bg-[#d4eff2] text-[#11707a]", dot: "bg-[#1796a4]" }, // cyan-teal, NOT green
  // Olive — Finans & Operasyon (warm neutral; never the reserved completed-green).
  brown:    { surface: "bg-[#f4f1e2]", border: "border-[#ded5b1]", accent: "border-l-[#998a2e]", chip: "bg-[#eae2c2] text-[#675c16]", dot: "bg-[#998a2e]" },
  // Burnt orange — Üretim & Tedarik Zinciri.
  orange:   { surface: "bg-[#fdf0e3]", border: "border-[#f6d3b2]", accent: "border-l-[#df7314]", chip: "bg-[#fbdfc4] text-[#964b0c]", dot: "bg-[#df7314]" },
  sand:     { surface: "bg-[#faf6e4]", border: "border-[#ede3c1]", accent: "border-l-[#cca73c]", chip: "bg-[#f5ecc6] text-[#7d6010]", dot: "bg-[#bf9a2e]" },
  amber:    { surface: "bg-[#fbf2e2]", border: "border-[#eedfc0]", accent: "border-l-[#d29a3e]", chip: "bg-[#f7ead0] text-[#8a5e14]", dot: "bg-[#c98e20]" },
  slate:    { surface: "bg-[#eff2f6]", border: "border-[#dee4ec]", accent: "border-l-[#7184a0]", chip: "bg-[#e6ebf2] text-[#43526b]", dot: "bg-[#5b6e8a]" },
  rose:     { surface: "bg-[#f9eef1]", border: "border-[#eed9e0]", accent: "border-l-[#cd7c91]", chip: "bg-[#f6e5ec] text-[#9c3a55]", dot: "bg-[#c0566f]" },
  // Fuchsia / magenta — Pazarlama & İletişim. Clearly warmer/pinker than violet.
  pink:     { surface: "bg-[#fce9f3]", border: "border-[#f3c4e0]", accent: "border-l-[#cc2e93]", chip: "bg-[#f8d4ea] text-[#9a216c]", dot: "bg-[#cc2e93]" },
};

// The ONLY strong green treatment in the system — reserved for completed tasks.
// A clearly filled green surface + dark accent so a done card reads "finished"
// at a glance and is never mistaken for the pale review card next to it.
export const DONE_STYLE: CardStyle = {
  surface: "bg-[#d6f0e1]",
  border: "border-[#a7dcc0]",
  accent: "border-l-[#15803d]",
  chip: "bg-[#bbe8cd] text-[#15603d]",
  dot: "bg-[#15803d]",
};

// Kontrol / Onay (review) — an ALMOST-WHITE card with only a soft mint border +
// pale accent: "in progress, awaiting sign-off", deliberately NOT a filled green
// so it never reads as completed. The clear gap from DONE_STYLE (filled green) is
// intentional. This is the only other green-family card treatment.
export const REVIEW_STYLE: CardStyle = {
  surface: "bg-[#f7fef9]",
  border: "border-[#bbf7d0]",
  accent: "border-l-[#86efac]",
  chip: "bg-[#ecfdf3] text-[#15803d]",
  dot: "bg-[#86efac]",
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
  red: "red",       // Marka Yönetimi / CEO Katmanı (critical)
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
  brown: "brown",  // Finans & Operasyon (own distinct olive/brown tone)
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
  // Review is the only other state that recolors the card: a soft mint tint so
  // "Kontrol / Onay" reads as the pre-completion stage everywhere it appears.
  if (status === "review") return REVIEW_STYLE;
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
      : "text-muted", // secondary but readable — never the placeholder grey
  };
}

// ── Priority (escalation chip — only Orta/Yüksek/Acil) ────────────────────────

export const PRIORITY_CHIP: Record<TaskPriority, string> = {
  low:    "bg-[#eef0f2] text-[#7a828b]",
  medium: "bg-[#fbeede] text-[#a05f1c]",
  high:   "bg-[#fbe6e2] text-[#a83a2c] ring-1 ring-[#f0c5bd]",
  // Acil — solid red-600 with a darker red-800 ring: the strongest chip on the
  // card, clearly dominant over the crimson Marka Yönetimi department chip.
  urgent: "bg-[#dc2626] text-white font-semibold ring-1 ring-[#991b1b]",
};

export const PRIORITY_SHOW_ON_BOARD: Record<TaskPriority, boolean> = {
  low: false,
  medium: false, // "Orta" is the default — no chip, keeps cards uncluttered
  high: true,
  urgent: true,
};

// ── Workflow-status chip tones (shared by Board + List) ───────────────────────
// Status is the primary lower chip. The green family is sequenced so the
// workflow reads left-to-right toward completion:
//   review (Kontrol / Onay) → a SOFT, light green: "almost done, awaiting sign-off"
//   done   (Tamamlandı)     → the STRONG reserved green: "finished"
// The two greens are deliberately one tone apart — clearly related, never
// confused. No other status uses green.
export const STATUS_CHIP_TONE: Record<TaskStatus, string> = {
  backlog:     "bg-[#eef0f2] text-[#5c636b]",
  ready:       "bg-[#eef0f2] text-[#5c636b]",
  in_progress: "bg-[#e3effb] text-[#1f5fa8]",
  blocked:     "bg-[#f6ecd4] text-[#8a6516]",
  review:      "bg-[#ecfdf3] text-[#15803d]", // pale mint — awaiting sign-off
  done:        "bg-[#bbe8cd] text-[#15603d]", // strong reserved green
  archived:    "bg-[#eef0f2] text-[#7a828b]",
};

// Header / label text tone per status (for column titles, legends).
export const STATUS_TEXT_TONE: Record<TaskStatus, string> = {
  backlog:     "text-[#5c636b]",
  ready:       "text-[#5c636b]",
  in_progress: "text-[#1f5fa8]",
  blocked:     "text-[#8a6516]",
  review:      "text-[#3fae73]", // soft mint-green (lighter than done)
  done:        "text-[#15703f]", // strong green
  archived:    "text-[#7a828b]",
};

// Board column header tone, keyed by BoardColId. Single source of truth so the
// "Kontrol / Onay" (mint) vs "Tamamlandı" (strong green) distinction is defined
// once and reused by both the live and static Kanban columns.
export const BOARD_COL_HEADER_TONE: Record<string, string> = {
  yapilacak:    "text-muted",
  devam_ediyor: "text-muted",
  kontrol_onay: "text-[#3fae73]", // mint — pre-completion
  tamamlandi:   "text-[#15703f]", // strong green — finished
};

// Recharts fills for the status-distribution chart. Review is the soft light
// green; done is the strong green (mirrors STATUS_CHIP_TONE above).
export const STATUS_CHART_FILL: Record<TaskStatus, string> = {
  backlog:     "#98a0a8",
  ready:       "#3b7bb5",
  in_progress: "#7c5cbf",
  blocked:     "#b8851f",
  review:      "#86efac", // soft light green
  done:        "#15803d", // strong green
  archived:    "#cdd2d8",
};

// ── Department badge (members list, table chips) ──────────────────────────────
// A soft, controlled badge in the department's own colour family: tinted fill,
// department-toned text, plus a hairline ring for a crisp, corporate edge.
// Reuses the same FAMILY palette as cards so a department reads identically
// everywhere. Neutral grey when the department has no colour.
const DEPT_BADGE_RING: Record<string, string> = {
  red: "ring-[#e6b8af]", lavender: "ring-[#cdbcf0]", blue: "ring-[#bcd4f3]",
  teal: "ring-[#b6e0e5]", brown: "ring-[#d6cba8]", orange: "ring-[#f0c79f]",
  sand: "ring-[#e6d9ad]", amber: "ring-[#e9d4ab]", slate: "ring-[#d4dbe6]",
  rose: "ring-[#e6cdd6]", pink: "ring-[#eeb9d8]",
};

export interface DeptBadge {
  chip: string; // bg + text
  ring: string; // ring-* hairline
  dot: string;  // leading dot bg-*
}

/** Soft, ringed department badge from a colour key. Neutral when absent. */
export function getDepartmentBadge(colorKey?: string | null): DeptBadge {
  if (!colorKey) {
    return { chip: CATEGORY_NONE.chip, ring: "ring-[#e4e7ec]", dot: CATEGORY_NONE.dot };
  }
  const fam = DEPT_COLOR_TO_FAMILY[colorKey] ?? FALLBACK[hashIndex(colorKey, FALLBACK.length)];
  const style = FAMILY[fam];
  return { chip: style.chip, ring: DEPT_BADGE_RING[fam] ?? "ring-[#e4e7ec]", dot: style.dot };
}

// ── Status dot (lists / minimal contexts) ─────────────────────────────────────

export const STATUS_DOT: Record<TaskStatus, string> = {
  backlog:     "bg-[#98a0a8]",
  ready:       "bg-[#3b7bb5]",
  in_progress: "bg-[#7c5cbf]",
  blocked:     "bg-[#b8851f]",
  review:      "bg-[#86efac]", // soft mint (matches REVIEW_STYLE)
  done:        "bg-[#15803d]",
  archived:    "bg-[#cdd2d8]",
};
