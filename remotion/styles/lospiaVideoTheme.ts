// Lospia video theme — sampled directly from the REAL app design tokens so the
// demo reads as an actual product screenshot, not a generic SaaS mockup.
//
// Sources of truth:
//   • app/globals.css          — surfaces, lines, text, brand (teal), shadows, radius
//   • lib/design/semantics.ts  — department pastel families + status chip tones
//   • components/layout/*       — sidebar (w-60 / h-14) + header (h-14) chrome
//
// The product UI itself uses the app's calm TEAL brand (#2f5d6b). Cobalt/amber
// are used ONLY for sparing video highlights (cursor, focus rings), never to
// recolor the product chrome.

export const theme = {
  color: {
    // Surfaces — layered neutrals (app → panel → raised), from globals.css
    appBg: "#f7f8fa",
    surface: "#ffffff",
    surfaceMuted: "#f9fafb",
    surfaceSunken: "#f2f4f6",
    // Lines
    hairline: "#eef0f3",
    border: "#e6e9ee",
    borderStrong: "#d6dae1",
    // Text
    text: "#1d2127",
    textMuted: "#5f6772",
    textSubtle: "#9aa2ac",
    // Brand — calm teal (secondary product identity: logo lockups)
    brand: "#2f5d6b",
    brandStrong: "#264c58",
    brandSoft: "#eaf2f4",
    brandRing: "#7faab8",
    // Primary action accent — cobalt/indigo (matches the real app's primary
    // buttons: "+ Görev oluştur", "+ Bu güne görev ekle"). This is the button/
    // focus color the video-native UI uses, not teal.
    primary: "#2f5fe0",
    primaryStrong: "#2348c0",
    primarySoft: "#eef2fe",
    primaryRing: "#b9caf6",
    // Semantic state hues
    danger: "#c8503d",
    warning: "#bd7a2c",
    hold: "#b08019",
    approval: "#7257b5",
    success: "#2c8a61",
    // Sparing video-only highlight accents (never recolor product chrome)
    highlight: "#2f5fe0", // cobalt — cursor + focus rings
    highlightAmber: "#df7314", // amber — approval-column emphasis
  },
  font: {
    // Matches app/globals.css --font-sans
    family:
      'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
  },
  shadow: {
    // From globals.css --shadow-card / --shadow-pop
    card: "0 1px 2px rgba(20,28,40,0.04), 0 1px 3px rgba(20,28,40,0.03)",
    pop: "0 4px 16px rgba(20,28,40,0.10), 0 1px 3px rgba(20,28,40,0.06)",
    // A slightly deeper lift for the framed product window in intro/CTA only.
    frame: "0 24px 60px -30px rgba(20,28,40,0.28), 0 2px 8px rgba(20,28,40,0.05)",
  },
  radius: {
    chip: 6,
    card: 10, // --radius
    panel: 14,
    pill: 999,
  },
  // Video-native app-shell geometry. The animated Lospia window is designed
  // FOR 1920×1080 — it fills ~88% width / ~78% height, centered, so nothing is
  // cropped and there is calm breathing room around the product frame. Captions
  // live below the shell (bottom offset ~145px) and never overlap it.
  shell: {
    x: 116, //           left margin (1920 − 1688) / 2  → ~88% width
    y: 84, //            top margin
    width: 1688, //      ~88% of 1920
    height: 812, //      ~75% of 1080 → bottom = 896, clearing the caption zone
    radius: 18,
    sidebarWidth: 246,
    headerHeight: 62,
  },
} as const;

// ── Avatar accent colors (initials → circle fill) ────────────────────
// Mirrors the real app's per-person avatar tints (Elif K. is red in every
// screenshot). Falls back to graphite for anyone unmapped.
export const avatarColor: Record<string, string> = {
  EK: "#dc2626", // Elif K. — red
  ZD: "#0f766e", // Zeynep D. — teal
  MA: "#2563c9", // Mert A. — blue
  DT: "#7257b5", // Deniz T. — violet
  YN: "#5f6772", // Yönetim — graphite
};
export const avatarFallback = "#5f6772";

// ── Department pastel families (from lib/design/semantics FAMILY) ─────
// surface = card fill, border = soft edge, accent = left strip, chip = badge
// bg+text, dot = leading dot. These are the exact hexes the real app renders.
export type DeptKey =
  | "icerik"
  | "eticaret"
  | "uretim"
  | "koleksiyon"
  | "tasarim"
  | "onaylar";

export type DeptStyle = {
  label: string;
  surface: string;
  border: string;
  accent: string;
  chipBg: string;
  chipText: string;
  dot: string;
};

export const dept: Record<DeptKey, DeptStyle> = {
  // İçerik — burnt orange (FAMILY.orange)
  icerik: { label: "İçerik", surface: "#fdf0e3", border: "#f6d3b2", accent: "#df7314", chipBg: "#fbdfc4", chipText: "#964b0c", dot: "#df7314" },
  // E-ticaret — royal blue (FAMILY.blue)
  eticaret: { label: "E-ticaret", surface: "#e8f1fd", border: "#c4daf6", accent: "#2563c9", chipBg: "#d7e6fb", chipText: "#1a4889", dot: "#2563c9" },
  // Üretim — olive/sand (FAMILY.sand)
  uretim: { label: "Üretim", surface: "#faf6e4", border: "#ede3c1", accent: "#bf9a2e", chipBg: "#f5ecc6", chipText: "#7d6010", dot: "#bf9a2e" },
  // Koleksiyon — fuchsia/magenta (FAMILY.pink)
  koleksiyon: { label: "Koleksiyon", surface: "#fce9f3", border: "#f3c4e0", accent: "#cc2e93", chipBg: "#f8d4ea", chipText: "#9a216c", dot: "#cc2e93" },
  // Tasarım — rose (FAMILY.rose)
  tasarim: { label: "Tasarım", surface: "#f9eef1", border: "#eed9e0", accent: "#c0566f", chipBg: "#f6e5ec", chipText: "#9c3a55", dot: "#c0566f" },
  // Onaylar — amber (FAMILY.amber)
  onaylar: { label: "Onaylar", surface: "#fbf2e2", border: "#eedfc0", accent: "#c98e20", chipBg: "#f7ead0", chipText: "#8a5e14", dot: "#c98e20" },
};

// Review (Kontrol / Onay) card treatment — almost-white with a soft mint border,
// from semantics REVIEW_STYLE.
export const reviewCardStyle = {
  surface: "#f7fef9",
  border: "#bbf7d0",
  accent: "#86efac",
};

// Done card treatment — filled green, from semantics DONE_STYLE.
export const doneCardStyle = {
  surface: "#d6f0e1",
  border: "#a7dcc0",
  accent: "#15803d",
};

// ── Status chip tones (from lib/design/semantics STATUS_CHIP_TONE) ────
export type StatusKey = "yapilacak" | "devam" | "review" | "done";
export const statusChip: Record<StatusKey, { bg: string; text: string; label: string }> = {
  yapilacak: { bg: "#eef0f2", text: "#5c636b", label: "Yapılacak" },
  devam: { bg: "#e3effb", text: "#1f5fa8", label: "Devam ediyor" },
  review: { bg: "#ecfdf3", text: "#15803d", label: "Kontrol / Onay" }, // pale mint
  done: { bg: "#bbe8cd", text: "#15603d", label: "Tamamlandı" }, // strong green
};

// Board column header tones (from semantics BOARD_COL_HEADER_TONE).
export const columnHeaderTone: Record<string, string> = {
  yapilacak: "#5f6772",
  devam: "#5f6772",
  review: "#3fae73", // mint — pre-completion
  done: "#15703f", // strong green — finished
};

// State overlay chips (from semantics STATE_BADGE) — overlay only, never card color.
export const stateChip = {
  overdue: { bg: "#fbe6e2", text: "#a83a2c", label: "Gecikti" },
  approval: { bg: "#ece4fa", text: "#5e44a0", label: "Onay bekliyor" },
};

// Priority chip (from semantics PRIORITY_CHIP).
export const priorityChip = {
  high: { bg: "#fbe6e2", text: "#a83a2c", label: "Yüksek" },
  urgent: { bg: "#dc2626", text: "#ffffff", label: "Acil" },
};
