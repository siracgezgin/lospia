// Maliyet yardımcıları — föy pricing + beden dağılımından tutarlı sayı/para türet.
// Koleksiyon tarayıcısı ve Maliyet tablosu AYNI hesabı kullansın diye tek yer.

import type {
  ProductionSheet, SizeDistribution, ProductionPricing, CostItem, CostItemKey,
  SheetMaterialWithMaterial, MaterialCategory,
} from "@/types";

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

/**
 * Üretim adedini taşıyan satırın SIRASI (Excel "üretim adeti" mantığı).
 * Satır yoksa -1.
 *
 * TEK KURAL: okuyan (toplam) ve yazan (maliyet tablosundaki adet hücresi)
 * taraf aynı satırı seçsin diye burada durur. Yazma tarafında ayrı bir
 * normalizasyon vardı ve Türkçe harfleri siliyordu ("Üretim adeti" →
 * "retim adeti"): adet BAŞKA bir satıra yazılıyor, toplam ise üretim
 * satırından okunuyordu — yazılan sayı toplamı hiç değiştirmiyordu.
 */
export function productionRowIndex(sd: SizeDistribution | null | undefined): number {
  const rows = sd?.rows;
  if (!Array.isArray(rows) || rows.length === 0) return -1;
  const production = rows.findIndex((r) => norm(r.label ?? "").includes("uretim adet"));
  if (production !== -1) return production;
  const nonLabelRow = rows.findIndex((r) => !norm(r.label ?? "").includes("beden etiket"));
  return nonLabelRow !== -1 ? nonLabelRow : 0;
}

/** Üretim adedini taşıyan satırı seç (Excel "üretim adeti" mantığı). */
function pickProductionRow(
  sd: SizeDistribution | null | undefined,
): { label: string; values: string[]; total: string } | null {
  const i = productionRowIndex(sd);
  return i === -1 ? null : sd!.rows[i];
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

  let prodIdx = productionRowIndex(base);
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

/**
 * Maliyet kalemleri — Aslı Hanım'ın saydığı sıra.
 *
 *   "Kumaşın fiyatına ayrı giriyorsun. Dikim fiyatına ayrı giriyorsun.
 *    Fermuar fiyatına ayrı giriyorsun. Ütü paketi ayrı giriyorsun. Kalıba ayrı
 *    giriyorsun… genel giderleri ayrı giriyorsun."
 *
 * Sıra bilerek onun söylediği sıradır — ekranda tanıdık gelsin.
 */
export const COST_ITEM_DEFS: { key: CostItemKey; label: string }[] = [
  { key: "kumas",        label: "Kumaş" },
  { key: "dikim",        label: "Dikim" },
  { key: "fermuar",      label: "Fermuar" },
  { key: "utu_paket",    label: "Ütü / Paket" },
  { key: "kalip",        label: "Kalıp" },
  { key: "aksesuar",     label: "Aksesuar" },
  { key: "genel_gider",  label: "Genel Giderler" },
  { key: "diger",        label: "Diğer" },
];

const COST_ITEM_LABEL: Record<string, string> = Object.fromEntries(
  COST_ITEM_DEFS.map((d) => [d.key, d.label]),
);

export function costItemLabel(item: CostItem): string {
  return (item.label ?? "").trim() || COST_ITEM_LABEL[item.key] || "Kalem";
}

/** Boş bir maliyet kalemi seti — her föy aynı iskeletle açılır. */
export function emptyCostItems(): CostItem[] {
  return COST_ITEM_DEFS.map((d) => ({ key: d.key, amount: "" }));
}

/**
 * Hammadde kategorisi → maliyet kalemi.
 *
 * Reçeteden (BOM) gelen tutar doğru kaleme yazılsın diye. Tela/iplik/etiket
 * ayrı bir maliyet kalemi hak etmiyor — hepsi "aksesuar"da toplanır; kalem
 * listesi Aslı Hanım'ın saydığı kadar kalsın ("kumaş, dikim, fermuar, ütü
 * paketi, kalıp, genel giderler").
 */
export const MATERIAL_COST_KEY: Record<MaterialCategory, CostItemKey> = {
  kumas: "kumas",
  fermuar: "fermuar",
  aksesuar: "aksesuar",
  tela: "aksesuar",
  iplik: "aksesuar",
  etiket: "aksesuar",
  diger: "diger",
};

/** Bir reçete satırının birim maliyeti: tüketim × fiyat × (1 + fire). */
export function bomLineCost(row: SheetMaterialWithMaterial): number {
  const price = Number(row.material?.unit_price ?? 0);
  const qty = Number(row.consumption ?? 0);
  const waste = Number(row.waste_pct ?? 0) / 100;
  if (!Number.isFinite(price) || !Number.isFinite(qty)) return 0;
  return qty * price * (1 + (Number.isFinite(waste) ? waste : 0));
}

/**
 * Reçeteden gelen maliyet kalemleri.
 *
 * Aslı Hanım (2026-08-19) maliyeti kalem kalem istedi; kalemleri elle
 * giriyorduk. Reçete varsa MALZEME kalemleri (kumaş, fermuar, aksesuar) artık
 * hesaplanır — kumaş fiyatı değişince tüm föyler kendiliğinden güncellenir.
 * Dikim, ütü/paket, kalıp ve genel giderler elle kalır: onlar malzeme değil.
 */
export function bomCostByKey(rows: SheetMaterialWithMaterial[]): Partial<Record<CostItemKey, number>> {
  const out: Partial<Record<CostItemKey, number>> = {};
  for (const r of rows) {
    const key = MATERIAL_COST_KEY[r.material?.category ?? "diger"] ?? "diger";
    out[key] = (out[key] ?? 0) + bomLineCost(r);
  }
  return out;
}

/** Reçetenin toplam birim maliyeti. */
export function bomTotal(rows: SheetMaterialWithMaterial[]): number {
  return rows.reduce((a, r) => a + bomLineCost(r), 0);
}

/**
 * Ürünün BİRİM maliyeti = kalemlerin toplamı./**
 * Ürünün BİRİM maliyeti = kalemlerin toplamı.
 *
 * Kalem yoksa eski `unit_price` alanına düşer (geri uyum): mevcut föylerde
 * girilmiş tek rakam kaybolmasın.
 */
export function unitCostOf(
  pricing: ProductionPricing | null | undefined,
  /** Reçete satırları. Verilirse malzeme kalemleri BURADAN hesaplanır. */
  bom?: SheetMaterialWithMaterial[],
): number {
  const fromBom = bom?.length ? bomCostByKey(bom) : null;
  const items = pricing?.cost_items;
  if (Array.isArray(items) && items.length) {
    const sum = items.reduce((acc, it) => {
      // Reçeteden gelen kalem elle girilenin YERİNE geçer — iki kaynak
      // toplanırsa maliyet iki katına çıkardı.
      const bomVal = fromBom?.[it.key];
      return acc + (bomVal != null ? bomVal : parseMoney(it.amount));
    }, 0);
    if (sum > 0) return sum;
  }
  if (fromBom) {
    const sum = Object.values(fromBom).reduce((a, v) => a + (v ?? 0), 0);
    if (sum > 0) return sum;
  }
  return parseMoney(pricing?.unit_price);
}

/** Ustaya ödenecek BİRİM tutar — maliyetten AYRI kalem. */
export function ustaUnitPaymentOf(pricing: ProductionPricing | null | undefined): number {
  const explicit = parseMoney(pricing?.usta_unit_payment);
  if (explicit > 0) return explicit;
  // Geri uyum: eskiden "birim fiyat" bu anlamda kullanılıyordu (Aslı Hanım'ın
  // "bu maliyet değil, ödeme tablosu" dediği hesap). Kalem bazlı maliyet
  // girilmemişse tek rakamı ödeme kabul et.
  const items = pricing?.cost_items;
  const hasItems = Array.isArray(items) && items.some((i) => parseMoney(i.amount) > 0);
  return hasItems ? 0 : parseMoney(pricing?.unit_price);
}

/**
 * Beden GRUBU — Aslı Hanım (2026-08-19):
 *   "Xsmall'la small'a 1 diyeceksin. Medium'le large'a 2 diyeceksin.
 *    XXlarge'a 3 diyeceksin… Bir de üçüncü beden kategorin, hepsinin işaretli
 *    olduğu one size."
 *
 * XL sözlü olarak sayılmadı; ikili beden mantığı (XL-XXL) gereği 3. gruba
 * konuldu. Föy ekranında grup satırı DÜZENLENEBİLİR — düzeltmesi tek tık.
 */
export const DEFAULT_SIZE_GROUPS: Record<string, string> = {
  "XS": "1", "S": "1", "XS-S": "1",
  "M": "2", "L": "2", "S-M": "2", "M-L": "2",
  "XL": "3", "XXL": "3", "L-XL": "3", "XL-XXL": "3",
  "One Size": "OS",
};

/** Grup etiketi → ekranda gösterilecek ad. */
export const SIZE_GROUP_LABELS: Record<string, string> = {
  "1": "1", "2": "2", "3": "3", "OS": "One Size",
};

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

/**
 * Beden kolonlarinin BEDEN ILERLEMESINE gore sirasi.
 *
 * STANDARD_SIZES dizisi tekilleri (XS…XXL) kombolardan (XS-S…) once listeler;
 * dizideki yerini siralama olarak kullanmak "XL | XS-S | M-L" gibi okunamaz bir
 * basli uretiyordu. Sira artik bedenin kendi buyuklugu: kombo, basladigi bedenle
 * onu izleyen tekil arasina girer (XS < XS-S < S < S-M < M …).
 */
const SIZE_RANK: Record<string, number> = {
  XS: 0, "XS-S": 0.5, S: 1, "S-M": 1.5, M: 2, "M-L": 2.5,
  L: 3, "L-XL": 3.5, XL: 4, "XL-XXL": 4.5, XXL: 5,
  "One Size": 90, // her zaman en sonda
};

export function orderSizes(sizes: string[]): string[] {
  const uniq = Array.from(new Set(sizes.map(canonicalSize).filter(Boolean)));
  // Standart disi bedenler girdideki sirasini koruyarak sona eklenir.
  const rank = (s: string) => SIZE_RANK[s] ?? 100 + uniq.indexOf(s);
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
  // Birim = kalem kalem maliyetin toplamı (kalem yoksa eski tek rakama düşer).
  const unitPrice = unitCostOf(pricing);
  return {
    qty,
    unitPrice,
    lineTotal: qty * unitPrice,
    purchaseCost: parseMoney(pricing?.purchase_cost),
    webSalePrice: parseMoney(pricing?.web_sale_price),
    currency: pricing?.currency || "TL",
  };
}

/** 233400 → "₺233.400" (kuruşsuz, binlik nokta — Türkçe).
 *  TL dışındaki para biriminde SEMBOL YOK ama kod yazar ("233.400 USD"):
 *  eskiden hiçbir işaret basılmıyordu ve dolarla çalışılan bir föyün tutarı
 *  ekranda TL'den ayırt edilemiyordu. */
export function formatMoney(n: number, currency = "TL"): string {
  const rounded = Math.round(n);
  const grouped = rounded.toLocaleString("tr-TR");
  const cur = (currency || "TL").trim();
  if (cur === "TL" || cur === "TRY") return `₺${grouped}`;
  if (cur === "USD") return `$${grouped}`;
  if (cur === "EUR") return `€${grouped}`;
  return `${grouped} ${cur}`;
}

/** Föy tipini kabul eden kısayol (liste öğesi de olur — pricing+size_distribution yeter). */
export function costOfSheet(
  s: Pick<ProductionSheet, "pricing" | "size_distribution">,
): SheetCost {
  return sheetCost(s.pricing, s.size_distribution);
}
