/**
 * BÜLTEN PLANI — ortak model (sunucu + istemci).
 *
 * 06.11.2026 toplantısı: bülten haftada bir, PAZARTESİ gider; aylık plan
 * Nisa Hanım'dan, onay Aslı Hanım'dan. Gönderim panelde YOK (afcom-seo/27_bulten).
 */

export type NewsletterStatus = "taslak" | "onayda" | "onaylandi" | "duzeltme" | "gonderildi";

export const NEWSLETTER_STATUSES: { key: NewsletterStatus; label: string; tone: string }[] = [
  { key: "taslak", label: "Taslak", tone: "bg-surface-sunken text-muted" },
  { key: "onayda", label: "Onayda", tone: "bg-warning/15 text-warning" },
  { key: "onaylandi", label: "Onaylandı", tone: "bg-success/12 text-success" },
  { key: "duzeltme", label: "Düzeltme", tone: "bg-danger/10 text-danger" },
  { key: "gonderildi", label: "Gönderildi", tone: "bg-info/12 text-info" },
];

export interface NewsletterProduct {
  id: number;
  name: string;
  url: string;
  image_url: string;
  in_stock: boolean;
}

export interface NewsletterWeek {
  id: string | null;
  send_date: string; // yyyy-MM-dd, pazartesi
  status: NewsletterStatus;
  theme: string;
  subject: string;
  opening_title: string;
  opening_image_url: string;
  opening_link: string;
  welcome_heading: string;
  welcome: string;
  welcome_signoff: string;
  account_button: string;
  products_title: string;
  products: NewsletterProduct[];
  /** VIEW ALL PIECES düğmesinin gittiği koleksiyon sayfası (20240370). */
  products_link: string;
  products_button: string;
  /** Story düğmesinin yazısı — "THE CRAFT BEHIND EACH PIECE" gibi. */
  story_title: string;
  story_url: string;
  story_image_url: string;
  story_text: string;
  social_platform: SocialPlatform;
  /** Boşsa platformun kendi yazısı (SOCIAL_PLATFORMS.button). */
  social_button: string;
  social_image_url: string;
  social_link: string;
  notes: string;
}

export type SocialPlatform = "instagram" | "youtube" | "linkedin" | "x";

/** Haftanın sosyal medyası — sıra Instagram → YouTube → LinkedIn → X.
 *  Platform adı yalnız düğmede geçer (taslak No01, not 6). */
export const SOCIAL_PLATFORMS: { key: SocialPlatform; label: string; button: string; url: string }[] = [
  { key: "instagram", label: "Instagram", button: "FOLLOW US ON INSTAGRAM", url: "https://www.instagram.com/aslifilinta/" },
  { key: "youtube", label: "YouTube", button: "WATCH ON YOUTUBE", url: "https://www.youtube.com/@asli_filinta" },
  { key: "linkedin", label: "LinkedIn", button: "FOLLOW US ON LINKEDIN", url: "https://www.linkedin.com/in/asli-filinta-b88a655" },
  { key: "x", label: "X", button: "FOLLOW US ON X", url: "https://x.com/aslifilinta" },
];

export const NEWSLETTER_SELECT =
  "id, send_date, status, theme, subject, opening_title, opening_image_url, opening_link, welcome_heading, welcome, welcome_signoff, account_button, products_title, products, products_link, products_button, story_title, story_url, story_image_url, story_text, social_platform, social_button, social_image_url, social_link, notes";

/** Kaydedilebilir metin alanları — tek tek kaydedilir. */
export const NEWSLETTER_TEXT_FIELDS = [
  "theme", "subject", "opening_title", "opening_image_url", "opening_link",
  "welcome_heading", "welcome", "welcome_signoff", "account_button",
  "products_title", "products_link", "products_button", "story_title", "story_url",
  "story_image_url", "story_text", "social_button", "social_image_url", "social_link", "notes",
] as const;
export type NewsletterTextField = (typeof NEWSLETTER_TEXT_FIELDS)[number];

/**
 * STORY BAŞLIKLARI — Aslı Hanım'ın listesi. Her hafta farklı olmalı
 * ("Discover" tekrarlanmaz). Liste öneri; serbest yazmak da serbest.
 */
export const STORY_TITLES = [
  "Behind the Craft",
  "The Art of Making",
  "A Story of Craftsmanship",
  "From Heritage to Creation",
  "Made with Intention",
  "The Craft Behind Each Piece",
  "Explore Our Craftsmanship",
  "The Art of Upcycling", // yalnız gerçek ileri dönüşüm koleksiyonunda
  "Our Heritage",
];

/**
 * WELCOME METNİ — Aslı Hanım'ın onaylı metni (29.10.2026, welcometoaslifilinta
 * .docx; afcom-seo/27_bulten/build3.py ile birebir). DEĞİŞTİRİLMEZ: yeni hafta
 * bu metinle doğar, ekip gerekirse o haftada düzenler.
 */
export const WELCOME_HEADING = "Welcome to the World of Aslı Filinta";
/* Postanın öteki varsayılan yazıları — 20240371 kolon varsayılanlarıyla aynı.
   Her hafta değiştirilebilir; bunlar yalnız yeni haftanın başlangıcı. */
export const WELCOME_SIGNOFF = "With love from Anatolia,\nAslı Filinta";
export const ACCOUNT_BUTTON = "CREATE AN ACCOUNT";
export const PRODUCTS_BUTTON = "VIEW ALL PIECES";
export const DEFAULT_WELCOME = `We are delighted to welcome you to Aslı Filinta, where cultural heritage, craftsmanship, and contemporary design come together.

Rooted in cultural memory and guided by a commitment to social, economic, and ecological sustainability, our work celebrates the knowledge carried across generations and the hands that keep it alive.

Beyond our collections, the Filinta Methodology brings together artisans, women-led collectives, educational institutions, and creative industries to transform traditional knowledge into meaningful opportunities for the future.

As part of our community, you will be among the first to discover our latest collections, unique handcrafted pieces, cultural collaborations, exhibitions, and upcoming projects.

We invite you to explore a world where design becomes a bridge between the past and the future, and where individual creativity contributes to collective progress.`;

export function emptyWeek(sendDate: string): NewsletterWeek {
  return {
    id: null, send_date: sendDate, status: "taslak",
    theme: "", subject: "", opening_title: "", opening_image_url: "", opening_link: "",
    welcome_heading: WELCOME_HEADING, welcome: DEFAULT_WELCOME, welcome_signoff: WELCOME_SIGNOFF,
    account_button: ACCOUNT_BUTTON, products_title: "", products: [], products_link: "",
    products_button: PRODUCTS_BUTTON, social_button: "",
    story_title: "", story_url: "", story_image_url: "", story_text: "",
    social_platform: "instagram", social_image_url: "", social_link: "", notes: "",
  };
}

/** Ayın pazartesileri (yyyy-MM-dd). `month` = "yyyy-MM". Saat dilimi taşımaz. */
export function mondaysOfMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const out: string[] = [];
  const d = new Date(Date.UTC(y, m - 1, 1));
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCMonth() === m - 1) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isMonday(iso: string): boolean {
  if (!DATE_RE.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.getUTCDay() === 1 && d.toISOString().slice(0, 10) === iso;
}
