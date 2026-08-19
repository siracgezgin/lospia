"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Wallet, Check, Loader2, FileSpreadsheet, Info } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { updateProductionSheetPricing } from "@/lib/actions/production";
import {
  totalQuantity, formatMoney, COST_ITEM_DEFS, emptyCostItems, unitCostOf,
} from "@/lib/collection/cost";
import { CollectionTabs } from "./PaymentTable";
import type { ProductionSheet, ProductionPricing, CostItemKey } from "@/types";

type Row = Pick<
  ProductionSheet,
  "id" | "title" | "product_kind" | "producer" | "category" | "subcategory" | "pricing" | "size_distribution"
>;

interface Props {
  rows: Row[];
}

const cellInput =
  "w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-right text-[13px] tabular-nums text-ink transition-[border-color,background-color,box-shadow] duration-150 hover:border-line focus:border-brand-ring focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-ring";
const colBorder = "border-l border-line/70";
const thSticky = "sticky top-0 z-10 border-b-2 border-line-strong bg-surface-muted";

/**
 * Maliyet — her ürünün BİRİM maliyeti, kalem kalem.
 *
 * Aslı Hanım (2026-08-19):
 *   "Maliyet her ürünün bir maliyetini hesaplamaktır. Kumaşın fiyatına ayrı
 *    giriyorsun, dikim fiyatına ayrı, fermuar fiyatına ayrı, ütü paketi ayrı,
 *    kalıba ayrı, genel giderleri ayrı… Öyle birim fiyat diye maliyet
 *    hesaplanmıyor."
 *
 * Ustaya yapılan ödeme burada DEĞİL — o "Ödeme Tablosu"nda yaşar.
 */
export function CostBreakdownTable({ rows }: Props) {
  const [pricing, setPricing] = useState<Record<string, ProductionPricing>>(() => {
    const m: Record<string, ProductionPricing> = {};
    for (const r of rows) {
      const p = { ...(r.pricing ?? {}) };
      if (!p.cost_items?.length) p.cost_items = emptyCostItems();
      m[r.id] = p;
    }
    return m;
  });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [, startSave] = useTransition();

  const amountOf = (id: string, key: CostItemKey) =>
    pricing[id]?.cost_items?.find((i) => i.key === key)?.amount ?? "";

  const unitCost = (id: string) => unitCostOf(pricing[id]);
  const qtyOf = (r: Row) => totalQuantity(r.size_distribution);
  const lineTotal = (r: Row) => qtyOf(r) * unitCost(r.id);

  const grand = useMemo(
    () => rows.reduce((a, r) => a + lineTotal(r), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, pricing],
  );

  const flash = (id: string) => {
    setSavedId(id);
    window.setTimeout(() => setSavedId((cur) => (cur === id ? null : cur)), 1800);
  };

  function setAmount(id: string, key: CostItemKey, value: string) {
    setPricing((p) => {
      const cur = p[id] ?? {};
      const items = cur.cost_items?.length ? [...cur.cost_items] : emptyCostItems();
      const idx = items.findIndex((i) => i.key === key);
      if (idx === -1) items.push({ key, amount: value });
      else items[idx] = { ...items[idx], amount: value };
      return { ...p, [id]: { ...cur, cost_items: items } };
    });
  }

  function save(id: string) {
    setSavingId(id);
    startSave(async () => {
      const p = pricing[id] ?? {};
      const res = await updateProductionSheetPricing(id, {
        unit_price: p.unit_price ?? "",
        purchase_cost: p.purchase_cost ?? "",
        web_sale_price: p.web_sale_price ?? "",
        currency: p.currency ?? "TL",
        notes: p.notes ?? "",
        cost_items: p.cost_items,
        usta_unit_payment: p.usta_unit_payment ?? "",
      });
      setSavingId(null);
      if (!("error" in res)) flash(id);
    });
  }

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <ModulePageHeader
        title="Cost"
        description="Her ürünün birim maliyeti kalem kalem: kumaş, dikim, fermuar, ütü/paket, kalıp, genel giderler."
        icon={Wallet}
        secondaryBackHref="/collection"
        rightSlot={
          rows.length > 0 ? (
            <a
              href="/collection/maliyet/export"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2 text-[13px] font-medium text-muted transition-[background-color,border-color,color,transform] duration-150 ease-standard hover:border-line-strong hover:bg-surface-muted hover:text-ink active:scale-[0.98]"
              title="Maliyet tablosunu Excel olarak indir"
            >
              <FileSpreadsheet size={15} /> Excel indir
            </a>
          ) : undefined
        }
      />

      <CollectionTabs active="maliyet" />

      <p className="mb-3 flex items-start gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2 text-[12.5px] text-muted">
        <Info size={14} className="mt-px shrink-0 text-subtle" />
        <span>
          Bu tablo <b className="font-semibold text-ink">ürün maliyetidir</b>. Ustaya ödenecek tutar
          ayrı bir şeydir ve <Link href="/collection/odeme" className="font-medium text-brand hover:text-brand-strong">Payment Table</Link>’da
          usta bazında toplanır.
        </span>
      </p>

      {rows.length === 0 ? (
        <div className="anim-fade-up rounded-2xl border border-line bg-surface px-6 py-14 text-center shadow-card">
          <div className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-surface-sunken text-subtle">
            <Wallet size={20} />
          </div>
          <p className="text-[13.5px] text-subtle">Henüz ürün yok. Collection’a föy ekleyin.</p>
        </div>
      ) : (
        <div className="anim-fade-up overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-card">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[980px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">
                  <th className={cn(thSticky, "min-w-[200px] px-3 py-2.5 text-left")}>Ürün</th>
                  {COST_ITEM_DEFS.map((d) => (
                    <th key={d.key} className={cn(thSticky, "w-[92px] px-1 py-2.5 text-right", colBorder)}>
                      {d.label}
                    </th>
                  ))}
                  <th className={cn(thSticky, "w-28 px-2 py-2.5 text-right", colBorder)}>Birim maliyet</th>
                  <th className={cn(thSticky, "w-16 px-2 py-2.5 text-right", colBorder)}>Adet</th>
                  <th className={cn(thSticky, "min-w-[120px] px-3 py-2.5 text-right", colBorder)}>Toplam</th>
                  <th className={cn(thSticky, "w-8 px-2 py-2.5")} />
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>td]:border-b-0 [&>tr>td]:border-b [&>tr>td]:border-b-hairline">
                {rows.map((r) => (
                  <tr key={r.id} className="transition-colors duration-150 hover:bg-surface-hover/60">
                    <td className="px-3 py-1.5">
                      <Link href={`/production/${r.id}`} className="font-medium text-ink transition-colors duration-150 hover:text-brand-strong">
                        {r.title}
                      </Link>
                      {r.producer && <span className="ml-2 text-[12px] text-subtle">{r.producer}</span>}
                    </td>
                    {COST_ITEM_DEFS.map((d) => (
                      <td key={d.key} className={cn("px-0.5 py-1", colBorder)}>
                        <input
                          className={cellInput}
                          value={amountOf(r.id, d.key)}
                          onChange={(e) => setAmount(r.id, d.key, e.target.value)}
                          onBlur={() => save(r.id)}
                          placeholder="·"
                          inputMode="decimal"
                        />
                      </td>
                    ))}
                    <td className={cn("px-2 py-1.5 text-right font-semibold tabular-nums text-ink", colBorder)}>
                      {unitCost(r.id) ? formatMoney(unitCost(r.id)) : "—"}
                    </td>
                    <td className={cn("px-2 py-1.5 text-right tabular-nums text-muted", colBorder)}>
                      {qtyOf(r) || "—"}
                    </td>
                    <td className={cn("px-3 py-1.5 text-right font-semibold tabular-nums text-ink", colBorder)}>
                      {lineTotal(r) ? formatMoney(lineTotal(r)) : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {savingId === r.id ? (
                        <Loader2 size={13} className="mx-auto animate-spin text-subtle" />
                      ) : savedId === r.id ? (
                        <Check size={13} className="mx-auto text-success" />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-[13px] font-bold">
                  <td className="sticky bottom-0 z-10 border-t-2 border-line-strong bg-surface-muted px-3 py-2 text-ink">
                    Genel toplam
                  </td>
                  <td
                    colSpan={COST_ITEM_DEFS.length + 2}
                    className="sticky bottom-0 z-10 border-l border-t-2 border-line-strong bg-surface-muted px-2 py-2"
                  />
                  <td className="sticky bottom-0 z-10 border-l border-t-2 border-line-strong bg-surface-muted px-3 py-2 text-right tabular-nums text-ink">
                    {formatMoney(grand)}
                  </td>
                  <td className="sticky bottom-0 z-10 border-t-2 border-line-strong bg-surface-muted px-2 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <p className="mt-2 px-1 text-[12px] text-subtle">
        Hücreye yazıp başka yere tıklayınca kaydedilir; aynı değerler ürünün üretim föyünde de görünür (tek kaynak).
      </p>
    </div>
  );
}
