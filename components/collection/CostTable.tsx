"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Wallet, ClipboardList, ExternalLink, Check, Loader2, Info, FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { updateProductionSheetPricing } from "@/lib/actions/production";
import { categoryLabel } from "@/lib/collection/taxonomy";
import { totalQuantity, parseMoney, formatMoney } from "@/lib/collection/cost";
import type { ProductionSheet, ProductionPricing } from "@/types";

type Row = Pick<
  ProductionSheet,
  "id" | "title" | "product_kind" | "category" | "subcategory" | "pricing" | "size_distribution" | "status"
>;

interface Props {
  rows: Row[];
}

const UNCAT = "__uncat__";
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

  const qtyOf = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) m[r.id] = totalQuantity(r.size_distribution);
    return m;
  }, [rows]);

  const setField = (id: string, field: keyof ProductionPricing, value: string) =>
    setPricing((p) => ({ ...p, [id]: { ...p[id], [field]: value } }));

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

  // Kategoriye göre grupla (Excel'deki gibi bölümlü) — genel toplam en altta.
  const groups = useMemo(() => {
    const byCat = new Map<string, Row[]>();
    for (const r of rows) {
      const c = r.category ?? UNCAT;
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c)!.push(r);
    }
    return Array.from(byCat.entries());
  }, [rows]);

  const lineTotal = (id: string) => qtyOf[id] * parseMoney(pricing[id]?.unit_price);
  const grandTotal = rows.reduce((acc, r) => acc + lineTotal(r.id), 0);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
      <ModulePageHeader
        title="Maliyet"
        description="Tüm ürünlerin maliyeti tek tabloda. Bir fiyatı değiştirdiğinizde ürünün föyünde de otomatik güncellenir."
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
                  <th className="px-2 py-2.5 text-right">Adet</th>
                  <th className="px-2 py-2.5 text-right">Birim (₺)</th>
                  <th className="px-2 py-2.5 text-right">Satın alma (₺)</th>
                  <th className="px-2 py-2.5 text-right">Web satış (₺)</th>
                  <th className="px-3 py-2.5 text-right">Toplam</th>
                  <th className="w-8 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {groups.map(([cat, catRows]) => {
                  const catTotal = catRows.reduce((acc, r) => acc + lineTotal(r.id), 0);
                  return (
                    <GroupRows
                      key={cat}
                      catLabel={cat === UNCAT ? "Kategorisiz" : categoryLabel(cat)}
                      catRows={catRows}
                      catTotal={catTotal}
                      qtyOf={qtyOf}
                      pricing={pricing}
                      setField={setField}
                      save={save}
                      lineTotal={lineTotal}
                      savingId={savingId}
                      savedId={savedId}
                    />
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line-strong bg-surface-muted">
                  <td className="px-3 py-3 text-[13px] font-bold uppercase tracking-wide text-ink" colSpan={5}>
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
        <Info size={13} /> Fiyatlar tek kaynaktan gelir: burada değiştirince ürünün föyünde, föyde değiştirince burada güncellenir. Adet, föydeki beden dağılımından hesaplanır. Genel toplam KDV hariçtir.
      </p>
    </div>
  );
}

// ── Kategori bölümü + satırları ──────────────────────────────────────────────
function GroupRows({
  catLabel, catRows, catTotal, qtyOf, pricing, setField, save, lineTotal, savingId, savedId,
}: {
  catLabel: string;
  catRows: Row[];
  catTotal: number;
  qtyOf: Record<string, number>;
  pricing: Record<string, ProductionPricing>;
  setField: (_id: string, _field: keyof ProductionPricing, _value: string) => void;
  save: (_id: string) => void;
  lineTotal: (_id: string) => number;
  savingId: string | null;
  savedId: string | null;
}) {
  return (
    <>
      <tr className="border-b border-line bg-app/40">
        <td colSpan={7} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-subtle">
          {catLabel} <span className="font-normal text-subtle/70">· {catRows.length} ürün</span>
        </td>
      </tr>
      {catRows.map((r) => (
        <tr key={r.id} className="border-b border-line/60 last:border-0 hover:bg-surface-muted/40">
          <td className="px-3 py-2">
            <Link href={`/production/${r.id}`} className="group inline-flex items-center gap-1.5 font-medium text-ink hover:text-brand-strong">
              <span className="min-w-0">{r.title}</span>
              <ExternalLink size={12} className="shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
            {r.product_kind && <span className="ml-2 text-[11px] text-subtle">{r.product_kind}</span>}
          </td>
          <td className="px-2 py-2 text-right tabular-nums text-muted">{qtyOf[r.id] || "—"}</td>
          <td className="px-2 py-2">
            <input
              className={inputCls}
              value={pricing[r.id]?.unit_price ?? ""}
              onChange={(e) => setField(r.id, "unit_price", e.target.value)}
              onBlur={() => save(r.id)}
              placeholder="0"
              inputMode="decimal"
            />
          </td>
          <td className="px-2 py-2">
            <input
              className={inputCls}
              value={pricing[r.id]?.purchase_cost ?? ""}
              onChange={(e) => setField(r.id, "purchase_cost", e.target.value)}
              onBlur={() => save(r.id)}
              placeholder="0"
              inputMode="decimal"
            />
          </td>
          <td className="px-2 py-2">
            <input
              className={inputCls}
              value={pricing[r.id]?.web_sale_price ?? ""}
              onChange={(e) => setField(r.id, "web_sale_price", e.target.value)}
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
      ))}
      <tr className="border-b border-line bg-app/20">
        <td colSpan={5} className="px-3 py-1.5 text-right text-[11.5px] font-medium text-subtle">
          {catLabel} ara toplam
        </td>
        <td className="px-3 py-1.5 text-right text-[12.5px] font-semibold tabular-nums text-muted">
          {formatMoney(catTotal)}
        </td>
        <td />
      </tr>
    </>
  );
}
