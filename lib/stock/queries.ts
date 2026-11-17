import type { createClient } from "@/lib/supabase/server";
import type { MovementKind } from "@/lib/stock/model";

/**
 * STOK — sunucu tarafı okuma yardımcıları (sayfa ve Excel dışa aktarımı
 * aynı sorguları kullanır; rakam iki yerde iki türlü çıkmasın).
 */
type Sb = Awaited<ReturnType<typeof createClient>>;

/** PostgREST tek istekte en çok 1000 satır döndürür — sayfa sayfa okunur. */
export async function fetchAllRows<T>(
  build: (_from: number, _to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
  max = 50_000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error || !data?.length) break;
    out.push(...(data as T[]));
    if (data.length < 1000) break;
  }
  return out;
}

/* ── Dönem ─────────────────────────────────────────────────────────────── */

export type SalesPeriod = "ay" | "yil" | "gecen-yil" | "hepsi";
export const SALES_PERIODS: { key: SalesPeriod; label: string }[] = [
  { key: "ay", label: "Bu ay" },
  { key: "yil", label: "Bu yıl" },
  { key: "gecen-yil", label: "Geçen yıl" },
  { key: "hepsi", label: "Tümü" },
];
export const isSalesPeriod = (v: string | undefined): v is SalesPeriod => SALES_PERIODS.some((p) => p.key === v);

/** İstanbul saatiyle (UTC+3, yaz saati yok) dönemin başı ve sonu. */
export function periodRange(period: SalesPeriod, now = new Date()): { from: string | null; to: string | null } {
  const ist = new Date(now.getTime() + 3 * 3600_000);
  const y = ist.getUTCFullYear(), m = ist.getUTCMonth();
  const at = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 1) - 3 * 3600_000).toISOString();
  switch (period) {
    case "ay": return { from: at(y, m), to: at(y, m + 1) };
    case "yil": return { from: at(y, 0), to: at(y + 1, 0) };
    case "gecen-yil": return { from: at(y - 1, 0), to: at(y, 0) };
    default: return { from: null, to: null };
  }
}

/* ── Satışlar ──────────────────────────────────────────────────────────── */

export interface SaleRow {
  id: string;
  product_id: string;
  location_id: string;
  size: string;
  kind: MovementKind;
  qty: number;
  unit_price: number | null;
  created_at: string;
  stock_products: { name: string; code: string; image_url: string } | null;
}

/** Dönemdeki satış ve iade hareketleri, en yeni üstte. */
export async function fetchSales(
  supabase: Sb, workspaceId: string, locationId: string | null, period: SalesPeriod,
): Promise<SaleRow[]> {
  const { from, to } = periodRange(period);
  return fetchAllRows<SaleRow>((a, b) => {
    let q = supabase
      .from("stock_movements")
      .select("id, product_id, location_id, size, kind, qty, unit_price, created_at, stock_products(name, code, image_url)")
      .eq("workspace_id", workspaceId)
      .in("kind", ["satis", "iade"])
      .order("created_at", { ascending: false })
      .range(a, b);
    if (locationId) q = q.eq("location_id", locationId);
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lt("created_at", to);
    return q;
  });
}

export interface SalesSummary {
  /** Satılan adet (iadeler düşülmeden). */
  sold: number;
  returned: number;
  /** Ciro: satış tutarı − iade tutarı (₺). Fiyatı boş satır 0 sayılır. */
  revenue: number;
  byMonth: { month: string; sold: number; revenue: number }[];
  top: { product_id: string; name: string; code: string; image_url: string; sold: number; revenue: number }[];
}

export function summarizeSales(rows: SaleRow[]): SalesSummary {
  let sold = 0, returned = 0, revenue = 0;
  const months = new Map<string, { sold: number; revenue: number }>();
  const products = new Map<string, SalesSummary["top"][number]>();
  for (const r of rows) {
    const n = Math.abs(r.qty);
    const amount = n * (r.unit_price ?? 0);
    /* Ay İstanbul saatine göre: gece yarısına yakın satış doğru aya düşsün. */
    const month = new Date(new Date(r.created_at).getTime() + 3 * 3600_000).toISOString().slice(0, 7);
    const m = months.get(month) ?? { sold: 0, revenue: 0 };
    if (r.kind === "satis") {
      sold += n; revenue += amount; m.sold += n; m.revenue += amount;
      const p = products.get(r.product_id) ?? {
        product_id: r.product_id, name: r.stock_products?.name ?? "—", code: r.stock_products?.code ?? "",
        image_url: r.stock_products?.image_url ?? "", sold: 0, revenue: 0,
      };
      p.sold += n; p.revenue += amount; products.set(r.product_id, p);
    } else {
      returned += n; revenue -= amount; m.revenue -= amount;
    }
    months.set(month, m);
  }
  return {
    sold, returned, revenue,
    byMonth: [...months.entries()].map(([month, v]) => ({ month, ...v })).sort((a, b) => b.month.localeCompare(a.month)),
    top: [...products.values()].sort((a, b) => b.sold - a.sold || b.revenue - a.revenue).slice(0, 10),
  };
}

/* ── Site ürünü → eldeki adet ──────────────────────────────────────────── */

/**
 * Site ürün kimliği → bütün yerlerdeki toplam adet. Yalnız stok kaydı siteye
 * bağlı (web_product_id) ürünler döner; kaydı olmayan ürün haritada YOKTUR
 * (0 değil — "bilinmiyor"). Stok okunamıyorsa (yetki, tablo yok) boş döner:
 * çağıran ekran stok bilgisi olmadan çalışmaya devam eder.
 */
export async function stockBySiteProduct(
  supabase: Sb, workspaceId: string, siteIds: number[],
): Promise<Record<string, number>> {
  const ids = [...new Set(siteIds.filter((n) => Number.isFinite(n)))].slice(0, 300);
  if (!ids.length) return {};
  const { data: products, error } = await supabase
    .from("stock_products")
    .select("id, web_product_id")
    .eq("workspace_id", workspaceId)
    .eq("active", true)
    .in("web_product_id", ids);
  if (error || !products?.length) return {};
  const siteOf = new Map((products as { id: string; web_product_id: number }[]).map((p) => [p.id, String(p.web_product_id)]));
  const levels = await fetchAllRows<{ product_id: string; qty: number }>((a, b) =>
    supabase
      .from("stock_levels")
      .select("product_id, qty")
      .eq("workspace_id", workspaceId)
      .in("product_id", [...siteOf.keys()])
      .order("product_id")
      .range(a, b));
  const out: Record<string, number> = {};
  for (const siteId of siteOf.values()) out[siteId] ??= 0;
  for (const l of levels) {
    const siteId = siteOf.get(l.product_id);
    if (siteId) out[siteId] += l.qty;
  }
  return out;
}
