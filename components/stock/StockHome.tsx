"use client";

import { Globe, Layers, Store, Warehouse } from "lucide-react";
import { Tile, TileGrid } from "@/components/ui/TileGrid";
import type { StockLevel, StockLocation } from "@/lib/stock/model";

/**
 * STOK GİRİŞİ — yerler. Tek tasarım dili: kutucuk (Pano kişi kartı).
 * Altındaki satır listeyi TARİF eder (o yerde stoğu olan ürün sayısı).
 */
const ICON = { store: Store, online: Globe, warehouse: Warehouse } as const;

export function StockHome({ locations, levels }: { locations: StockLocation[]; levels: StockLevel[] }) {
  const productsAt = (locationId: string | null) => {
    const ids = new Set<string>();
    for (const l of levels) if (l.qty > 0 && (!locationId || l.location_id === locationId)) ids.add(l.product_id);
    return ids.size;
  };
  const meta = (n: number) => (n > 0 ? `${n} ürün` : "boş");

  return (
    <div className="anim-fade">
      <TileGrid>
        {locations.map((l) => (
          <Tile key={l.id} href={`/stock?l=${l.id}`} title={l.name} meta={meta(productsAt(l.id))} icon={ICON[l.kind] ?? Store} />
        ))}
        <Tile href="/stock?l=all" title="Tüm stok" meta={meta(productsAt(null))} icon={Layers} />
      </TileGrid>
    </div>
  );
}
