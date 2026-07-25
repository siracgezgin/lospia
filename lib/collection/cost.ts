// Maliyet yardımcıları — föy pricing + beden dağılımından tutarlı sayı/para türet.
// Koleksiyon tarayıcısı ve Maliyet tablosu AYNI hesabı kullansın diye tek yer.

import type { ProductionSheet, SizeDistribution, ProductionPricing } from "@/types";

/** "₺500.00", "500,00 TL", "1.800" → 500 / 1800. Boş/geçersiz → 0. */
export function parseMoney(raw: string | null | undefined): number {
  if (!raw) return 0;
  // Sadece rakam, virgül, nokta, eksi bırak.
  let s = String(raw).replace(/[^\d.,-]/g, "").trim();
  if (!s) return 0;
  // Türkçe biçim: nokta = binlik, virgül = ondalık. Virgül varsa noktalar binliktir.
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Serbest metin hücresini tam sayı adete çevir. */
function parseQty(raw: string | null | undefined): number {
  if (!raw) return 0;
  const n = parseInt(String(raw).replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

const norm = (s: string) =>
  s.toLowerCase().replace(/ı/g, "i").replace(/İ/g, "i").replace(/ü/g, "u").replace(/ş/g, "s");

/** Üretim adedini taşıyan satırı seç (Excel "üretim adeti" mantığı). */
function pickProductionRow(
  sd: SizeDistribution | null | undefined,
): { label: string; values: string[]; total: string } | null {
  if (!sd || !Array.isArray(sd.rows) || sd.rows.length === 0) return null;
  const production = sd.rows.find((r) => norm(r.label ?? "").includes("uretim adet"));
  if (production) return production;
  const nonLabelRow = sd.rows.find((r) => !norm(r.label ?? "").includes("beden etiket"));
  return nonLabelRow ?? sd.rows[0];
}

/**
 * Föyün toplam üretim adedi. Üretim satırında önce `total`, o yoksa hücre
 * değerlerinin toplamı. Excel'deki "TOPLAM ADET" karşılığı.
 */
export function totalQuantity(sd: SizeDistribution | null | undefined): number {
  const r = pickProductionRow(sd);
  if (!r) return 0;
  const t = parseQty(r.total);
  if (t > 0) return t;
  return (r.values ?? []).reduce((acc, v) => acc + parseQty(v), 0);
}

/** Föyün beden→adet dağılımı (üretim satırından). Ör. { XS: 20, M: 20, XL: 16 }. */
export function quantityBySize(sd: SizeDistribution | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  const r = pickProductionRow(sd);
  if (!r || !sd) return out;
  sd.sizes.forEach((size, i) => {
    const q = parseQty(r.values?.[i]);
    if (size) out[size] = (out[size] ?? 0) + q;
  });
  return out;
}

/** Beden kolonlarının Excel'deki gibi kanonik sırası. Bilinmeyenler sona eklenir. */
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "Oversize", "Tek Beden", "One Size", "ONE SIZE"];
export function orderSizes(sizes: string[]): string[] {
  const uniq = Array.from(new Set(sizes.filter(Boolean)));
  const rank = (s: string) => {
    const i = SIZE_ORDER.findIndex((o) => o.toLowerCase() === s.toLowerCase());
    return i === -1 ? SIZE_ORDER.length + uniq.indexOf(s) : i;
  };
  return uniq.sort((a, b) => rank(a) - rank(b));
}

export type SheetCost = {
  qty: number;
  unitPrice: number;
  lineTotal: number;      // qty × birim üretim fiyatı
  purchaseCost: number;   // birim satın alma maliyeti
  webSalePrice: number;   // web satış fiyatı
  currency: string;
};

/** Bir föyün maliyet özeti. pricing + size_distribution'dan türetilir. */
export function sheetCost(
  pricing: ProductionPricing | null | undefined,
  sd: SizeDistribution | null | undefined,
): SheetCost {
  const qty = totalQuantity(sd);
  const unitPrice = parseMoney(pricing?.unit_price);
  return {
    qty,
    unitPrice,
    lineTotal: qty * unitPrice,
    purchaseCost: parseMoney(pricing?.purchase_cost),
    webSalePrice: parseMoney(pricing?.web_sale_price),
    currency: pricing?.currency || "TL",
  };
}

/** 233400 → "₺233.400" (kuruşsuz, binlik nokta — Türkçe). */
export function formatMoney(n: number, currency = "TL"): string {
  const sym = currency === "TL" ? "₺" : "";
  const rounded = Math.round(n);
  const grouped = rounded.toLocaleString("tr-TR");
  return `${sym}${grouped}`;
}

/** Föy tipini kabul eden kısayol (liste öğesi de olur — pricing+size_distribution yeter). */
export function costOfSheet(
  s: Pick<ProductionSheet, "pricing" | "size_distribution">,
): SheetCost {
  return sheetCost(s.pricing, s.size_distribution);
}
