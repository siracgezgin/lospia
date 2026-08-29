"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Wallet, ClipboardList, Check, Loader2, Info,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { TextInput } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  updateProductionSheetPricing, updateProductionSheetSizeDistribution,
} from "@/lib/actions/production";
import {
  totalQuantity, quantityBySize, orderSizes, withSizeQty, parseMoney, formatMoney,
  STANDARD_SIZES,
} from "@/lib/collection/cost";
import type { ProductionSheet, ProductionPricing, SizeDistribution } from "@/types";

type Row = Pick<
  ProductionSheet,
  | "id" | "title" | "product_kind" | "product_code" | "photo_refs"
  | "category" | "subcategory" | "pricing" | "size_distribution"
>;

/** Satırdaki ürün görseli — Koleksiyon kartlarıyla AYNI öncelik: önce ürünün
 *  kendi fotoğrafı, teknik çizim en son. */
const COVER_PRIORITY = ["general", "embellishments", "accessories", "sewing", "fabric"] as const;
function coverOf(r: Row): string | null {
  const imgs = (Array.isArray(r.photo_refs) ? r.photo_refs : []).filter((i) => i?.url);
  for (const section of COVER_PRIORITY) {
    const hit = imgs.find((i) => i.section === section);
    if (hit) return hit.url;
  }
  return imgs[0]?.url ?? null;
}

interface Props {
  rows: Row[];
}

/* Hücre girdileri ortak TextInput'un kompakt hâlleri (h-8). */
const cellInput = "h-8 border-transparent bg-transparent px-1.5 text-center tabular-nums hover:border-line focus:bg-surface";
const priceInput = "h-8 px-2 text-right tabular-nums";
// Dikey çizgi yok; yalnız beden adetleri ile fiyat/toplam arasında tek ayırıcı.
const groupSep = "border-l border-hairline";
// Sticky başlık/dip hücreleri — tablo border-separate olduğundan çizgiler hücrede yaşar.
const thSticky = "sticky top-0 z-10 border-b border-line-strong bg-surface";
const tfSticky = "sticky bottom-0 z-10 border-t border-line-strong bg-surface-muted";

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

  // Tüm standart bedenler her zaman görünür (föy Beden Dağılımı ile aynı) +
  // veride olan standart-dışı bedenler sona eklenir. Kişi hangisine isterse girer.
  const sizes = useMemo(() => {
    const set = new Set<string>(STANDARD_SIZES);
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
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      {/* Başlık uygulama çubuğunda; aksiyonlar sekme satırının SAĞINDA. */}
      <h1 className="sr-only">Cost</h1>

      {/* Sekme çubuğu */}
      <div className="mb-4 flex items-center gap-1 border-b border-line">
        <Link
          href="/collection"
          className="flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-[13px] font-medium text-muted transition-colors duration-150 hover:border-line-strong hover:text-ink"
        >
          <ClipboardList size={15} /> Üretim Föyleri
        </Link>
        <span className="flex items-center gap-1.5 border-b-2 border-brand px-3 py-2 text-[13px] font-semibold text-ink">
          <Wallet size={15} /> Maliyet
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Wallet} className="anim-fade-up" title="Henüz ürün yok." description="Collection’a föy ekleyin." />
      ) : (
        <div className="anim-fade-up overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {/* border-separate: sticky başlık/dip hücrelerinde çizgilerin kayarken
              kaybolmaması için (border-collapse sticky ile çizgiyi geride bırakır). */}
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[880px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
                  <th className={cn(thSticky, "min-w-[220px] px-3 py-2.5 text-left")}>Ürün</th>
                  {sizes.map((s) => (
                    <th key={s} className={cn(thSticky, "w-16 px-1 py-2.5 text-center")}>{s}</th>
                  ))}
                  <th className={cn(thSticky, groupSep, "px-2 py-2.5 text-right")}>Toplam Adet</th>
                  <th className={cn(thSticky, "w-36 px-2 py-2.5 text-right")}>Birim Fiyat</th>
                  <th className={cn(thSticky, "min-w-[120px] px-3 py-2.5 text-right")}>Toplam</th>
                  <th className={cn(thSticky, "w-8 px-2 py-2.5")} />
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>td]:border-b-0 [&>tr>td]:border-b [&>tr>td]:border-b-hairline">
                {rows.map((r) => {
                  const qbs = qtyBySizeOf(r.id);
                  return (
                    <tr key={r.id} className="transition-colors duration-150 hover:bg-surface-hover">
                      {/* ÜRÜN — fotoğrafıyla. Maliyet tablosu bir muhasebe
                          çizelgesi gibi duruyordu; hangi ürünün satırında
                          olduğunu ancak adı okuyarak anlıyordunuz. Kapak
                          görseli Koleksiyon kartıyla aynı kuraldan gelir. */}
                      <td className="px-3 py-1.5">
                        <Link
                          href={`/production/${r.id}`}
                          className="group/prod flex items-center gap-2.5"
                        >
                          <span className="grid h-12 w-9 shrink-0 place-items-center overflow-hidden rounded-[6px] bg-surface-muted">
                            {coverOf(r) ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={coverOf(r)!} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <ClipboardList size={15} className="text-subtle" />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-ink transition-colors duration-150 group-hover/prod:text-brand-strong">
                              {r.title}
                            </span>
                            {(r.product_code || r.product_kind) && (
                              <span className="block truncate text-[12px] text-subtle">
                                {[r.product_code, r.product_kind].filter(Boolean).join(" · ")}
                              </span>
                            )}
                          </span>
                        </Link>
                      </td>
                      {sizes.map((s) => (
                        <td key={s} className="px-0.5 py-1">
                          <TextInput
                            className={cellInput}
                            aria-label={`${r.title} — ${s}`}
                            value={qbs[s] ? String(qbs[s]) : ""}
                            onChange={(e) => setQty(r.id, s, e.target.value)}
                            onBlur={() => saveDist(r.id)}
                            placeholder="·"
                            inputMode="numeric"
                          />
                        </td>
                      ))}
                      <td className={cn(groupSep, "px-2 py-1.5 text-right font-semibold tabular-nums text-ink")}>
                        {totalOf(r.id) || "—"}
                      </td>
                      <td className="px-2 py-1">
                        <TextInput
                          className={priceInput}
                          aria-label={`${r.title} — birim fiyat`}
                          value={pricing[r.id]?.unit_price ?? ""}
                          onChange={(e) => setUnit(r.id, e.target.value)}
                          onBlur={() => saveUnit(r.id)}
                          placeholder="0"
                          inputMode="decimal"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-ink">
                        {lineTotal(r.id) ? formatMoney(lineTotal(r.id)) : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {savingId === r.id ? (
                          <Loader2 size={14} className="mx-auto animate-spin text-subtle" />
                        ) : savedId === r.id ? (
                          <Check size={14} className="anim-scale-in mx-auto text-success" />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className={cn(tfSticky, "px-3 py-2.5 text-[13px] font-semibold text-ink")} colSpan={sizes.length + 3}>
                    Genel toplam
                  </td>
                  <td className={cn(tfSticky, "px-3 py-2.5 text-right text-[13px] font-semibold tabular-nums text-ink")}>
                    {formatMoney(grandTotal)}
                  </td>
                  <td className={tfSticky} />
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
