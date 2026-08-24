"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Wallet, ClipboardList, Check, Loader2, HandCoins, ChevronLeft, Scissors,
  MapPin, Clock3, Package,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { updateProductionSheetPricing } from "@/lib/actions/production";
import {
  totalQuantity, formatMoney, ustaUnitPaymentOf,
} from "@/lib/collection/cost";
import { assignPersonTones } from "@/lib/design/person-colors";
import { getPersonInitials } from "@/lib/utils/person-display";
import { SeasonSwitch, type SwitchSeason } from "./SeasonSwitch";
import type { ProductionSheet, ProductionPricing, Manufacturer } from "@/types";

type Row = Pick<
  ProductionSheet,
  "id" | "title" | "product_kind" | "producer" | "manufacturer_id" | "category" | "subcategory" | "pricing" | "size_distribution"
>;

export type PaymentManufacturer = Pick<
  Manufacturer,
  "id" | "name" | "photo_url" | "city" | "country" | "currency" | "lead_time_days" | "min_order_qty" | "is_active"
>;

interface Props {
  rows: Row[];
  /** Usta kayıtları. Boşsa eski serbest-metin gruplamasına düşülür. */
  manufacturers?: PaymentManufacturer[];
  /** Sezon bağlamı — Koleksiyon ile aynı seçim. */
  seasons?: SwitchSeason[];
}

/** Üreticisi girilmemiş föylerin toplandığı kova. */
const UNKNOWN = "Usta atanmadı";

const priceInput =
  "w-full rounded-md border border-line bg-surface px-2 py-1 text-[13px] text-ink text-right tabular-nums transition-[border-color,box-shadow] duration-150 hover:border-line-strong focus:outline-none focus:ring-2 focus:ring-brand-ring focus:border-brand-ring";

/**
 * Ödeme Tablosu — usta başına ödeme.
 *
 * Aslı Hanım (2026-08-19):
 *   "Sen burada muhasebeciye kaç ödeyeceğimizi hesaplamışsın… Demek ki bu
 *    maliyet değil, bu ÖDEME TABLOSU. Usta başına ödeme. Hakan Usta ödeme
 *    tablosu. Bu kalsın."
 *   "Cihan Usta, o ustaları da öyle açacağız: Cihan diye bir fotoğraf, Hakan
 *    diye bir olsa, ona gireceksin, bunlar açılacak — hangi ürünler orada
 *    dikiliyor."
 *
 * Yani Pano'daki kişi ızgarasının aynısı: önce usta kartları, tıklayınca o
 * ustanın diktiği ürünler ve ödemesi. Maliyet AYRI ekrandır (/collection/maliyet).
 */
export function PaymentTable({ rows, manufacturers = [], seasons = [] }: Props) {
  const [pricing, setPricing] = useState<Record<string, ProductionPricing>>(() => {
    const m: Record<string, ProductionPricing> = {};
    for (const r of rows) m[r.id] = { ...(r.pricing ?? {}) };
    return m;
  });
  const [openUsta, setOpenUsta] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [, startSave] = useTransition();

  const unitPaymentOf = (id: string) => ustaUnitPaymentOf(pricing[id]);
  const qtyOf = (r: Row) => totalQuantity(r.size_distribution);
  const lineTotal = (r: Row) => qtyOf(r) * unitPaymentOf(r.id);

  const byId = useMemo(() => {
    const m: Record<string, PaymentManufacturer> = {};
    for (const x of manufacturers) m[x.id] = x;
    return m;
  }, [manufacturers]);

  /**
   * Usta → föyleri + toplam ödeme.
   *
   * Gruplama anahtarı ÖNCE manufacturer_id'dir. Serbest metne düşmek yalnız
   * geri uyum içindir (usta tablosu migrate edilmemiş ya da föy henüz
   * bağlanmamışsa) — metinle gruplamak "Hakan Günaydın" ile "Hakan usta"yı iki
   * ayrı usta yapıyordu.
   */
  const ustalar = useMemo(() => {
    type G = { key: string; name: string; rec?: PaymentManufacturer; rows: Row[]; qty: number; total: number };
    const map = new Map<string, G>();
    for (const r of rows) {
      const rec = r.manufacturer_id ? byId[r.manufacturer_id] : undefined;
      const key = rec ? rec.id : ((r.producer ?? "").trim() || UNKNOWN);
      const name = rec ? rec.name : key;
      const g = map.get(key) ?? { key, name, rec, rows: [], qty: 0, total: 0 };
      g.rows.push(r);
      g.qty += qtyOf(r);
      g.total += lineTotal(r);
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => {
      if (a.name === UNKNOWN) return 1;
      if (b.name === UNKNOWN) return -1;
      return b.total - a.total || a.name.localeCompare(b.name, "tr");
    });
    // pricing değişince toplamlar yeniden hesaplansın.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, pricing, byId]);

  const tones = useMemo(() => assignPersonTones(ustalar.map((u) => u.key)), [ustalar]);
  const grandTotal = ustalar.reduce((a, u) => a + u.total, 0);

  const flash = (id: string) => {
    setSavedId(id);
    window.setTimeout(() => setSavedId((cur) => (cur === id ? null : cur)), 1800);
  };

  const setPayment = (id: string, value: string) =>
    setPricing((p) => ({ ...p, [id]: { ...p[id], usta_unit_payment: value } }));

  function savePayment(id: string) {
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

  const active = openUsta ? ustalar.find((u) => u.key === openUsta) ?? null : null;

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <ModulePageHeader
        title="Payment Table"
        description="Usta başına ödeme — hangi usta hangi ürünü dikti, ne kadar ödenecek. Ürün maliyeti ayrı ekranda."
        icon={HandCoins}
        secondaryBackHref="/collection"
        rightSlot={<SeasonSwitch seasons={seasons} />}
      />

      <CollectionTabs active="odeme" />

      {rows.length === 0 ? (
        <EmptyBox text="Henüz ürün yok. Collection’a föy ekleyin." />
      ) : active ? (
        /* ── Bir ustanın sayfası — diktiği ürünler ─────────────────────── */
        <section className="anim-fade">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setOpenUsta(null)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] font-medium text-muted transition-all duration-150 hover:border-line-strong hover:bg-surface-muted hover:text-ink active:scale-[0.98]"
            >
              <ChevronLeft size={14} /> Ustalar
            </button>
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden className={`h-5 w-1.5 shrink-0 rounded-full ${tones[active.key]?.bar ?? "bg-brand"}`} />
              <span className="truncate text-[15px] font-semibold tracking-tight text-ink">{active.name}</span>
            </span>
            <span className="ml-auto text-[13px] tabular-nums text-muted">
              {active.qty} adet · <b className="font-semibold text-ink">{formatMoney(active.total)}</b>
            </span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-card">
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">
                    <th className="sticky top-0 z-10 min-w-[220px] border-b-2 border-line-strong bg-surface-muted px-3 py-2.5 text-left">Ürün</th>
                    <th className="sticky top-0 z-10 border-b-2 border-l border-line-strong bg-surface-muted px-2 py-2.5 text-right">Adet</th>
                    <th className="sticky top-0 z-10 w-36 border-b-2 border-l border-line-strong bg-surface-muted px-2 py-2.5 text-right">Birim ödeme</th>
                    <th className="sticky top-0 z-10 min-w-[120px] border-b-2 border-l border-line-strong bg-surface-muted px-3 py-2.5 text-right">Toplam</th>
                    <th className="sticky top-0 z-10 w-8 border-b-2 border-line-strong bg-surface-muted px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody className="[&>tr:last-child>td]:border-b-0 [&>tr>td]:border-b [&>tr>td]:border-b-hairline">
                  {active.rows.map((r) => (
                    <tr key={r.id} className="transition-colors duration-150 hover:bg-surface-hover/60">
                      <td className="px-3 py-1.5">
                        <Link href={`/production/${r.id}`} className="font-medium text-ink transition-colors duration-150 hover:text-brand-strong">
                          {r.title}
                        </Link>
                        {r.product_kind && <span className="ml-2 text-[12px] text-subtle">{r.product_kind}</span>}
                      </td>
                      <td className="border-l border-line/70 px-2 py-1.5 text-right font-semibold tabular-nums text-ink">
                        {qtyOf(r) || "—"}
                      </td>
                      <td className="border-l border-line/70 px-2 py-1">
                        <input
                          className={priceInput}
                          value={pricing[r.id]?.usta_unit_payment ?? ""}
                          onChange={(e) => setPayment(r.id, e.target.value)}
                          onBlur={() => savePayment(r.id)}
                          placeholder={unitPaymentOf(r.id) ? String(unitPaymentOf(r.id)) : "0"}
                          inputMode="decimal"
                        />
                      </td>
                      <td className="border-l border-line/70 px-3 py-1.5 text-right font-semibold tabular-nums text-ink">
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
                    <td className="sticky bottom-0 z-10 border-t-2 border-line-strong bg-surface-muted px-3 py-2 text-ink">Toplam</td>
                    <td className="sticky bottom-0 z-10 border-l border-t-2 border-line-strong bg-surface-muted px-2 py-2 text-right tabular-nums text-ink">{active.qty}</td>
                    <td className="sticky bottom-0 z-10 border-l border-t-2 border-line-strong bg-surface-muted px-2 py-2" />
                    <td className="sticky bottom-0 z-10 border-l border-t-2 border-line-strong bg-surface-muted px-3 py-2 text-right tabular-nums text-ink">{formatMoney(active.total)}</td>
                    <td className="sticky bottom-0 z-10 border-t-2 border-line-strong bg-surface-muted px-2 py-2" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </section>
      ) : (
        /* ── Usta kartları — giriş ekranı ──────────────────────────────── */
        <section className="anim-fade">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight text-ink">Ustalar</h2>
              <p className="mt-0.5 text-[13px] text-muted">
                Bir ustaya tıklayın — hangi ürünler orada dikiliyor ve ne kadar ödenecek.
              </p>
            </div>
            <span className="text-[13px] tabular-nums text-muted">
              Genel toplam: <b className="font-semibold text-ink">{formatMoney(grandTotal)}</b>
            </span>
          </div>

          <div className="stagger-children grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {ustalar.map((u) => {
              const tone = tones[u.key]!;
              return (
                <button
                  key={u.key}
                  onClick={() => setOpenUsta(u.key)}
                  className={cn(
                    "group relative flex flex-col overflow-hidden rounded-2xl border bg-surface text-left shadow-card transition-all duration-200 ease-standard",
                    "hover:-translate-y-0.5 hover:shadow-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                    tone.border, tone.ring,
                  )}
                >
                  <span aria-hidden className={`absolute inset-x-0 top-0 h-1 ${tone.bar}`} />
                  <div className={cn("flex items-center gap-3 px-4 pb-3 pt-5", tone.soft)}>
                    {/* Aslı Hanım: "Cihan diye bir fotoğraf, Hakan diye bir olsa."
                        Fotoğraf varsa fotoğraf; yoksa ustaya özel ikon. */}
                    {u.rec?.photo_url ? (
                      <Image
                        src={u.rec.photo_url}
                        alt=""
                        width={48}
                        height={48}
                        className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-surface"
                        unoptimized
                      />
                    ) : (
                      <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-full text-white ring-2 ring-surface", tone.solid)}>
                        {u.name === UNKNOWN ? <Scissors size={20} strokeWidth={1.9} /> : getPersonInitials(u.name)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold tracking-tight text-ink" title={u.name}>
                        {u.name}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-muted">{u.rows.length} ürün · {u.qty} adet</span>
                    </span>
                  </div>
                  <div className="border-t border-hairline px-4 py-2.5">
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-subtle">Toplam ödeme</span>
                    <span className={cn("block text-[17px] font-semibold tabular-nums", u.total > 0 ? tone.text : "text-subtle")}>
                      {formatMoney(u.total)}
                    </span>
                    {/* Teslim süresi + minimum adet — Zedonk'un Manufacturers
                        sekmesinden alınan iki alan ("Lead Time: 30 days",
                        "Minimums: 50 units"). Sipariş verirken sorulan ilk iki
                        soru bunlar; kartta durması aramayı bitirir. */}
                    {(u.rec?.lead_time_days || u.rec?.min_order_qty || u.rec?.city) && (
                      <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-subtle">
                        {u.rec?.city && (
                          <span className="inline-flex items-center gap-1"><MapPin size={11} />{u.rec.city}</span>
                        )}
                        {u.rec?.lead_time_days != null && (
                          <span className="inline-flex items-center gap-1"><Clock3 size={11} />{u.rec.lead_time_days} gün</span>
                        )}
                        {u.rec?.min_order_qty != null && (
                          <span className="inline-flex items-center gap-1"><Package size={11} />min {u.rec.min_order_qty}</span>
                        )}
                      </span>
                    )}
                    {!u.rec && u.name !== UNKNOWN && (
                      <span className="mt-1.5 block text-[11.5px] text-warning">
                        Kayıtlı usta değil — Ayarlar’dan ekleyin
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/** Koleksiyon sekmeleri — Föyler · Maliyet · Ödeme. Tek yerden. */
export function CollectionTabs({ active }: { active: "foy" | "maliyet" | "odeme" }) {
  const item = (href: string, label: string, Icon: typeof Wallet, key: string) =>
    key === active ? (
      <span key={key} className="flex items-center gap-1.5 border-b-2 border-brand px-3 py-2 text-[13px] font-semibold text-ink">
        <Icon size={15} /> {label}
      </span>
    ) : (
      <Link
        key={key}
        href={href}
        className="flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-[13px] font-medium text-muted transition-colors duration-150 hover:border-line-strong hover:text-ink"
      >
        <Icon size={15} /> {label}
      </Link>
    );
  return (
    <div className="mb-4 flex items-center gap-1 overflow-x-auto border-b border-line no-scrollbar">
      {item("/collection", "Production Sheets", ClipboardList, "foy")}
      {item("/collection/maliyet", "Cost", Wallet, "maliyet")}
      {item("/collection/odeme", "Payment Table", HandCoins, "odeme")}
    </div>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="anim-fade-up rounded-2xl border border-line bg-surface px-6 py-14 text-center shadow-card">
      <div className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-surface-sunken text-subtle">
        <Wallet size={20} />
      </div>
      <p className="text-[13.5px] text-subtle">{text}</p>
    </div>
  );
}
