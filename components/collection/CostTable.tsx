"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Wallet, ClipboardList, Check, Loader2, Info, FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import {
  updateProductionSheetPricing, updateProductionSheetSizeDistribution,
} from "@/lib/actions/production";
import {
  totalQuantity, quantityBySize, orderSizes, withSizeQty, parseMoney, formatMoney,
} from "@/lib/collection/cost";
import type { ProductionSheet, ProductionPricing, SizeDistribution } from "@/types";

type Row = Pick<
  ProductionSheet,
  "id" | "title" | "product_kind" | "category" | "subcategory" | "pricing" | "size_distribution"
>;

interface Props {
  rows: Row[];
}

const cellInput =
  "w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[12.5px] text-ink text-center tabular-nums hover:border-line focus:border-brand-ring focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-ring";
const priceInput =
  "w-full rounded-md border border-line bg-surface px-2 py-1 text-[12.5px] text-ink text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-ring focus:border-brand-ring";
// Hücreler arası dikey çizgi
const colBorder = "border-l border-line/70";

export function CostTable({ rows }: Props) {
  // Fiyat + beden dağılımı yerel kopyaları — blur'da föye geri yazılır (tek kaynak).
  const [pricing, setPricing] = useState<Record<string, ProductionPricing>>(() => {
    const m: Record<string, ProductionPricing> = {};
    for (const r of rows) m[r.id] = { ...(r.pricing ?? {}) };
    return m;
  });
  const [dist, setDist] = useState<Record<string, SizeDistribution>>(() => {
    const m: Record<string, SizeDistribution> = {};
    for (const r of rows) m[r.id] = r.size_distribution ?? { sizes: [], rows: [] };
    return m;
  });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [, startSave] = useTransition();

  // Tüm ürünlerdeki beden kolonlarının birleşimi (yerel duruma göre — yeni eklenen görünür).
  const sizes = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) Object.keys(quantityBySize(dist[r.id])).forEach((s) => set.add(s));
    return orderSizes([...set]);
  }, [rows, dist]);

  const flash = (id: string) => {
    setSavedId(id);
    window.setTimeout(() => setSavedId((cur) => (cur === id ? null : cur)), 1800);
  };

  const setUnit = (id: string, value: string) =>
    setPricing((p) => ({ ...p, [id]: { ...p[id], unit_price: value } }));

  function saveUnit(id: string) {
    setSavingId(id);
    startSave(async () => {
      const res = await updateProductionSheetPricing(id, {
        unit_price: pricing[id]?.unit_price ?? "",
        purchase_cost: pricing[id]?.purchase_cost ?? "",
        web_sale_price: pricing[id]?.web_sale_price ?? "",
        currency: pricing[id]?.currency ?? "TL",
        notes: pricing[id]?.notes ?? "",
      });
      setSavingId(null);
      if (!("error" in res)) flash(id);
    });
  }

  const setQty = (id: string, size: string, value: string) =>
    setDist((d) => ({ ...d, [id]: withSizeQty(d[id], size, value) }));

  function saveDist(id: string) {
    setSavingId(id);
    startSave(async () => {
      const res = await updateProductionSheetSizeDistribution(id, dist[id]);
      setSavingId(null);
      if (!("error" in res)) flash(id);
    });
  }

  const qtyBySizeOf = (id: string) => quantityBySize(dist[id]);
  const totalOf = (id: string) => totalQuantity(dist[id]);
  const lineTotal = (id: string) => totalOf(id) * parseMoney(pricing[id]?.unit_price);
  const grandTotal = rows.reduce((acc, r) => acc + lineTotal(r.id), 0);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <ModulePageHeader
        title="Maliyet"
        description="Tüm ürünlerin maliyeti tek tabloda. Beden adetlerini ve birim fiyatı burada değiştirebilirsiniz — ürünün föyünde de güncellenir."
        icon={Wallet}
        secondaryBackHref="/collection"
        rightSlot={
          rows.length > 0 ? (
            <a
              href="/collection/maliyet/export"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-muted hover:text-ink"
              title="Maliyet tablosunu Excel olarak indir"
            >
              <FileSpreadsheet size={15} /> Excel indir
            </a>
          ) : undefined
        }
      />

      {/* Sekme çubuğu */}
      <div className="mb-4 flex items-center gap-1 border-b border-line">
        <Link
          href="/collection"
          className="flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-[13px] font-medium text-muted transition-colors hover:text-ink"
        >
          <ClipboardList size={15} /> Üretim Föyleri
        </Link>
        <span className="flex items-center gap-1.5 border-b-2 border-brand px-3 py-2 text-[13px] font-semibold text-ink">
          <Wallet size={15} /> Maliyet
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface px-6 py-14 text-center shadow-card">
          <p className="text-[13.5px] text-subtle">Henüz ürün yok. Koleksiyona föy ekleyin.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b-2 border-line-strong bg-surface-muted text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="px-3 py-2.5 text-left">Ürün</th>
                  {sizes.map((s) => (
                    <th key={s} className={cn("w-14 px-1 py-2.5 text-center", colBorder)}>{s}</th>
                  ))}
                  <th className={cn("px-2 py-2.5 text-right", colBorder)}>Toplam Adet</th>
                  <th className={cn("w-32 px-2 py-2.5 text-right", colBorder)}>Birim Fiyat</th>
                  <th className={cn("px-3 py-2.5 text-right", colBorder)}>Toplam</th>
                  <th className="w-8 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const qbs = qtyBySizeOf(r.id);
                  return (
                    <tr key={r.id} className="border-b border-line/60 last:border-0 hover:bg-surface-muted/30">
                      <td className="px-3 py-1.5">
                        <Link href={`/production/${r.id}`} className="font-medium text-ink hover:text-brand-strong">
                          {r.title}
                        </Link>
                        {r.product_kind && <span className="ml-2 text-[11px] text-subtle">{r.product_kind}</span>}
                      </td>
                      {sizes.map((s) => (
                        <td key={s} className={cn("px-0.5 py-1", colBorder)}>
                          <input
                            className={cellInput}
                            value={qbs[s] ? String(qbs[s]) : ""}
                            onChange={(e) => setQty(r.id, s, e.target.value)}
                            onBlur={() => saveDist(r.id)}
                            placeholder="·"
                            inputMode="numeric"
                          />
                        </td>
                      ))}
                      <td className={cn("px-2 py-1.5 text-right font-semibold tabular-nums text-ink", colBorder)}>
                        {totalOf(r.id) || "—"}
                      </td>
                      <td className={cn("px-2 py-1", colBorder)}>
                        <input
                          className={priceInput}
                          value={pricing[r.id]?.unit_price ?? ""}
                          onChange={(e) => setUnit(r.id, e.target.value)}
                          onBlur={() => saveUnit(r.id)}
                          placeholder="0"
                          inputMode="decimal"
                        />
                      </td>
                      <td className={cn("px-3 py-1.5 text-right font-semibold tabular-nums text-ink", colBorder)}>
                        {lineTotal(r.id) ? formatMoney(lineTotal(r.id)) : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {savingId === r.id ? (
                          <Loader2 size={14} className="mx-auto animate-spin text-subtle" />
                        ) : savedId === r.id ? (
                          <Check size={14} className="mx-auto text-emerald-600" />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line-strong bg-surface-muted">
                  <td className="px-3 py-3 text-[13px] font-bold uppercase tracking-wide text-ink" colSpan={sizes.length + 3}>
                    Genel Toplam
                  </td>
                  <td className={cn("px-3 py-3 text-right text-[15px] font-bold tabular-nums text-ink", colBorder)}>
                    {formatMoney(grandTotal)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <p className="mt-3 flex items-center gap-1.5 px-1 text-[12px] text-subtle">
        <Info size={13} /> Beden adetleri ve birim fiyat tek kaynaktır: burada değiştirince ürünün föyünde de güncellenir. Genel toplam KDV hariçtir.
      </p>
    </div>
  );
}
