// Demo-safe content for the Lospia 60-second product demo.
//
// Every label here is a GENERIC brand-operations sample that mirrors the REAL
// Lospia demo workspace (captured in remotion/assets/screenshots/*). There is no
// real customer data, no Aslı Filinta production data, no private/sensitive
// info, no fake usage numbers presented as real, and no fake logos. Task names
// are the approved demo-safe set — no "Lookbook" / "Kış Koleksiyonu" wording on
// any public demo/marketing/video surface.

import type { DeptKey, StatusKey } from "../styles/lospiaVideoTheme";

// ── Scene 1: Logo intro ──────────────────────────────────────────────
export const intro = {
  headline: "Marka operasyonları tek panelde görünür hale gelsin.",
};

// ── Scene 2: Problem context (scattered lightweight chips) ───────────
// Five loose fragments of a disorganised operation that softly drift in from
// the edges and then connect into the Lospia panel.
export type ProblemChip = { title: string; kind: "chat" | "sheet" | "approval" | "owner" | "due" };
export const problems: ProblemChip[] = [
  { title: "WhatsApp mesajı", kind: "chat" },
  { title: "Excel satırı", kind: "sheet" },
  { title: "Geciken onay", kind: "approval" },
  { title: "Belirsiz sorumlu", kind: "owner" },
  { title: "Unutulan teslim tarihi", kind: "due" },
];

// ── Sidebar nav (faithful to components/layout/AppSidebar) ───────────
export type NavItem = { icon: NavIcon; label: string };
export type NavIcon =
  | "board"
  | "adminBoard"
  | "list"
  | "modules"
  | "dashboard"
  | "calendar"
  | "rules"
  | "activity"
  | "archive"
  | "trash"
  | "settings";

export const navGroups: { title: string; items: NavItem[] }[] = [
  {
    title: "Çalışma alanı",
    items: [
      { icon: "board", label: "Pano" },
      { icon: "adminBoard", label: "Yönetici Pano" },
      { icon: "list", label: "Liste" },
      { icon: "modules", label: "Operasyon Modülleri" },
      { icon: "dashboard", label: "Gösterge Paneli" },
      { icon: "calendar", label: "Takvim" },
    ],
  },
  {
    title: "Yönetim",
    items: [
      { icon: "rules", label: "Kurallar" },
      { icon: "activity", label: "Aktivite Günlüğü" },
      { icon: "archive", label: "Arşiv" },
      { icon: "trash", label: "Çöp Kutusu" },
      { icon: "settings", label: "Ayarlar" },
    ],
  },
];

export const workspaceName = "Lospia Demo Operasyon";
export const currentUser = { name: "Elif K.", role: "Yönetici", initials: "EK" };

// ── Scene 3: Board workflow (faithful to KanbanBoard) ────────────────
export type BoardCard = {
  title: string;
  dept: DeptKey;
  status: StatusKey;
  due: string;
  overdue?: boolean;
  approval?: boolean;
  avatars: string[];
  description?: string;
};

export type BoardColumn = {
  id: string;
  label: string;
  status: StatusKey;
  cards: BoardCard[];
};

export const boardToolbar = {
  week: "29 Haziran – 5 Temmuz",
  create: "Görev oluştur",
  importCsv: "CSV'den içe aktar",
  filters: ["Departman", "Kişi"],
  search: "Ara…",
};

export const boardColumns: BoardColumn[] = [
  {
    id: "yapilacak",
    label: "Yapılacak",
    status: "yapilacak",
    cards: [
      { title: "Kampanya içerik planı", dept: "icerik", status: "yapilacak", due: "1 Tem", overdue: true, avatars: ["MA"], description: "Önümüzdeki iki haftanın içerik planı…" },
      { title: "Ürün görsel planı", dept: "tasarim", status: "yapilacak", due: "2 Tem", avatars: ["DT"], description: "Yeni ürünlerin görsel çekim planı…" },
    ],
  },
  {
    id: "devam",
    label: "Devam ediyor",
    status: "devam",
    cards: [
      { title: "Web sitesi banner güncellemesi", dept: "eticaret", status: "devam", due: "1 Tem", overdue: true, avatars: ["DT"], description: "Ana sayfa bannerları yeni kampanya…" },
      { title: "Ürün açıklamaları revizyonu", dept: "eticaret", status: "devam", due: "3 Tem", avatars: ["DT"], description: "Yeni ürünlerin açıklamaları marka diline…" },
    ],
  },
  {
    id: "review",
    label: "Kontrol / Onay",
    status: "review",
    cards: [
      // The moving card lands here (see movingCard). Rendered separately.
      { title: "Onay bekleyen kreatifler", dept: "onaylar", status: "review", due: "1 Tem", overdue: true, approval: true, avatars: ["MA", "EK"], description: "Kampanya kreatifleri onaya sunuldu…" },
      { title: "E-posta bülteni taslağı", dept: "icerik", status: "review", due: "3 Tem", approval: true, avatars: ["MA"], description: "Haftalık bülten taslağı hazırlandı; onay…" },
    ],
  },
  {
    id: "done",
    label: "Tamamlandı",
    status: "done",
    cards: [
      { title: "Haftalık operasyon kontrolü", dept: "uretim", status: "done", due: "Bitti", avatars: ["ZD"], description: "Haftalık operasyon toplantısı…" },
    ],
  },
];

// The card that visibly slides from "Devam ediyor" into "Kontrol / Onay" and
// gets a calm highlight — it is the same task shown in the Scene 4 detail.
export const movingCard: BoardCard = {
  title: "Numune revizyon kontrolü",
  dept: "uretim",
  status: "review",
  due: "3 Tem",
  overdue: true,
  approval: true,
  avatars: ["ZD", "EK"],
  description: "İkinci numune revizyonu kontrol edilecek…",
};

// ── Scene 4: Task detail / approval (faithful to TaskDetail) ─────────
export const taskDetail = {
  title: "Numune Revizyon Kontrolü",
  dept: "uretim" as DeptKey,
  responsible: { name: "Üretim", initials: "ZD" },
  summaryChips: {
    status: "review" as StatusKey,
    priority: "Yüksek",
    due: "Teslim: Bu hafta",
  },
  fields: [
    { label: "Sorumlu", value: "Üretim", kind: "text" as const },
    { label: "Teslim tarihi", value: "Bu hafta", kind: "date" as const },
    { label: "Durum", value: "Kontrol / Onay", kind: "status" as const },
    { label: "Not", value: "Revizyon kontrolü bekliyor", kind: "text" as const },
  ],
  description: "İkinci numune revizyonu kontrol edilecek; onay sonrası üretime geçilecek.",
};

// ── Scene 5: List + calendar visibility ──────────────────────────────
export type ListRow = {
  title: string;
  dept: DeptKey;
  status: StatusKey;
  due: string;
  overdue?: boolean;
  owner: string;
};

export const listRows: ListRow[] = [
  { title: "Numune revizyon kontrolü", dept: "uretim", status: "review", due: "3 Tem", overdue: true, owner: "Zeynep D." },
  { title: "Kampanya içerik planı", dept: "icerik", status: "yapilacak", due: "1 Tem", overdue: true, owner: "Mert A." },
  { title: "Ürün görsel planı", dept: "tasarim", status: "yapilacak", due: "2 Tem", owner: "Deniz T." },
  { title: "Web sitesi banner güncellemesi", dept: "eticaret", status: "devam", due: "1 Tem", overdue: true, owner: "Deniz T." },
  { title: "Ürün açıklamaları revizyonu", dept: "eticaret", status: "devam", due: "3 Tem", owner: "Deniz T." },
  { title: "E-posta bülteni taslağı", dept: "icerik", status: "review", due: "3 Tem", owner: "Mert A." },
  { title: "Onay bekleyen kreatifler", dept: "onaylar", status: "review", due: "1 Tem", overdue: true, owner: "Mert A." },
  { title: "Haftalık operasyon kontrolü", dept: "uretim", status: "done", due: "Bitti", owner: "Yönetim" },
];

export type CalCell = {
  day: number;
  muted?: boolean;
  today?: boolean;
  chips?: { dept: DeptKey; label: string; done?: boolean }[];
  more?: number;
};

export const calendar = {
  monthLabel: "Temmuz 2026",
  weekdays: ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"],
  weeks: [
    [
      { day: 29, muted: true, chips: [{ dept: "uretim", label: "Haftalık operasyon", done: true }] },
      { day: 30, muted: true },
      { day: 1, chips: [{ dept: "icerik", label: "Kampanya içerik" }, { dept: "tasarim", label: "Ürün görsel" }] },
      { day: 2 },
      { day: 3, chips: [{ dept: "eticaret", label: "Ürün açıklamaları" }, { dept: "uretim", label: "Numune revizyon" }], more: 1 },
      { day: 4 },
      { day: 5, today: true },
    ],
    [
      { day: 6, chips: [{ dept: "icerik", label: "E-posta bülteni" }, { dept: "onaylar", label: "Onay bekleyen" }] },
      { day: 7 },
      { day: 8, chips: [{ dept: "eticaret", label: "Web sitesi banner" }] },
      { day: 9 },
      { day: 10 },
      { day: 11 },
      { day: 12 },
    ],
  ] as CalCell[][],
};

// ── Scene 6: Weekly visibility (faithful to Gösterge Paneli tiles) ───
export type StatTile = {
  label: string;
  value: number;
  tone: "ink" | "success" | "review" | "danger" | "warning";
  icon: "active" | "check" | "clock" | "alert" | "flag";
};

export const dashboard = {
  title: "Gösterge Paneli",
  subtitle: "Ekip operasyonunun anlık durumu, riskler ve haftanın odağı",
  tiles: [
    { label: "Aktif görev", value: 16, tone: "ink", icon: "active" },
    { label: "Kontrol / Onay", value: 4, tone: "review", icon: "clock" },
    { label: "Geciken kritik", value: 2, tone: "danger", icon: "alert" },
    { label: "Tamamlanan", value: 4, tone: "success", icon: "check" },
  ] as StatTile[],
  focusTitle: "Bu haftanın odağı",
  focus: [
    { label: "Bugün teslim", value: "0", tone: "ink" as const },
    { label: "Bu hafta teslim", value: "6", tone: "ink" as const },
    { label: "Onay kuyruğu", value: "4", tone: "success" as const },
    { label: "Geciken kritik", value: "2", tone: "danger" as const },
  ],
};

// ── Scene 7: Final CTA ───────────────────────────────────────────────
export const cta = {
  headline: "Operasyonunuzu dağınık takipten çıkarıp tek panele taşıyalım.",
  button: "Kurulum görüşmesi planla",
  small: "15-30 dakikalık kısa bir görüşmeyle başlayın.",
};

// ── Scene timeline (30fps · 2250 frames = 75s total) ─────────────────
// Single source of truth for scene boundaries. Captions key off these frames.
// A slower, more sectional cut than the old 60s version — each scene has room
// to breathe so the premium walkthrough never feels rushed.
export const SCENES = {
  intro: { from: 0, duration: 150 }, //            0–5s   premium logo intro
  problem: { from: 150, duration: 210 }, //        5–12s  scattered chaos → panel
  board: { from: 360, duration: 540 }, //          12–30s board walkthrough
  task: { from: 900, duration: 390 }, //           30–43s task detail / approval
  listCalendar: { from: 1290, duration: 390 }, //  43–56s list + calendar
  weekly: { from: 1680, duration: 300 }, //        56–66s weekly dashboard
  cta: { from: 1980, duration: 270 }, //           66–75s CTA
} as const;

// ── Captions (slow, sectional — always shown, even when audio is missing) ──
// One calm line per scene, matching the sectional narration. Kept short so the
// translucent caption card stays a single readable line above the player chrome.
export type Caption = { from: number; duration: number; text: string };

export const captions: Caption[] = [
  { from: SCENES.intro.from, duration: SCENES.intro.duration, text: "Marka operasyonları tek panelde görünür hale gelsin." },
  { from: SCENES.problem.from, duration: SCENES.problem.duration, text: "Dağınık takip, operasyonun görünürlüğünü azaltır." },
  { from: SCENES.board.from, duration: SCENES.board.duration, text: "İşler statüye, sorumluya ve onay durumuna göre takip edilir." },
  { from: SCENES.task.from, duration: SCENES.task.duration, text: "Her işin sahibi, teslim tarihi ve onay durumu netleşir." },
  { from: SCENES.listCalendar.from, duration: SCENES.listCalendar.duration, text: "Liste ve takvim görünümüyle haftalık yoğunluğu önceden görürsünüz." },
  { from: SCENES.weekly.from, duration: SCENES.weekly.duration, text: "Haftalık görünürlük, tek tek sormadan oluşur." },
  { from: SCENES.cta.from, duration: SCENES.cta.duration, text: "Operasyonunuzu tek panele taşımak için kurulum görüşmesi planlayın." },
];

// ── Voice-over audio (optional, APPROVED file only) ──────────────────
// Mounted ONLY when `audio: true` is passed as an input prop — the render
// script sets that only when a manually listened-to and APPROVED voice file
// exists on disk. Earlier generated takes (master / per-scene / male) were
// rejected and archived; they are never referenced here. Until a voice is
// approved, the video ships silently with captions.
export const approvedVoiceover = "demo/audio/lospia-voiceover-approved.wav";

// ── Background music (optional, licensed + approved only) ────────────
// Included by the composition ONLY when the render script confirms a licensed,
// approved file exists on disk and passes `musicExt: "mp3" | "wav"`. Mixed
// well under the narration (see BackgroundMusic in LospiaDemo.tsx).
export const approvedMusic = {
  mp3: "demo/audio/music/lospia-background-approved.mp3",
  wav: "demo/audio/music/lospia-background-approved.wav",
} as const;
