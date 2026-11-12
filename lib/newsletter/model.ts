/**
 * BÜLTEN PLANI — ortak model (sunucu + istemci).
 *
 * Bülten haftada bir, PAZARTESİ gider; aylık plan Nisa Hanım'dan, onay Aslı
 * Hanım'dan. Gönderim panelde YOK (afcom-seo/27_bulten).
 *
 * 8.11.2026 toplantısı (Aslı Hanım): hafta sabit bölümlerden değil, NUMARALI
 * BLOKLARDAN oluşur — "Aynı formatta koy. Yukarıya başlık, altına link,
 * altına yazı… Çoktan seçmeli: story, kategori, ürün… Metin de; onu başa
 * koyarsan welcome metni olur… Yerlerini değiştirebilirsin." (20240372)
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

export type SocialPlatform = "instagram" | "youtube" | "linkedin" | "x";

/** Haftanın sosyal medyası — sıra Instagram → YouTube → LinkedIn → X.
 *  Platform adı yalnız düğmede geçer (taslak No01, not 6). */
export const SOCIAL_PLATFORMS: { key: SocialPlatform; label: string; button: string; url: string }[] = [
  { key: "instagram", label: "Instagram", button: "FOLLOW US ON INSTAGRAM", url: "https://www.instagram.com/aslifilinta/" },
  { key: "youtube", label: "YouTube", button: "WATCH ON YOUTUBE", url: "https://www.youtube.com/@asli_filinta" },
  { key: "linkedin", label: "LinkedIn", button: "FOLLOW US ON LINKEDIN", url: "https://www.linkedin.com/in/asli-filinta-b88a655" },
  { key: "x", label: "X", button: "FOLLOW US ON X", url: "https://x.com/aslifilinta" },
];

/* ── Bloklar ───────────────────────────────────────────────────────────── */

export type BlockType = "gorsel" | "metin" | "urun" | "kategori" | "story" | "sosyal";

export const BLOCK_TYPES: { key: BlockType; label: string }[] = [
  { key: "gorsel", label: "Görsel" },
  { key: "metin", label: "Metin" },
  { key: "urun", label: "Ürün" },
  { key: "kategori", label: "Kategori" },
  { key: "story", label: "Story" },
  { key: "sosyal", label: "Sosyal medya" },
];

/** Her blok AYNI kalıp; tür yalnız hangi alanın görüneceğini belirler. */
export interface NewsletterBlock {
  /** Yalnız ekranda anahtar/sıra için — postaya girmez. */
  id: string;
  type: BlockType;
  title: string;
  link: string;
  text: string;
  /** Postada görünen adres (yüklenen görselde depodaki herkese açık adres). */
  image_url: string;
  /** Panele yüklenen görselin depo yolu; siteden gelen görselde boş. */
  image_path: string;
  /** Yalnız `urun`. */
  products: NewsletterProduct[];
  /** Yalnız `sosyal`. */
  platform: SocialPlatform | "";
  /** Düğme yazısı; boşsa türün varsayılanı (BLOCK_BUTTONS). */
  button: string;
  /** Siteden seçilen story/kategori kimliği — tekrar uyarısı için. */
  ref: string;
}

/** Türün varsayılan düğmesi — boş bırakılan `button` bununla çizilir. */
export function blockButton(b: Pick<NewsletterBlock, "type" | "button" | "platform">): string {
  if (b.button.trim()) return b.button.trim().toUpperCase();
  switch (b.type) {
    case "urun": return "VIEW ALL PIECES";
    case "kategori": return "DISCOVER THE COLLECTION";
    case "story": return "THE CRAFT BEHIND EACH PIECE";
    case "sosyal": return (SOCIAL_PLATFORMS.find((p) => p.key === b.platform) ?? SOCIAL_PLATFORMS[0]).button;
    default: return "";
  }
}

/** Bu türün bağlantısı postada gerekli mi? (Onaya gönderirken uyarı.) */
export function blockNeedsLink(type: BlockType): boolean {
  return type === "gorsel" || type === "kategori" || type === "story" || type === "sosyal" || type === "urun";
}

export function newBlock(type: BlockType, id: string): NewsletterBlock {
  return {
    id, type, title: "", link: "", text: "", image_url: "", image_path: "",
    products: [], platform: type === "sosyal" ? "instagram" : "", button: "", ref: "",
  };
}

/**
 * YENİ HAFTANIN SIRASI (22.10 + 11.11 kararları): açılış görseli → metin →
 * ürün → story → sosyal medya. Welcome metni varsayılan olarak GELMEZ.
 */
export const DEFAULT_BLOCK_ORDER: BlockType[] = ["gorsel", "metin", "urun", "story", "sosyal"];

export function defaultBlocks(makeId: () => string): NewsletterBlock[] {
  return DEFAULT_BLOCK_ORDER.map((t) => newBlock(t, makeId()));
}

/** En fazla blok sayısı — "bir, iki, üç, dört… en çok beş" + pay. */
export const MAX_BLOCKS = 8;

export interface NewsletterWeek {
  id: string | null;
  send_date: string; // yyyy-MM-dd, pazartesi
  status: NewsletterStatus;
  subject: string;
  theme: string;
  notes: string;
  blocks: NewsletterBlock[];
}

export const NEWSLETTER_SELECT = "id, send_date, status, subject, theme, notes, blocks";

/** Kaydedilebilir metin alanları — tek tek kaydedilir. */
export const NEWSLETTER_TEXT_FIELDS = ["subject", "theme", "notes"] as const;
export type NewsletterTextField = (typeof NEWSLETTER_TEXT_FIELDS)[number];

/**
 * STORY DÜĞMESİ — Aslı Hanım'ın listesi. Her hafta farklı olmalı
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

export function emptyWeek(sendDate: string, makeId: () => string): NewsletterWeek {
  return {
    id: null, send_date: sendDate, status: "taslak",
    subject: "", theme: "", notes: "", blocks: defaultBlocks(makeId),
  };
}

/** Eski/eksik bloğu tam kalıba tamamlar — jsonb'den gelen her satır bundan geçer. */
export function normalizeBlock(raw: Partial<NewsletterBlock> & { type?: string }, fallbackId: string): NewsletterBlock {
  const type = (BLOCK_TYPES.some((t) => t.key === raw.type) ? raw.type : "metin") as BlockType;
  return {
    ...newBlock(type, raw.id || fallbackId),
    ...Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== null && v !== undefined)),
    type,
    products: Array.isArray(raw.products) ? raw.products : [],
  } as NewsletterBlock;
}

/* ── AFCOM-SEO'YA AKTARIM — "Planı indir" (JSON) ────────────────────────
   afcom-seo-5e'nin biçimi; postayı oradaki üretici yapar. */
export interface NewsletterExport {
  send_date: string;
  subject: string;
  status: NewsletterStatus;
  blocks: {
    no: number;
    type: BlockType;
    title: string;
    link: string;
    text: string;
    image_url: string;
    button: string;
    products: NewsletterProduct[];
    platform: SocialPlatform | "";
  }[];
}

export function exportWeek(w: NewsletterWeek): NewsletterExport {
  return {
    send_date: w.send_date,
    subject: w.subject,
    status: w.status,
    blocks: w.blocks.map((b, i) => ({
      no: i + 1,
      type: b.type,
      title: b.title,
      link: b.link || (b.type === "sosyal" ? (SOCIAL_PLATFORMS.find((p) => p.key === b.platform)?.url ?? "") : ""),
      text: b.text,
      image_url: b.image_url,
      button: blockButton(b),
      products: b.type === "urun" ? b.products : [],
      platform: b.type === "sosyal" ? b.platform : "",
    })),
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
