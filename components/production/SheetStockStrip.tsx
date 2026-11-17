import Link from "next/link";
import { Package } from "lucide-react";
import { sortSizes } from "@/lib/stock/model";

/**
 * FÖYDE STOK — ürünün eldeki adedi, föyden çıkmadan.
 *
 * Sıraç (17.11.2026): "Sistemde olup stokla ilgili olanları tek yerde
 * toplayalım… bir arada olması gerekenleri birbiriyle entegre et."
 * Föy ile stok kaydı ÜRÜN KODU üzerinden eşleşir (föydeki "Ürün kodu" =
 * stoktaki kod). Eşleşme varsa yer yer, beden beden eldeki adet burada
 * görünür; tıklayınca Stock'ta o ürün açılır. Stok şimdilik yalnız
 * yöneticiye açık olduğu için bu şerit de yalnız yöneticide çizilir.
 */
export interface SheetStock {
  code: string;
  rows: { location: string; size: string; qty: number }[];
}

export function SheetStockStrip({ stock }: { stock: SheetStock }) {
  const byLocation = new Map<string, Map<string, number>>();
  for (const r of stock.rows) {
    const m = byLocation.get(r.location) ?? new Map<string, number>();
    m.set(r.size, (m.get(r.size) ?? 0) + r.qty);
    byLocation.set(r.location, m);
  }
  const total = stock.rows.reduce((n, r) => n + r.qty, 0);
  return (
    <Link
      href={`/stock?l=all&q=${encodeURIComponent(stock.code)}`}
      className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-control border border-line bg-surface px-3 py-2 text-[12.5px] transition-all hover:border-line-strong hover:bg-surface-hover"
    >
      <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
        <Package size={14} aria-hidden /> Stok
      </span>
      {byLocation.size === 0 ? (
        <span className="text-muted">Hiçbir yerde stok yok</span>
      ) : (
        [...byLocation.entries()].map(([location, sizes]) => (
          <span key={location} className="inline-flex flex-wrap items-center gap-1.5 text-muted">
            <span>{location}</span>
            {sortSizes([...sizes.keys()]).map((s) => (
              <span key={s} className="inline-flex overflow-hidden rounded-control border border-line-strong tabular-nums">
                <span className="bg-surface-sunken px-1.5 py-0.5 font-medium">{s}</span>
                <span className="px-1.5 py-0.5 font-semibold text-ink">{sizes.get(s)}</span>
              </span>
            ))}
          </span>
        ))
      )}
      <span className="ml-auto tabular-nums text-muted">
        Toplam <b className="font-semibold text-ink">{total}</b> adet
      </span>
    </Link>
  );
}
