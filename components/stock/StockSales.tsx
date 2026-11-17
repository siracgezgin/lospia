"use client";

import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExcelLink, StockTabs } from "@/components/stock/StockList";
import { useLiveRefresh } from "@/components/stock/useLiveRefresh";
import { fmtPrice, type StockLocation } from "@/lib/stock/model";
import { SALES_PERIODS, type SaleRow, type SalesPeriod, type SalesSummary } from "@/lib/stock/queries";

/**
 * SATIŞLAR — eski programdaki "Satış Raporu / Satışlar" ekranlarının karşılığı.
 * Seçilen yerde ve dönemde: kaç adet satıldı, ciro, aylara göre dağılım,
 * en çok satanlar ve satışların kendisi. Rakamlar hareket defterinden
 * hesaplanır (lib/stock/queries.ts) — ayrı bir satış tablosu yok.
 */
export function StockSales({
  scope, scopeName, period, rows, summary, locations,
}: {
  scope: string;
  scopeName: string;
  period: SalesPeriod;
  rows: SaleRow[];
  summary: SalesSummary;
  locations: StockLocation[];
}) {
  useLiveRefresh();
  const locName = new Map(locations.map((l) => [l.id, l.name]));
  const maxMonth = Math.max(1, ...summary.byMonth.map((m) => m.sold));
  const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("tr-TR", { month: "long", year: "numeric" });

  return (
    <div className="anim-fade">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-ink sm:text-xl">{scopeName}</h2>
        <StockTabs scope={scope} active="satislar" />
        <div className="ml-auto"><ExcelLink href={`/stock/export?l=${scope}&v=satis&d=${period}`} /></div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {SALES_PERIODS.map((p) => (
          <Link
            key={p.key}
            href={`/stock?l=${scope}&v=satislar&d=${p.key}`}
            aria-current={period === p.key ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-full border px-3.5 text-[13px] font-medium transition-all",
              period === p.key ? "border-ink bg-ink text-white" : "border-line-strong text-ink hover:bg-surface-hover",
            )}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={ReceiptText} title="Bu dönemde satış yok" />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Figure label="Satılan" value={`${summary.sold.toLocaleString("tr-TR")} adet`} />
            <Figure label="Ciro" value={fmtPrice(summary.revenue)} />
            <Figure label="İade" value={`${summary.returned.toLocaleString("tr-TR")} adet`} />
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <section className="rounded-card border border-line bg-surface p-4">
              <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.05em] text-muted">Aylara göre</h3>
              <ul className="space-y-2">
                {summary.byMonth.map((m) => (
                  <li key={m.month} className="grid grid-cols-[7.5rem_minmax(0,1fr)_11.5rem] items-center gap-3 text-[13px]">
                    <span className="truncate capitalize text-ink">{monthLabel(m.month)}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                      <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.max(2, (m.sold / maxMonth) * 100)}%` }} />
                    </span>
                    <span className="whitespace-nowrap text-right tabular-nums text-muted">
                      <b className="font-semibold text-ink">{m.sold}</b> adet · {fmtPrice(m.revenue)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-card border border-line bg-surface p-4">
              <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.05em] text-muted">En çok satanlar</h3>
              <ol className="space-y-2">
                {summary.top.map((t) => (
                  <li key={t.product_id} className="flex items-center gap-3 text-[13px]">
                    {t.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.image_url} alt="" loading="lazy" className="size-9 shrink-0 rounded-control bg-[#f1f1f1] object-cover" />
                    ) : (
                      <span className="size-9 shrink-0 rounded-control bg-surface-sunken" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 truncate text-ink">{t.name}</span>
                    <span className="whitespace-nowrap tabular-nums text-muted">
                      <b className="font-semibold text-ink">{t.sold}</b> adet · {fmtPrice(t.revenue)}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <section>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-muted">Satışlar</h3>
            <ul className="divide-y divide-line rounded-card border border-line bg-surface">
              {rows.slice(0, 300).map((r) => {
                const n = Math.abs(r.qty);
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-[13px] sm:px-4">
                    <span className="w-24 shrink-0 tabular-nums text-muted">
                      {new Date(r.created_at).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                    <span className="min-w-0 flex-1 basis-40 truncate font-medium text-ink">{r.stock_products?.name ?? "—"}</span>
                    <span className="rounded-control border border-line-strong px-2 py-0.5 text-[12px] font-medium tabular-nums text-ink">{r.size}</span>
                    {r.kind === "iade" && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11.5px] font-semibold text-warning">İade</span>}
                    {scope === "all" && <span className="text-muted">{locName.get(r.location_id)}</span>}
                    <span className="ml-auto whitespace-nowrap tabular-nums text-muted">
                      <b className="font-semibold text-ink">{n}</b> adet{r.unit_price != null ? ` · ${fmtPrice(n * r.unit_price)}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
            {rows.length > 300 && (
              <p className="mt-2 text-[12.5px] text-muted">İlk 300 satış gösteriliyor; tamamı Excel dosyasında.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3">
      <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-muted">{label}</p>
      <p className="mt-1 text-[22px] font-semibold tabular-nums tracking-tight text-ink">{value}</p>
    </div>
  );
}
