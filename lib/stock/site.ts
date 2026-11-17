/**
 * SİTE STOĞU → "Online" — aslifilinta.com'un beden bazında eldeki adedi.
 *
 * Sıraç (17.11.2026): "Web sitesindeki ürün satıldığı zaman … o ürünün
 * düştüğünü stoktan görmüş olmalı. Entegre biçimde çalışmalı bütün sistem."
 *
 * KAYNAK: WooCommerce Store API — anahtarsız, salt okunur, sitenin kendi
 * vitrinini besleyen uç (bkz. lib/collection/website.ts). Sepete en çok kaç
 * adet eklenebileceğini (`add_to_cart.maximum`) söyler; stok takibi açık bir
 * üründe bu sayı ELDEKİ ADETTİR (17.11.2026'da Contrast Stripe Tunic ile
 * doğrulandı: site 4, Excel'deki sayım 4). Takip kapalıysa 9999 döner — o
 * bedenin adedi BİLİNMİYOR demektir, sıfır değil; dokunulmaz.
 *
 * `type=variation` bütün bedenleri toplu verir (≈850 satır, 9 sayfa); ürün
 * başına ayrı istek gerekmez. İstekler İKİŞERLİ gider: 17.09.2026'da ~20
 * paralel istek canlı siteyi HTTP 500'e düşürmüştü.
 *
 * Bu dosya AĞ İŞİ ve SAF DÖNÜŞÜM içerir; veritabanına dokunmaz.
 */

import { decodeEntities, WEBSITE_BASE } from "@/lib/collection/website";
import { normalizeSize } from "@/lib/stock/model";

const STORE_API = `${WEBSITE_BASE}/wp-json/wc/store/v1`;
/** Store API "sınır yok"u bu sayıyla söyler. */
const UNLIMITED = 9999;
const PER_PAGE = 100;
const MAX_PAGES = 30;

interface StoreRow {
  id: number;
  parent?: number;
  type?: string;
  name?: string;
  sku?: string;
  permalink?: string;
  variation?: string;
  is_in_stock?: boolean;
  sold_individually?: boolean;
  add_to_cart?: { maximum?: number };
  images?: { src?: string; thumbnail?: string }[];
}

/** Sitedeki bir ürünün stok görünümü — bedenleriyle. */
export interface SiteStockProduct {
  id: number;
  name: string;
  url: string;
  imageUrl: string;
  /** Ürünün ve bedenlerinin SKU'ları (büyük harf, boşlar atılmış). */
  skus: string[];
  /** Beden → adet. `null` = site bu bedenin adedini tutmuyor (bilinmiyor). */
  sizes: Map<string, number | null>;
}

const SIZE_WORDS: Record<string, string> = {
  "XX-SMALL": "XXS", "X-SMALL": "XS", SMALL: "S", MEDIUM: "M", LARGE: "L", "X-LARGE": "XL", "XX-LARGE": "XXL",
};

/**
 * "Size: X-SMALL" → "XS" · "Shoe Size: 36" → "36" · "Size: SMALL – MEDIUM" →
 * "S-M" · "Size: LARGE, Color: Ecru" → "L ECRU" · boş → "ONE SIZE".
 */
export function sizeFromVariation(raw: string | null | undefined): string {
  const parts = decodeEntities(raw ?? "")
    .split(",")
    .map((p) => p.slice(p.indexOf(":") + 1).trim().toLocaleUpperCase("en-US"))
    .filter(Boolean)
    .map((v) =>
      v.split(/\s*[–—]\s*|\s+-\s+/).map((w) => SIZE_WORDS[w] ?? w).join("-"),
    );
  if (!parts.length) return "ONE SIZE";
  return normalizeSize(parts.join(" ")).slice(0, 30);
}

/** Satırın eldeki adedi; `null` = bilinmiyor (takip kapalı). */
function quantityOf(r: StoreRow): number | null {
  if (r.is_in_stock === false) return 0;
  const max = r.add_to_cart?.maximum;
  if (typeof max !== "number" || max >= UNLIMITED || r.sold_individually) return null;
  return Math.max(0, Math.floor(max));
}

async function fetchPage(query: string, page: number): Promise<{ rows: StoreRow[]; pages: number }> {
  const url = `${STORE_API}/products?${query}&per_page=${PER_PAGE}&page=${page}`;
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      lastStatus = res.status;
      if (res.ok) {
        const rows = (await res.json()) as StoreRow[];
        return { rows: Array.isArray(rows) ? rows : [], pages: Number(res.headers.get("x-wp-totalpages") ?? 1) || 1 };
      }
    } catch {
      /* zaman aşımı / ağ — yeniden dene */
    }
    await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
  }
  throw new Error(`Site yanıt vermedi${lastStatus ? ` (HTTP ${lastStatus})` : ""}.`);
}

/** Bir sorgunun bütün sayfaları — ilk sayfa sayıyı söyler, kalanı ikişerli. */
async function fetchAllPages(query: string): Promise<StoreRow[]> {
  const first = await fetchPage(query, 1);
  const out = [...first.rows];
  const pages = Math.min(first.pages, MAX_PAGES);
  for (let p = 2; p <= pages; p += 2) {
    const batch = await Promise.all([p, p + 1].filter((n) => n <= pages).map((n) => fetchPage(query, n)));
    for (const b of batch) out.push(...b.rows);
  }
  return out;
}

/**
 * Sitedeki YAYIMDA olan her ürün, bedenleri ve adetleriyle.
 * Ana ürünü yayımda olmayan bedenler atılır (satışta değil).
 */
export async function fetchSiteStock(): Promise<SiteStockProduct[]> {
  const products = await fetchAllPages("orderby=menu_order&order=asc");
  const variations = await fetchAllPages("type=variation");

  const byId = new Map<number, SiteStockProduct>();
  const addSku = (p: SiteStockProduct, sku: string | undefined) => {
    const s = (sku ?? "").trim().toLocaleUpperCase("en-US");
    if (s && !p.skus.includes(s)) p.skus.push(s);
  };
  const addSize = (p: SiteStockProduct, size: string, qty: number | null) => {
    if (!p.sizes.has(size)) { p.sizes.set(size, qty); return; }
    const prev = p.sizes.get(size)!;
    /* Aynı bedene düşen iki satır toplanır; biri bilinmiyorsa sonuç da öyle. */
    p.sizes.set(size, prev == null || qty == null ? null : prev + qty);
  };

  for (const r of products) {
    const p: SiteStockProduct = {
      id: r.id,
      name: decodeEntities(r.name ?? "").trim(),
      url: r.permalink ?? "",
      /* Küçük boy (800×1200, ~40 KB); asıl dosya ~260 KB — listede 170 tane. */
      imageUrl: r.images?.[0]?.thumbnail || r.images?.[0]?.src || "",
      skus: [],
      sizes: new Map(),
    };
    if (!p.name) continue;
    addSku(p, r.sku);
    if (r.type !== "variable") addSize(p, "ONE SIZE", quantityOf(r));
    byId.set(r.id, p);
  }
  for (const v of variations) {
    const p = v.parent ? byId.get(v.parent) : undefined;
    if (!p) continue;
    addSku(p, v.sku);
    addSize(p, sizeFromVariation(v.variation), quantityOf(v));
  }
  return [...byId.values()];
}

/** Ad karşılaştırması: harf/rakam dışı her şey boşluk, küçük harf. */
export const nameKey = (s: string) =>
  decodeEntities(s).toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();
