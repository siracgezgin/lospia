/**
 * STOK — ortak model (sunucu + istemci). Migration 20240373.
 *
 * Aslı Hanım (9.11.2026): üç stok (Market 212 İstanbul, Çeşme, online) tek
 * yerde tutulsun, satışta düşsün. Mantık eski stok programından: her işlem bir
 * HAREKET, eldeki adet hareketlerin TOPLAMI.
 */

export interface StockLocation {
  id: string;
  name: string;
  kind: "store" | "online" | "warehouse";
  position: number;
}

export interface StockProduct {
  id: string;
  code: string;
  barcode: string;
  name: string;
  price: number | null;
  image_url: string;
  web_url: string;
  web_product_id: number | null;
  active: boolean;
}

/** Bir ürünün bir yerdeki bir bedeninin eldeki adedi. */
export interface StockLevel {
  product_id: string;
  location_id: string;
  size: string;
  qty: number;
}

export type MovementKind = "giris" | "satis" | "iade" | "transfer" | "sayim" | "cikis";

/**
 * Hareket türleri. `sign` = stoğa etkisi: +1 artırır, −1 azaltır,
 * 0 = özel (transfer iki bacak, sayım fark kadar).
 */
export const MOVEMENT_KINDS: { key: MovementKind; label: string; sign: 1 | -1 | 0; tone: string }[] = [
  { key: "satis", label: "Satış", sign: -1, tone: "bg-success/12 text-success" },
  { key: "giris", label: "Stok girişi", sign: 1, tone: "bg-info/12 text-info" },
  { key: "iade", label: "İade", sign: 1, tone: "bg-warning/15 text-warning" },
  { key: "transfer", label: "Transfer", sign: 0, tone: "bg-surface-sunken text-muted" },
  { key: "sayim", label: "Sayım", sign: 0, tone: "bg-surface-sunken text-muted" },
  { key: "cikis", label: "Çıkış", sign: -1, tone: "bg-danger/10 text-danger" },
];

export const movementLabel = (k: string) => MOVEMENT_KINDS.find((m) => m.key === k)?.label ?? k;

export interface StockMovement {
  id: string;
  product_id: string;
  location_id: string;
  size: string;
  kind: MovementKind;
  qty: number;
  unit_price: number | null;
  note: string;
  transfer_id: string | null;
  created_by: string | null;
  created_at: string;
}

/* ── Beden ─────────────────────────────────────────────────────────────── */

export const STANDARD_SIZES = ["XS", "S", "M", "L", "XL", "ONE SIZE"];
const SIZE_RANK = new Map(["XXS", "XS", "S", "M", "L", "XL", "XXL", "ONE SIZE"].map((s, i) => [s, i]));

/** "one size", "One Size", "ONE" → "ONE SIZE"; diğerleri büyük harf. */
export function normalizeSize(raw: string): string {
  const s = raw.trim().replace(/\s+/g, " ").toLocaleUpperCase("en-US");
  if (s === "ONE" || s === "ONESIZE" || s === "TEK BEDEN" || s === "STD") return "ONE SIZE";
  return s;
}

/** Bilinen bedenler sırasıyla, gerisi alfabetik sonda. */
export function sortSizes(sizes: string[]): string[] {
  return [...new Set(sizes)].sort((a, b) => {
    const ra = SIZE_RANK.get(a), rb = SIZE_RANK.get(b);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return a.localeCompare(b, "tr", { numeric: true });
  });
}

export const fmtPrice = (n: number | null | undefined) =>
  n == null ? "" : `₺${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Ürün başına beden → adet (verilen yerde ya da hepsinde). */
export function levelsByProduct(levels: StockLevel[], locationId: string | null): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const l of levels) {
    if (locationId && l.location_id !== locationId) continue;
    const m = out.get(l.product_id) ?? new Map<string, number>();
    m.set(l.size, (m.get(l.size) ?? 0) + l.qty);
    out.set(l.product_id, m);
  }
  return out;
}
