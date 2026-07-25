"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Wallet, ClipboardList, Check, Loader2, Info, FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { updateProductionSheetPricing } from "@/lib/actions/production";
import {
  totalQuantity, quantityBySize, orderSizes, parseMoney, formatMoney,
} from "@/lib/collection/cost";
import type { ProductionSheet, ProductionPricing } from "@/types";

type Row = Pick<
  ProductionSheet,
  "id" | "title" | "product_kind" | "category" | "subcategory" | "pricing" | "size_distribution"
>;

interface Props {
  rows: Row[];
}

const inputCls =
  "w-full rounded-md border border-line bg-surface px-2 py-1 text-[12.5px] text-ink text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-ring focus:border-brand-ring";

export function CostTable({ rows }: Props) {
  // Fiyatların yerel kopyası — blur'da action ile föye geri yazılır (tek kaynak).
  const [pricing, setPricing] = useState<Record<string, ProductionPricing>>(() => {
    const m: Record<string, ProductionPricing> = {};
    for (const r of rows) m[r.id] = { ...(r.pricing ?? {}) };
    return m;
  });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [, startSave] = useTransition();

  // Her ürünün beden→adet haritası + tüm ürünlerdeki beden kolonlarının birleşimi.
  const perRow = useMemo(() => {
    const map: Record<string, { qtyBySize: Record<string, number>; total: number }> = {};
    const sizeSet = new Set<string>();
    for (const r of rows) {
      const qbs = quantityBySize(r.size_distribution);
      Object.keys(qbs).forEach((s) => sizeSet.add(s));
      map[r.id] = { qtyBySize: qbs, total: totalQuantity(r.size_distribution) };
    }
    return { map, sizes: orderSizes([...sizeSet]) };
  }, [rows]);

  const sizes = perRow.sizes;

  const setUnit = (id: string, value: string) =>
    setPricing((p) => ({ ...p, [id]: { ...p[id], unit_price: value } }));

  function save(id: string) {
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
      if (!("error" in res)) {
        setSavedId(id);
        window.setTimeout(() => setSavedId((cur) => (cur === id ? null : cur)), 1800);
      }
    });
  }

  const lineTotal = (id: string) => (perRow.map[id]?.total ?? 0) * parseMoney(pricing[id]?.unit_price);
  const grandTotal = rows.reduce((acc, r) => acc + lineTotal(r.id), 0);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <ModulePageHeader
        title="Maliyet"
        description="Tüm ürünlerin maliyeti tek tabloda. Birim fiyatı değiştirince ürünün föyünde de otomatik güncellenir."
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
                <tr className="border-b border-line-strong bg-surface-muted text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="px-3 py-2.5 text-left">Ürün</th>
                  {sizes.map((s) => (
                    <th key={s} className="px-2 py-2.5 text-center">{s}</th>
                  ))}
                  <th className="px-2 py-2.5 text-right">Toplam Adet</th>
                  <th className="px-2 py-2.5 text-right">Birim Fiyat</th>
                  <th className="px-3 py-2.5 text-right">Toplam</th>
                  <th className="w-8 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const info = perRow.map[r.id];
                  return (
                    <tr key={r.id} className="border-b border-line/60 last:border-0 hover:bg-surface-muted/40">
                      <td className="px-3 py-2">
                        <Link href={`/production/${r.id}`} className="font-medium text-ink hover:text-brand-strong">
                          {r.title}
                        </Link>
                        {r.product_kind && <span className="ml-2 text-[11px] text-subtle">{r.product_kind}</span>}
                      </td>
                      {sizes.map((s) => {
                        const q = info?.qtyBySize[s] ?? 0;
                        return (
                          <td key={s} className="px-2 py-2 text-center tabular-nums text-muted">
                            {q || <span className="text-subtle/50">·</span>}
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-right font-medium tabular-nums text-ink">{info?.total || "—"}</td>
                      <td className="px-2 py-2">
                        <input
                          className={inputCls}
                          value={pricing[r.id]?.unit_price ?? ""}
                          onChange={(e) => setUnit(r.id, e.target.value)}
                          onBlur={() => save(r.id)}
                          placeholder="0"
                          inputMode="decimal"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">
                        {lineTotal(r.id) ? formatMoney(lineTotal(r.id)) : "—"}
                      </td>
                      <td className="px-2 py-2 text-center">
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
                  <td className="px-3 py-3 text-right text-[15px] font-bold tabular-nums text-ink">
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
        <Info size={13} /> Beden adetleri föydeki beden dağılımından gelir. Birim fiyatı burada değiştirince ürünün föyünde de güncellenir (tek kaynak). Genel toplam KDV hariçtir.
      </p>
    </div>
  );
}
