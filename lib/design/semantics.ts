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
import { addDaysISO, istanbulTodayISO } from "@/lib/utils/today";

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
  red:      { surface: "bg-[#ffede8]", border: "border-[#fac7bb]", accent: "border-l-[#d82717]", chip: "bg-[#ffd5ca] text-[#9d1c0f]", dot: "bg-[#d82717]" },
  // Violet — Tasarım & Yaratıcı Yön.
  lavender: { surface: "bg-[#f6eefe]", border: "border-[#deccf2]", accent: "border-l-[#7a3bed]", chip: "bg-[#e7d8f7] text-[#5b1cd8]", dot: "bg-[#7a3bed]" },
  // Royal blue — Satış & Ticaret.
  blue:     { surface: "bg-[#eef0ff]", border: "border-[#cbd1f9]", accent: "border-l-[#1f63cb]", chip: "bg-[#d8dcfd] text-[#1a4d9f]", dot: "bg-[#1f63cb]" },
  teal:     { surface: "bg-[#dcf5f9]", border: "border-[#9edee7]", accent: "border-l-[#2b95a2]", chip: "bg-[#b4e7ef] text-[#185860]", dot: "bg-[#2b95a2]" }, // cyan-teal, NOT green
  // Olive — Finans & Operasyon (warm neutral; never the reserved completed-green).
  brown:    { surface: "bg-[#f6f1df]", border: "border-[#ded3ac]", accent: "border-l-[#766b16]", chip: "bg-[#e7debe] text-[#595110]", dot: "bg-[#766b16]" },
  // Burnt orange — Üretim & Tedarik Zinciri.
  orange:   { surface: "bg-[#ffede2]", border: "border-[#f3cbb1]", accent: "border-l-[#dc751f]", chip: "bg-[#f9d8c3] text-[#7c400e]", dot: "bg-[#dc751f]" },
  sand:     { surface: "bg-[#f9f0df]", border: "border-[#e4d1ac]", accent: "border-l-[#997b1c]", chip: "bg-[#ecddbe] text-[#614e10]", dot: "bg-[#997b1c]" },
  amber:    { surface: "bg-[#fcefe0]", border: "border-[#eacfad]", accent: "border-l-[#c08921]", chip: "bg-[#f2dbbf] text-[#6a4a0f]", dot: "bg-[#c08921]" },
  slate:    { surface: "bg-[#edf1f8]", border: "border-[#cad4e3]", accent: "border-l-[#5a6e8b]", chip: "bg-[#d7dfec] text-[#415167]", dot: "bg-[#5a6e8b]" },
  rose:     { surface: "bg-[#ffecef]", border: "border-[#f4c8cf]", accent: "border-l-[#cc4469]", chip: "bg-[#fad5db] text-[#8e2c47]", dot: "bg-[#cc4469]" },
  // Fuchsia / magenta — Pazarlama & İletişim. Clearly warmer/pinker than violet.
  pink:     { surface: "bg-[#ffebf5]", border: "border-[#f5c6de]", accent: "border-l-[#ce2a93]", chip: "bg-[#fad4e7] text-[#921d68]", dot: "bg-[#ce2a93]" },
};

// The ONLY strong green treatment in the system — reserved for completed tasks.
// A clearly filled green surface + dark accent so a done card reads "finished"
// at a glance and is never mistaken for the pale review card next to it.
export const DONE_STYLE: CardStyle = {
  surface: "bg-[#cfeed6]",
  border: "border-[#a3dbad]",
  accent: "border-l-[#18773e]",
  chip: "bg-[#b4dfbc] text-[#12512a]",
  dot: "bg-[#18773e]",
};

// Kontrol / Onay (review) — an ALMOST-WHITE card with only a soft mint border +
// pale accent: "in progress, awaiting sign-off", deliberately NOT a filled green
// so it never reads as completed. The clear gap from DONE_STYLE (filled green) is
// intentional. This is the only other green-family card treatment.
export const REVIEW_STYLE: CardStyle = {
  surface: "bg-[#f2fbf3]",
  border: "border-[#bfe8c6]",
  accent: "border-l-[#41af66]",
  chip: "bg-[#dcf0e0] text-[#1e713d]",
  dot: "bg-[#41af66]",
};

// Uncategorized → neutral white card (no faked identity).
const CATEGORY_NONE: CardStyle = {
  surface: "bg-white",
  border: "border-[#e0e6eb]",
  accent: "border-l-[#dae0e5]",
  chip: "bg-[#e8f0f6] text-[#535b60]",
  dot: "bg-[#a3adb3]",
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
  navy:    { surface: "bg-[#f0efff]", border: "border-[#d1cff7]", accent: "border-l-[#143990]", chip: "bg-[#dddbfc] text-[#1d48af]", dot: "bg-[#143990]" },
  plum:    { surface: "bg-[#fbecfb]", border: "border-[#eac9ea]", accent: "border-l-[#851a90]", chip: "bg-[#f1d6f1] text-[#861e90]", dot: "bg-[#851a90]" },
  /* "Gül" İKİ AYRI RENKTİ: kişi tonu #e11d48, Tasarım kategorisi #cd7c91 —
     aynı adın iki rengi olamaz. İkisi tek aileye indi. */
  rose:    FAMILY.rose,
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
  /* İSTANBUL günü — sunucunun (UTC) günü DEĞİL. Vercel UTC'de çalıştığı için
     00:00–03:00 arasında bir önceki günü verir ve "bugün teslim" işler
     GECİKMİŞ görünürdü (bkz. lib/utils/today.ts). */
  const today = istanbulTodayISO();
  if (t.status === "done") return "done";
  if (!!t.due_date && t.due_date < today) return "overdue";

  const needsApproval = !!t.approval_required && t.approval_status !== "approved";
  const isWaiting = t.status === "blocked" || t.waiting_on_member_id != null || t.waiting_on_contact_id != null;
  if (needsApproval) return "approval";
  if (isWaiting) return "blocked";

  if (t.due_date) {
    /* Gün aritmetiği UTC'de yapılır: eski kod YEREL gece yarısından başlayıp
       sonucu UTC'ye çeviriyordu ve İstanbul'da bir gün geri kayıyordu —
       "yaklaşan" penceresi üç gün yerine iki gün çalışıyordu. */
    if (t.due_date <= addDaysISO(today, 3)) return "due_soon";
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

/* DURUM ÇİPLERİ JETONDAN TÜRER — kendi hex'leri YOKTUR.
   Önceki hâlinde "Gecikti" çipi #a83a2c, `--overdue` jetonu ise #93002b idi:
   aynı anlam, iki ayrı kırmızı. Dokuz durumun tamamı böyleydi, yani tema
   değiştiğinde çipler eski temada kalıyordu. Artık zemin ve metin jetonun
   HUE'sundan, ailelerle aynı merdivenle üretiliyor (zemin L*88.5/C*17,
   metin L*34) — çip kontrastı 5.95–6.03, hepsi AA. */
export const STATE_BADGE: Record<CardState, string> = {
  overdue:  "bg-[#ffd4d4] text-[#9b1c34]",   // --overdue
  blocked:  "bg-[#f5dac0] text-[#70470f]",   // --hold
  approval: "bg-[#ebd7f5] text-[#781eb0]",   // --approval
  due_soon: "bg-[#fad7c3] text-[#7e3f0e]",   // --warning
  done:     "bg-[#dcf0e0] text-[#1e713d]",   // --success
  normal:   "bg-[#e8f0f6] text-[#535b60]",   // kanvas hue'su — ölü gri değil
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
  low:    "bg-[#e8f0f6] text-[#596268]",
  medium: "bg-[#fad7c3] text-[#7e3f0e]",                       // --warning
  high:   "bg-[#ffd4d2] text-[#9b1c2f] ring-1 ring-[#fbbdbb]", // --danger
  /* Acil — karttaki EN GÜÇLÜ çip. Eskiden Tailwind'in red-600/800'üydü
     (#dc2626/#991b1b), yani temanın dışındaydı; şimdi `--urgent` jetonunun
     hue'sunda ve beyaz metni 4.50 ile taşıyan en doygun noktada. */
  urgent: "bg-[#e72039] text-white font-semibold ring-1 ring-[#a81427]",
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
  backlog:     "bg-[#e8f0f6] text-[#535b60]",
  ready:       "bg-[#e8f0f6] text-[#535b60]",
  in_progress: "bg-[#cbe0fe] text-[#185382]", // temiz mavi — markadan da onay
                                              // morundan da ayrı (hue 268)
  blocked:     "bg-[#f5dac0] text-[#70470f]", // --hold
  review:      "bg-[#dcf0e0] text-[#1e713d]", // açık yeşil — onay bekliyor
  done:        "bg-[#b4dfbc] text-[#12512a]", // ayrılmış güçlü yeşil
  archived:    "bg-[#e8f0f6] text-[#596268]",
};

// Header / label text tone per status (for column titles, legends).
export const STATUS_TEXT_TONE: Record<TaskStatus, string> = {
  backlog:     "text-[#535b60]",
  ready:       "text-[#535b60]",
  in_progress: "text-[#215d8e]",
  blocked:     "text-[#7d5012]",
  /* Kontrol/Onay tonu beyazda 2.80 idi — AA'nın (4.5) çok altında, sütun
     başlığı okunmuyordu. Tamamlandı'dan açık kalan EN AÇIK yeşile çekildi. */
  review:      "text-[#2b854b]", // 4.61
  done:        "text-[#1a6736]", // 6.91
  archived:    "text-[#596268]",
};

// Board column header tone, keyed by BoardColId. Single source of truth so the
// "Kontrol / Onay" (mint) vs "Tamamlandı" (strong green) distinction is defined
// once and reused by both the live and static Kanban columns.
export const BOARD_COL_HEADER_TONE: Record<string, string> = {
  yapilacak:    "text-muted",
  devam_ediyor: "text-muted",
  kontrol_onay: "text-[#2b854b]", // açık yeşil — onay öncesi (beyazda 4.61)
  tamamlandi:   "text-[#1a6736]", // güçlü yeşil — bitti (6.91)
};

// Recharts fills for the status-distribution chart. Review is the soft light
// green; done is the strong green (mirrors STATUS_CHIP_TONE above).
export const STATUS_CHART_FILL: Record<TaskStatus, string> = {
  backlog:     "#8c989f",
  ready:       "#2a93a0",
  in_progress: "#1f7cc0",
  blocked:     "#ac6f1a",
  review:      "#41af66", // açık yeşil
  done:        "#18773e", // güçlü yeşil
  archived:    "#c0c8cd",
};

// ── Department badge (members list, table chips) ──────────────────────────────
// A soft, controlled badge in the department's own colour family: tinted fill,
// department-toned text, plus a hairline ring for a crisp, corporate edge.
// Reuses the same FAMILY palette as cards so a department reads identically
// everywhere. Neutral grey when the department has no colour.
const DEPT_BADGE_RING: Record<string, string> = {
  red: "ring-[#fac0b2]", lavender: "ring-[#dac5f0]", blue: "ring-[#c4cbf8]",
  teal: "ring-[#8fd9e4]", brown: "ring-[#d9cda1]", orange: "ring-[#f2c4a7]",
  sand: "ring-[#e0cba1]", amber: "ring-[#e7c9a2]", slate: "ring-[#c4cee0]",
  rose: "ring-[#f3c1c8]", pink: "ring-[#f4beda]",
};

export interface DeptBadge {
  chip: string; // bg + text
  ring: string; // ring-* hairline
  dot: string;  // leading dot bg-*
}

/** Soft, ringed department badge from a colour key. Neutral when absent. */
export function getDepartmentBadge(colorKey?: string | null): DeptBadge {
  if (!colorKey) {
    return { chip: CATEGORY_NONE.chip, ring: "ring-[#e1e8ec]", dot: CATEGORY_NONE.dot };
  }
  const fam = DEPT_COLOR_TO_FAMILY[colorKey] ?? FALLBACK[hashIndex(colorKey, FALLBACK.length)];
  const style = FAMILY[fam];
  return { chip: style.chip, ring: DEPT_BADGE_RING[fam] ?? "ring-[#e1e8ec]", dot: style.dot };
}

// ── Status dot (lists / minimal contexts) ─────────────────────────────────────

export const STATUS_DOT: Record<TaskStatus, string> = {
  backlog:     "bg-[#8c989f]",
  ready:       "bg-[#2a93a0]",
  in_progress: "bg-[#1f7cc0]",
  blocked:     "bg-[#ac6f1a]",
  review:      "bg-[#41af66]", // REVIEW_STYLE ile aynı
  done:        "bg-[#18773e]",
  archived:    "bg-[#c0c8cd]",
};
