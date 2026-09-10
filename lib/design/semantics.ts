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

import type { CSSProperties } from "react";
import type { TaskPriority, TaskStatus } from "@/types";
import { hexOfColorKey, personStyles } from "@/lib/design/person-colors";

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
//
// FİLDİŞİ KALİBRASYONU (2026-09-10): surface/border/chip tonları BEYAZA göre
// değil, kanvasa (#efe9de) göre kuruldu — her ton kâğıdın kendi (a,b) noktasından
// çıkıyor, o yüzden hepsinde kâğıdın sıcaklığı var. Soğuk aileler kâğıda doğru
// çekildi (mavi/mor/magenta kroması düştü: buz gibi pastel sıcak kâğıtta plastik
// okunuyordu), sıcak aileler kâğıttan UZAKLAŞTIRILDI (zeytin/kehribar/kum eski
// hâliyle kanvastan dE 2.9–4.2 uzaktaydı, yani kart zeminde kayboluyordu; şimdi
// 4.7–7.8). Hue kimliği korunur; accent ve dot kimliğin kendisi olduğu için
// DEĞİŞMEDİ. Ayırt edilebilirlik iyileşti: en yakın iki yüzey dE 2.73 → 4.33,
// en yakın iki çip 4.03 → 5.54.
const FAMILY: Record<string, CardStyle> = {
  // Crimson — the critical Marka Yönetimi / CEO Katmanı family. Distinct from the
  // solid urgent-priority red and from the "rose" pastel.
  red:      { surface: "bg-[#fee7dd]", border: "border-[#f1c4bc]", accent: "border-l-[#d23320]", chip: "bg-[#f9d0c8] text-[#8f2415]", dot: "bg-[#d23320]" },
  // Violet — Tasarım & Yaratıcı Yön.
  lavender: { surface: "bg-[#f7edf6]", border: "border-[#d8cbe7]", accent: "border-l-[#7c3aed]", chip: "bg-[#e6daee] text-[#5325a3]", dot: "bg-[#7c3aed]" },
  // Royal blue — Satış & Ticaret.
  blue:     { surface: "bg-[#ebf1f8]", border: "border-[#c8d9ef]", accent: "border-l-[#2563c9]", chip: "bg-[#d6e2f5] text-[#1a4889]", dot: "bg-[#2563c9]" },
  teal:     { surface: "bg-[#e5f6f5]", border: "border-[#c3e5ea]", accent: "border-l-[#1796a4]", chip: "bg-[#cdebef] text-[#0d6570]", dot: "bg-[#1796a4]" }, // cyan-teal, NOT green
  // Olive — Finans & Operasyon (warm neutral; never the reserved completed-green).
  brown:    { surface: "bg-[#f3f1d3]", border: "border-[#d8d8b1]", accent: "border-l-[#998a2e]", chip: "bg-[#dedeb7] text-[#575014]", dot: "bg-[#998a2e]" },
  // Burnt orange — Üretim & Tedarik Zinciri.
  orange:   { surface: "bg-[#feebd9]", border: "border-[#f8d1b2]", accent: "border-l-[#df7314]", chip: "bg-[#fcd9bc] text-[#8c4a0c]", dot: "bg-[#df7314]" },
  sand:     { surface: "bg-[#fdf3d5]", border: "border-[#eee2bc]", accent: "border-l-[#cca73c]", chip: "bg-[#efe4be] text-[#6f5a12]", dot: "bg-[#bf9a2e]" },
  amber:    { surface: "bg-[#fef2dc]", border: "border-[#f3dfbd]", accent: "border-l-[#d29a3e]", chip: "bg-[#f6e3c2] text-[#7d5a12]", dot: "bg-[#c98e20]" },
  // Kurşuni — kanvasa en yakın aile. Kroması bilerek düşük ama R=G=B DEĞİL:
  // fildişi üstünde soğuk gri kart "yanlış ekrandan yapıştırılmış" gibi durur.
  slate:    { surface: "bg-[#eeeeec]", border: "border-[#dee2e7]", accent: "border-l-[#7184a0]", chip: "bg-[#e1e5eb] text-[#43526b]", dot: "bg-[#5b6e8a]" },
  rose:     { surface: "bg-[#feeeee]", border: "border-[#eed9e0]", accent: "border-l-[#cd7c91]", chip: "bg-[#f6e0e8] text-[#9c3a55]", dot: "bg-[#c0566f]" },
  // Fuchsia / magenta — Pazarlama & İletişim. Clearly warmer/pinker than violet.
  pink:     { surface: "bg-[#fee6ed]", border: "border-[#eec7dd]", accent: "border-l-[#cc2e93]", chip: "bg-[#f5d5e5] text-[#9a216c]", dot: "bg-[#cc2e93]" },
};

// The ONLY strong green treatment in the system — reserved for completed tasks.
// A clearly filled green surface + dark accent so a done card reads "finished"
// at a glance and is never mistaken for the pale review card next to it.
export const DONE_STYLE: CardStyle = {
  surface: "bg-[#d2ecd1]",
  border: "border-[#addab1]",
  accent: "border-l-[#027538]",   // --success: sistemdeki tek "bitti" yeşili
  chip: "bg-[#bee2c0] text-[#04562a]",
  dot: "bg-[#027538]",
};

// Kontrol / Onay (review) — an ALMOST-WHITE card with only a soft mint border +
// pale accent: "in progress, awaiting sign-off", deliberately NOT a filled green
// so it never reads as completed. The clear gap from DONE_STYLE (filled green) is
// intentional. This is the only other green-family card treatment.
export const REVIEW_STYLE: CardStyle = {
  surface: "bg-[#f0f9ec]",
  border: "border-[#c7e8c8]",
  accent: "border-l-[#63ad82]",   // dolu yeşilden bir ton açık: "bitmedi, onayda"
  chip: "bg-[#def2dc] text-[#1c7346]",
  dot: "bg-[#63ad82]",
};

// Uncategorized → neutral white card (no faked identity).
// Nötrler sert kodlanmış soğuk gri değil TOKEN: kimliksiz kart da kâğıdın
// sıcaklığını konuşsun, renkli kartların yanında mavimsi durmasın.
const CATEGORY_NONE: CardStyle = {
  surface: "bg-surface",
  border: "border-hairline",
  accent: "border-l-line",
  chip: "bg-surface-sunken text-muted",
  dot: "bg-line-strong",
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
 * Kişi renginden kart stili.
 *
 * Aslı Hanım (2026-08-23): "Görevlerde de renk kişinin renginde olsun. Sadece
 * tamamlananlar yeşil olacak."
 *
 * Kart kimliği artık DEPARTMAN değil KİŞİ. Panoda "bu kimin işi" sorusu renkten
 * okunuyor; departman rozetle taşınmaya devam ediyor. Renkler person-colors.ts
 * ile AYNI hex'ler — kişi rozeti ile kartı aynı rengi konuşur.
 *
 * PERSON_TONE_STYLE anahtarları PERSON_TONES anahtarlarıyla birebir aynı olmalı.
 */
const PERSON_TONE_STYLE: Record<string, CardStyle> = {
  crimson: FAMILY.red,
  orange:  FAMILY.orange,
  gold:    FAMILY.amber,
  olive:   FAMILY.brown,
  teal:    FAMILY.teal,
  blue:    FAMILY.blue,
  violet:  FAMILY.lavender,
  magenta: FAMILY.pink,
  slate:   FAMILY.slate,
  // Dokuzu aşan ekipler için yedek tonlar (person-colors.ts ile aynı hex'ler).
  navy:    { surface: "bg-[#ebecf4]", border: "border-[#c7cfe7]", accent: "border-l-[#1e3a8a]", chip: "bg-[#d8ddf0] text-[#152a63]", dot: "bg-[#1e3a8a]" },
  plum:    { surface: "bg-[#f9e9f1]", border: "border-[#e0c6e1]", accent: "border-l-[#86198f]", chip: "bg-[#ecd7e9] text-[#5e1265]", dot: "bg-[#86198f]" },
  rose:    { surface: "bg-[#fee5e4]", border: "border-[#f0c4cf]", accent: "border-l-[#e11d48]", chip: "bg-[#f9d4da] text-[#9f1239]", dot: "bg-[#e11d48]" },
};

/** Kişi rengi anahtarından kart stili. Kişi yoksa nötr — sahte kimlik yok. */
export function getPersonCardStyle(personColorKey?: string | null): CardStyle {
  if (!personColorKey) return CATEGORY_NONE;
  return PERSON_TONE_STYLE[personColorKey] ?? CATEGORY_NONE;
}

/**
 * Bir görevin nihai kart stili.
 *
 * TAMAMLANDI tek istisnadır ve yeşile geçer — "sadece tamamlananlar yeşil".
 * Kontrol/Onay ise neredeyse beyaz, yalnız nane kenarlıklı: "bitmedi, onayda"
 * demek; dolu yeşille karıştırılmasın diye bilerek zayıf.
 */
export function getTaskCardStyleByPerson(
  status: TaskStatus, personColorKey?: string | null,
): CardStyle & { style?: CSSProperties } {
  if (status === "done") return DONE_STYLE;
  if (status === "review") return REVIEW_STYLE;
  // Serbest renk (hex) Tailwind sınıfı üretemez — kart nötr sınıflarla çizilir,
  // renk SATIR İÇİ stille gelir. Hazır palet de aynı yoldan geçer ki iki
  // seçenek birebir aynı görünsün.
  const hex = hexOfColorKey(personColorKey);
  if (!hex) return CATEGORY_NONE;
  const st = personStyles(hex);
  return {
    ...CATEGORY_NONE,
    dot: "",
    style: {
      ...st.soft,
      ...st.border,
      ...st.accent,
    },
  };
}

/**
 * Resolved card style for a task in the department model. DONE overrides to the
 * reserved green; otherwise the department owns the colour. Tasks with no
 * department render neutral (never a faked identity).
 *
 * NOT: Pano artık kişi rengini kullanıyor (getTaskCardStyleByPerson). Bu
 * fonksiyon departman renkli yüzeyler (takvim, departman panoları) için durur.
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

// Çip zeminleri durum TOKEN'larının kendi hue'sundan, fildişi sapmayla kurulur;
// metin tonu doğrudan token'dır. Her satır kendi zemininde ≥4.5:1 (ölçüldü):
// gecikti 7.79 · bekliyor 6.44 · onay 7.04 · yaklaşan 4.59 · bitti 6.26.
export const STATE_BADGE: Record<CardState, string> = {
  overdue:  "bg-[#fee2de] text-[#8f002a]",   // --overdue
  blocked:  "bg-[#fee6c7] text-[#704b00]",   // --hold
  approval: "bg-[#f5e0f7] text-[#6b2f8a]",   // --approval
  due_soon: "bg-[#feeadb] text-[#a65500]",   // --warning
  done:     "bg-[#bee2c0] text-[#04562a]",   // --success ailesi
  normal:   "bg-surface-sunken text-muted",
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
  low:    "bg-surface-sunken text-subtle",
  medium: "bg-[#feeadb] text-[#a65500]",                          // --warning
  high:   "bg-[#fee2de] text-[#a3122f] ring-1 ring-[#fec7c2]",    // --danger ailesi
  // Acil — tek doygun kırmızı (--urgent) + --danger-strong halka: karttaki en
  // güçlü çip, crimson Marka Yönetimi çipinden açıkça baskın. Beyaz metin 4.97:1.
  urgent: "bg-urgent text-white font-semibold ring-1 ring-danger-strong",
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
  backlog:     "bg-surface-sunken text-muted",
  ready:       "bg-surface-sunken text-muted",
  in_progress: "bg-[#e1e8fe] text-[#14568f]", // --info ailesi (6.23:1)
  blocked:     "bg-[#fee6c7] text-[#704b00]", // --hold
  review:      "bg-[#def2dc] text-[#1c7346]", // pale mint — awaiting sign-off
  done:        "bg-[#bee2c0] text-[#04562a]", // strong reserved green
  archived:    "bg-surface-sunken text-subtle",
};

// Header / label text tone per status (for column titles, legends).
// Bu tonlar KANVASIN üstünde (sütun başlığı, açıklama) okunur; eşik kanvasa göre
// hesaplandı. Eski review tonu (#3fae73) beyazda 2.6:1 ile okunmuyordu.
export const STATUS_TEXT_TONE: Record<TaskStatus, string> = {
  backlog:     "text-muted",
  ready:       "text-muted",
  in_progress: "text-[#14568f]", // --info'nun kanvasta okunan koyu kademesi
  blocked:     "text-hold",
  review:      "text-[#1c7346]", // mint-green (dolu yeşilden bir ton açık)
  done:        "text-success",   // strong green
  archived:    "text-subtle",
};

// Board column header tone, keyed by BoardColId. Single source of truth so the
// "Kontrol / Onay" (mint) vs "Tamamlandı" (strong green) distinction is defined
// once and reused by both the live and static Kanban columns.
export const BOARD_COL_HEADER_TONE: Record<string, string> = {
  yapilacak:    "text-muted",
  devam_ediyor: "text-muted",
  kontrol_onay: "text-[#1c7346]", // mint — pre-completion
  tamamlandi:   "text-success",   // strong green — finished
};

// Recharts fills for the status-distribution chart. Review is the soft light
// green; done is the strong green (mirrors STATUS_CHIP_TONE above).
//
// Eski set iki komşuyu ayırt ettirmiyordu: "hazır" (#3b7bb5) ile "devam ediyor"
// (#7c5cbf) deuteranopi benzetiminde dE 3.0 — yan yana iki dilim aynı renk.
// Şimdi hazır marka petrolü, devam ediyor mor: en yakın komşu çifti dE 9.4
// (deutan) / 16.1 (normal görüş) ile eşiği geçiyor. Nötrler sıcak kâğıt ailesine
// alındı; bekleyen/biten tonları --hold ve --success ile aynı hue'da. Ölçüm:
// dataviz validate_palette.js, light mod.
export const STATUS_CHART_FILL: Record<TaskStatus, string> = {
  backlog:     "#8a7c68", // sıcak nötr — sessiz durum
  ready:       "#00617e", // --brand petrolü
  in_progress: "#6d4bb8",
  blocked:     "#a65500", // --hold ailesinin grafik kademesi
  review:      "#63ad82", // soft light green (REVIEW_STYLE ile aynı ton)
  done:        "#027538", // strong green (--success)
  archived:    "#b1a696",
};

// ── Department badge (members list, table chips) ──────────────────────────────
// A soft, controlled badge in the department's own colour family: tinted fill,
// department-toned text, plus a hairline ring for a crisp, corporate edge.
// Reuses the same FAMILY palette as cards so a department reads identically
// everywhere. Neutral grey when the department has no colour.
const DEPT_BADGE_RING: Record<string, string> = {
  red: "ring-[#e7bab3]", lavender: "ring-[#cec1dd]", blue: "ring-[#bfcfe5]",
  teal: "ring-[#b9dbe0]", brown: "ring-[#cecea8]", orange: "ring-[#eec7a9]",
  sand: "ring-[#e4d8b3]", amber: "ring-[#e8d5b4]", slate: "ring-[#d4d8dd]",
  rose: "ring-[#e4cfd6]", pink: "ring-[#e3bdd3]",
};

export interface DeptBadge {
  chip: string; // bg + text
  ring: string; // ring-* hairline
  dot: string;  // leading dot bg-*
}

/** Soft, ringed department badge from a colour key. Neutral when absent. */
export function getDepartmentBadge(colorKey?: string | null): DeptBadge {
  if (!colorKey) {
    return { chip: CATEGORY_NONE.chip, ring: "ring-hairline", dot: CATEGORY_NONE.dot };
  }
  const fam = DEPT_COLOR_TO_FAMILY[colorKey] ?? FALLBACK[hashIndex(colorKey, FALLBACK.length)];
  const style = FAMILY[fam];
  return { chip: style.chip, ring: DEPT_BADGE_RING[fam] ?? "ring-hairline", dot: style.dot };
}

// ── Status dot (lists / minimal contexts) ─────────────────────────────────────

// Nokta ve grafik dolgusu aynı işi yapar (renkli işaret, metin değil) — tek
// kaynak olsun diye STATUS_CHART_FILL ile birebir aynı hex'ler.
export const STATUS_DOT: Record<TaskStatus, string> = {
  backlog:     "bg-[#8a7c68]",
  ready:       "bg-[#00617e]",
  in_progress: "bg-[#6d4bb8]",
  blocked:     "bg-[#a65500]",
  review:      "bg-[#63ad82]", // soft mint (matches REVIEW_STYLE)
  done:        "bg-[#027538]",
  archived:    "bg-[#b1a696]",
};
