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
    // Kanonik ad: eski "Oversize"/"Tek Beden" kolonları "One Size"da toplanır.
    const key = canonicalSize(size);
    if (key) out[key] = (out[key] ?? 0) + q;
  });
  return out;
}

/**
 * Beden dağılımının üretim satırında bir bedenin adedini ayarlar; beden yoksa
 * kolonu ekler; üretim satırı yoksa oluşturur. Maliyet tablosundan hücre
 * düzenlemesi için (tek kaynak, föye geri yazılır).
 */
export function withSizeQty(
  sd: SizeDistribution | null | undefined,
  size: string,
  value: string,
): SizeDistribution {
  const base: SizeDistribution = sd && Array.isArray(sd.sizes)
    ? { sizes: [...sd.sizes], rows: sd.rows.map((r) => ({ ...r, values: [...(r.values ?? [])] })) }
    : { sizes: [], rows: [] };

  const target = canonicalSize(size);
  let idx = base.sizes.findIndex((s) => canonicalSize(s) === target);
  if (idx === -1) { base.sizes.push(target); idx = base.sizes.length - 1; }

  if (base.rows.length === 0) {
    base.rows.push({ label: "Üretim adeti", values: [], total: "" });
  }
  // Tüm satırların değerlerini kolon sayısına hizala.
  base.rows = base.rows.map((r) => {
    const v = [...r.values];
    while (v.length < base.sizes.length) v.push("");
    return { ...r, values: v };
  });

  let prodIdx = base.rows.findIndex((r) => norm(r.label ?? "").includes("uretim adet"));
  if (prodIdx === -1) prodIdx = base.rows.findIndex((r) => !norm(r.label ?? "").includes("beden etiket"));
  if (prodIdx === -1) prodIdx = 0;

  base.rows[prodIdx].values[idx] = value;
  // total alanını temizle ki toplam değerlerden hesaplansın.
  base.rows[prodIdx].total = "";
  return base;
}

/**
 * Standart beden seti — her üretim föyünde HEP bu kolonlar görünür (kişi
 * hangisine girmek isterse ona girer). Önce tekli bedenler, sonra ikili
 * kombinasyonlar, sonra tek beden. Profesyonel, sabit set.
 *
 * Tek beden kolonunun adı Excel'deki gibi "One Size"dır. Eski "Oversize" /
 * "Tek Beden" adları aynı kolona eşlenir (bkz. canonicalSize) — iki ayrı
 * kolon görünmez, eski veri kaybolmaz.
 */
export const STANDARD_SIZES = [
  "XS", "S", "M", "L", "XL", "XXL",
  "XS-S", "S-M", "M-L", "L-XL", "XL-XXL",
  "One Size",
];

/** Serbest yazılmış beden adı → standart kolon adı. */
const SIZE_ALIASES: Record<string, string> = {
  "one size": "One Size",
  "onesize": "One Size",
  "oversize": "One Size",
  "over size": "One Size",
  "tek beden": "One Size",
  "tekbeden": "One Size",
};

/** "OVERSIZE" | "Tek Beden" | "ONE SIZE" → "One Size"; "xs" → "XS". */
export function canonicalSize(raw: string | null | undefined): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  const key = trimmed.toLowerCase().replace(/\s+/g, " ");
  const alias = SIZE_ALIASES[key];
  if (alias) return alias;
  return STANDARD_SIZES.find((s) => s.toLowerCase() === key) ?? trimmed;
}

/**
 * Bir föyün beden dağılımını standart kolon setine getirir: değerleri beden
 * adına göre eşleştirir (kanonik ad üzerinden — büyük/küçük harf ve eski
 * adlar dahil), standartta olmayan bedenleri sona ekler (veri kaybı olmasın).
 */
export function normalizeToStandardSizes(
  sd: SizeDistribution | null | undefined,
): SizeDistribution {
  const canon = (sd?.sizes ?? []).map(canonicalSize);
  const extras = canon.filter(
    (s, i) => s && !STANDARD_SIZES.includes(s) && canon.indexOf(s) === i,
  );
  const target = [...STANDARD_SIZES, ...extras];
  const rows = (sd?.rows ?? []).map((r) => ({
    label: r.label,
    total: r.total,
    // Aynı kolona eşlenen birden fazla eski beden varsa ilk DOLU değeri al.
    values: target.map((size) => {
      let fallback = "";
      for (let i = 0; i < canon.length; i++) {
        if (canon[i] !== size) continue;
        const v = r.values?.[i] ?? "";
        if (v !== "") return v;
        fallback = fallback || v;
      }
      return fallback;
    }),
  }));
  return { sizes: target, rows };
}

/** Beden kolonlarının kanonik sırası + adı (standart set). */
export function orderSizes(sizes: string[]): string[] {
  const uniq = Array.from(new Set(sizes.map(canonicalSize).filter(Boolean)));
  const rank = (s: string) => {
    const i = STANDARD_SIZES.indexOf(s);
    return i === -1 ? STANDARD_SIZES.length + uniq.indexOf(s) : i;
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
