"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { History, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useLiveRefresh } from "@/components/stock/useLiveRefresh";
import { EmptyState } from "@/components/ui/EmptyState";
import { useConfirm } from "@/components/ui/useConfirm";
import { deleteStockMovement } from "@/lib/actions/stock";
import { StockTabs } from "@/components/stock/StockList";
import { fmtPrice, MOVEMENT_KINDS, SITE_NOTE, type StockLocation, type StockMovement } from "@/lib/stock/model";

/**
 * HAREKETLER — defterin kendisi, en yeni üstte. Stok rakamının NEDEN öyle
 * olduğu buradan okunur. Satır değiştirilmez; yanlış girilen hareketi yalnız
 * yönetici geri alır.
 */
export type MovementRow = StockMovement & { stock_products: { name: string; code: string } | null };

export function StockMovements({
  scope, scopeName, rows, locations, names, isAdmin,
}: {
  scope: string;
  scopeName: string;
  rows: MovementRow[];
  locations: StockLocation[];
  names: Record<string, string>;
  isAdmin: boolean;
}) {
  useLiveRefresh();
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const locName = new Map(locations.map((l) => [l.id, l.name]));

  async function undo(r: MovementRow) {
    const what = `${r.stock_products?.name ?? "Ürün"} · ${r.size} · ${r.qty > 0 ? "+" : ""}${r.qty}`;
    if (!(await ask({ title: "Hareket geri alınsın mı?", message: what, confirmLabel: "Geri al", tone: "danger" }))) return;
    const res = await deleteStockMovement(r.id);
    if ("error" in res) { setError(res.error); return; }
    setError(null);
    router.refresh();
  }

  return (
    <div className="anim-fade">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-ink sm:text-xl">{scopeName}</h2>
        <StockTabs scope={scope} active="hareketler" />
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[13.5px] font-medium text-danger">{error}</p>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={History} title="Henüz hareket yok" />
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface">
          {rows.map((r) => {
            const kind = MOVEMENT_KINDS.find((k) => k.key === r.kind);
            const meta = [
              new Date(r.created_at).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
              locName.get(r.location_id),
              /* Site eşitlemesi kimin ekranı açıksa onun adına yazılır; o kişi
                 bir şey yapmadı — ad gösterilmez, not "Site" der. */
              r.created_by && r.note !== SITE_NOTE ? names[r.created_by] : null,
              r.unit_price != null && (r.kind === "satis" || r.kind === "iade") ? fmtPrice(r.unit_price) : null,
              r.note || null,
            ].filter(Boolean).join(" · ");
            return (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                <span className={cn("w-14 shrink-0 text-right text-[15px] font-semibold tabular-nums", r.qty > 0 ? "text-success" : "text-danger")}>
                  {r.qty > 0 ? "+" : ""}{r.qty}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-[14px] font-medium text-ink">{r.stock_products?.name ?? "—"}</span>
                    <span className="rounded-full border border-line-strong px-2 py-0.5 text-[12px] font-medium tabular-nums text-ink">{r.size}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11.5px] font-semibold", kind?.tone)}>{kind?.label ?? r.kind}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[12.5px] text-muted">{meta}</p>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => undo(r)}
                    aria-label="Hareketi geri al"
                    title="Geri al"
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-control text-muted transition-all hover:bg-surface-hover hover:text-danger"
                  >
                    <Trash2 size={15} aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {dialog}
    </div>
  );
}
