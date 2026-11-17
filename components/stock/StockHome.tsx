"use client";

import Link from "next/link";
import { ChevronRight, Globe, Layers, Store, Warehouse } from "lucide-react";
import { Tile, TileGrid } from "@/components/ui/TileGrid";
import { useLiveRefresh } from "@/components/stock/useLiveRefresh";
import type { StockLevel, StockLocation } from "@/lib/stock/model";

/**
 * STOK GİRİŞİ — yerler. Tek tasarım dili: kutucuk (Pano kişi kartı).
 * Altındaki satır listeyi TARİF eder (o yerde stoğu olan ürün sayısı).
 *
 * "TÜM STOK" BİR YER DEĞİL, TOPLAMDIR — o yüzden kutucuk değil. Dördüncü
 * kutucuk olarak durunca "dört ayrı yer var" diye okunuyordu (Sıraç,
 * 17.11.2026: "sanki 4 ayrı yer gibi algılanıyor, diğerleriyle aynı gibi").
 * Yerlerin ALTINDA, onlardan ayrı biçimde tek bir satır olarak durur.
 */
const ICON = { store: Store, online: Globe, warehouse: Warehouse } as const;

export function StockHome({ locations, levels }: { locations: StockLocation[]; levels: StockLevel[] }) {
  useLiveRefresh();
  const productsAt = (locationId: string | null) => {
    const ids = new Set<string>();
    for (const l of levels) if (l.qty > 0 && (!locationId || l.location_id === locationId)) ids.add(l.product_id);
    return ids.size;
  };
  const units = levels.reduce((n, l) => n + l.qty, 0);
  const meta = (n: number) => (n > 0 ? `${n} ürün` : "boş");

  return (
    <div className="anim-fade">
      <TileGrid>
        {locations.map((l) => (
          <Tile key={l.id} href={`/stock?l=${l.id}`} title={l.name} meta={meta(productsAt(l.id))} icon={ICON[l.kind] ?? Store} />
        ))}
      </TileGrid>

      <Link
        href="/stock?l=all"
        className="group mt-5 flex items-center gap-3 rounded-card border border-dashed border-line-strong px-4 py-3.5 transition-all hover:border-ink hover:bg-surface"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-sunken text-muted">
          <Layers size={18} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-semibold text-ink">Tüm yerlerin toplamı</span>
          <span className="block text-[12.5px] tabular-nums text-muted">
            {productsAt(null)} ürün · {units.toLocaleString("tr-TR")} adet
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </div>
  );
}
