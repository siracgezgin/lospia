"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  Wallet, ClipboardList, Check, Loader2, HandCoins, ChevronLeft, Scissors, Boxes,
  MapPin, Clock3, Package,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { updateProductionSheetPricing } from "@/lib/actions/production";
import {
  totalQuantity, formatMoney, ustaUnitPaymentOf, parseMoney,
} from "@/lib/collection/cost";
import { assignPersonTones } from "@/lib/design/person-colors";
import { getPersonInitials } from "@/lib/utils/person-display";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tile, TileGrid } from "@/components/ui/TileGrid";
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

// Sticky başlık/dip hücreleri — tablo border-separate olduğundan çizgiler
// hücrede yaşar (border-collapse sticky ile çizgiyi geride bırakır).
const thSticky = "sticky top-0 z-10 border-b border-line-strong bg-surface py-2.5";
const tfSticky = "sticky bottom-0 z-10 border-t border-line-strong bg-surface-muted px-2 py-2";
const groupSep = "border-l border-hairline";

/** Tablo hücresi girdisi — ortak TextInput'un kompakt hâli (h-8, sağa yaslı,
 *  hizalı rakam). Çerçeve dinlenirken görünür: hücrenin yazılabilir olduğu
 *  belli olsun. */
const priceInput = "h-8 px-2 text-right tabular-nums";

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
  /* KAYDETME HATASI GÖRÜNÜR. Hata sessizce yutuluyordu: yazdığınız tutar
     ekranda duruyor ama sunucuya geçmemiş oluyordu ve bunu ancak sayfayı
     yenileyince fark ediyordunuz. */
  const [saveError, setSaveError] = useState<string | null>(null);
  const [, startSave] = useTransition();
  /* Son kaydedilen hâlin parmak izi — blur her hücreden çıkışta tetiklendiği
     için dokunulmamış satırı tekrar yazmayı önler. */
  const savedSnapshots = useRef<Record<string, string>>({});

  const unitPaymentOf = (id: string) => ustaUnitPaymentOf(pricing[id]);
  const qtyOf = (r: Row) => totalQuantity(r.size_distribution);
  const lineTotal = (r: Row) => qtyOf(r) * unitPaymentOf(r.id);
  /** Faturalanan tutar toplamı — ödenen toplamla karşılaştırmak için.
   *  Tutar ayrıştırma TEK yerden (parseMoney): burada ayrı bir çevirici vardı
   *  ve "1.800,50" gibi Türkçe biçimi NaN'a düşürüp fatura toplamını sessizce
   *  sıfırlıyordu. */
  const invoiceTotal = (rs: Row[]) =>
    rs.reduce((a, r) => a + parseMoney(pricing[r.id]?.invoice_amount), 0);

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
  /* FATURA KARŞILIĞI. Aslı Hanım (2026-08-28): "Bir de fatura karşılığının
     bilgisi de girsin buraya. Çünkü muhasebeyi de buraya bağlayacaksın."
     Ödenen tutarla faturalanan tutar aynı olmayabilir; iki alan ayrı durur. */
  const setInvoiceNo = (id: string, value: string) =>
    setPricing((p) => ({ ...p, [id]: { ...p[id], invoice_no: value } }));
  const setInvoiceAmount = (id: string, value: string) =>
    setPricing((p) => ({ ...p, [id]: { ...p[id], invoice_amount: value } }));

  function savePayment(id: string) {
    const p = pricing[id] ?? {};
    const payload = {
      unit_price: p.unit_price ?? "",
      purchase_cost: p.purchase_cost ?? "",
      web_sale_price: p.web_sale_price ?? "",
      currency: p.currency ?? "TL",
      notes: p.notes ?? "",
      cost_items: p.cost_items,
      usta_unit_payment: p.usta_unit_payment ?? "",
      invoice_no: p.invoice_no ?? "",
      invoice_amount: p.invoice_amount ?? "",
    };
    const snapshot = JSON.stringify(payload);
    if (savedSnapshots.current[id] === snapshot) return;
    setSavingId(id);
    startSave(async () => {
      const res = await updateProductionSheetPricing(id, payload);
      setSavingId(null);
      if ("error" in res) {
        setSaveError("Ödeme bilgisi kaydedilemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.");
        return;
      }
      savedSnapshots.current[id] = snapshot;
      setSaveError(null);
      flash(id);
    });
  }

  const active = openUsta ? ustalar.find((u) => u.key === openUsta) ?? null : null;

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      {/* Başlık uygulama çubuğunda; aksiyonlar sekme satırının SAĞINDA. */}
      <h1 className="sr-only">Payment Table</h1>
      <CollectionTabs active="odeme" actions={<SeasonSwitch seasons={seasons} />} />

      {saveError && (
        <p role="alert" className="anim-fade-down mb-3 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[13.5px] font-medium text-danger">
          {saveError}
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={HandCoins} className="anim-fade-up" title="Henüz ürün yok." description="Collection’a föy ekleyin; ustalar burada görünür." />
      ) : active ? (
        /* ── Bir ustanın sayfası — diktiği ürünler ─────────────────────── */
        <section className="anim-fade">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setOpenUsta(null)} className="shrink-0">
              <ChevronLeft size={14} /> Ustalar
            </Button>
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden className={`h-5 w-1.5 shrink-0 rounded-full ${tones[active.key]?.bar ?? "bg-brand"}`} />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold tracking-tight text-ink">{active.name}</span>
                {/* Teslim süresi + minimum adet + şehir — Zedonk'un
                    Manufacturers sekmesinden. Sipariş verirken sorulan ilk
                    sorular; ustanın ürünlerine bakarken burada durur, kart
                    üstünde kalabalık etmez. */}
                {(active.rec?.city || active.rec?.lead_time_days != null || active.rec?.min_order_qty != null) && (
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-subtle">
                    {active.rec?.city && (
                      <span className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden />{active.rec.city}</span>
                    )}
                    {active.rec?.lead_time_days != null && (
                      <span className="inline-flex items-center gap-1"><Clock3 size={12} aria-hidden />{active.rec.lead_time_days} gün</span>
                    )}
                    {active.rec?.min_order_qty != null && (
                      <span className="inline-flex items-center gap-1"><Package size={12} aria-hidden />min {active.rec.min_order_qty}</span>
                    )}
                  </span>
                )}
                {!active.rec && active.name !== UNKNOWN && (
                  <span className="block text-[12px] text-warning">Kayıtlı usta değil — Product Data’dan ekleyin</span>
                )}
              </span>
            </span>
            <span className="ml-auto text-[13px] tabular-nums text-muted">
              {active.qty} adet · <b className="font-semibold text-ink">{formatMoney(active.total)}</b>
            </span>
          </div>

          <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full min-w-[820px] border-separate border-spacing-0 text-sm">
                <thead>
                  {/* Dikey çizgi yok; yalnız ÖDEME ile FATURA grubu arasında
                      tek ince ayırıcı — iki ayrı defter olduğu okunsun. */}
                  <tr className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
                    {/* Ürün sütunu yatayda da sabit — telefonda fatura
                        sütunlarına kayarken satırın kimliği kaybolmasın. */}
                    <th className={cn(thSticky, "sticky left-0 z-20 min-w-[168px] border-r border-hairline px-3 text-left sm:min-w-[220px]")}>Ürün</th>
                    <th className={cn(thSticky, "px-2 text-right")}>Adet</th>
                    <th className={cn(thSticky, "w-36 px-2 text-right")}>Birim ödeme</th>
                    <th className={cn(thSticky, "min-w-[120px] px-3 text-right")}>Toplam</th>
                    <th className={cn(thSticky, groupSep, "w-32 px-2 text-left")}>Fatura no</th>
                    <th className={cn(thSticky, "w-36 px-2 text-right")}>Fatura tutarı</th>
                    <th className={cn(thSticky, "w-8 px-2")} />
                  </tr>
                </thead>
                <tbody className="[&>tr:last-child>td]:border-b-0 [&>tr>td]:border-b [&>tr>td]:border-b-hairline">
                  {active.rows.map((r) => (
                    <tr key={r.id} className="group/row transition-colors duration-150 hover:bg-surface-hover">
                      <td className="sticky left-0 z-[1] border-r border-hairline bg-surface px-3 py-1.5 transition-colors duration-150 group-hover/row:bg-surface-hover">
                        <Link href={`/production/${r.id}`} className="font-medium text-ink transition-colors duration-150 hover:text-brand-strong">
                          {r.title}
                        </Link>
                        {r.product_kind && <span className="ml-2 text-[12px] text-subtle">{r.product_kind}</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-ink">
                        {qtyOf(r) || "—"}
                      </td>
                      <td className="px-2 py-1">
                        <TextInput
                          className={priceInput}
                          aria-label={`${r.title} — birim ödeme`}
                          value={pricing[r.id]?.usta_unit_payment ?? ""}
                          onChange={(e) => setPayment(r.id, e.target.value)}
                          onBlur={() => savePayment(r.id)}
                          placeholder={unitPaymentOf(r.id) ? String(unitPaymentOf(r.id)) : "0"}
                          inputMode="decimal"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-ink">
                        {lineTotal(r) ? formatMoney(lineTotal(r)) : "—"}
                      </td>
                      <td className={cn(groupSep, "px-2 py-1")}>
                        <TextInput
                          className={cn(priceInput, "text-left")}
                          aria-label={`${r.title} — fatura no`}
                          value={pricing[r.id]?.invoice_no ?? ""}
                          onChange={(e) => setInvoiceNo(r.id, e.target.value)}
                          onBlur={() => savePayment(r.id)}
                          placeholder="—"
                          spellCheck={false}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <TextInput
                          className={priceInput}
                          aria-label={`${r.title} — fatura tutarı`}
                          value={pricing[r.id]?.invoice_amount ?? ""}
                          onChange={(e) => setInvoiceAmount(r.id, e.target.value)}
                          onBlur={() => savePayment(r.id)}
                          placeholder="0"
                          inputMode="decimal"
                        />
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
                  <tr className="text-[13px] font-semibold">
                    <td className={cn(tfSticky, "sticky left-0 z-20 border-r border-hairline px-3 text-ink")}>Toplam</td>
                    <td className={cn(tfSticky, "px-2 text-right tabular-nums text-ink")}>{active.qty}</td>
                    <td className={tfSticky} />
                    <td className={cn(tfSticky, "px-3 text-right tabular-nums text-ink")}>{formatMoney(active.total)}</td>
                    <td className={cn(tfSticky, groupSep)} />
                    <td className={cn(tfSticky, "px-2 text-right tabular-nums text-ink")}>
                      {invoiceTotal(active.rows) ? formatMoney(invoiceTotal(active.rows)) : "—"}
                    </td>
                    <td className={tfSticky} />
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

          {/* USTA KARTLARI = TileGrid. Pano'nun kişi kartıyla AYNI kart
              (2026-08-28: "bir tasarımı yaptığın zaman o tasarımı her yerde
              devam ettirmen gerekiyor"). Kartta yalnız ad + toplam ödeme +
              kaç ürün; şehir/teslim süresi/minimum adet ustanın sayfasında,
              başlığın altında durur. */}
          <TileGrid>
            {ustalar.map((u) => {
              const tone = tones[u.key]!;
              const unknown = u.name === UNKNOWN;
              return (
                <Tile
                  key={u.key}
                  onClick={() => setOpenUsta(u.key)}
                  title={u.name}
                  photoUrl={u.rec?.photo_url ?? null}
                  initials={unknown ? undefined : getPersonInitials(u.name)}
                  icon={unknown ? Scissors : undefined}
                  colorHex={tone.hex}
                  metaNode={
                    <>
                      <span className={cn("font-semibold tabular-nums", u.total > 0 ? "text-ink" : "text-subtle")}>
                        {formatMoney(u.total)}
                      </span>
                      <span className="text-subtle"> · {u.rows.length} ürün</span>
                    </>
                  }
                />
              );
            })}
          </TileGrid>
        </section>
      )}
    </div>
  );
}

/**
 * Koleksiyon sekmeleri — Föyler · Maliyet · Ödeme · Ürün verisi.
 *
 * TEK SATIR: solda sekme KUTUSU, sağda o sekmenin aksiyonları. Aksiyonlar
 * eskiden ayrı bir başlık satırındaydı; Product Data'da aksiyon olmadığı için
 * o satır kayboluyor ve sekmeler yukarı zıplıyordu (2026-08-29: "product
 * data'ya girince tasarım yukarı kayıyor"). Artık satır her sekmede aynı
 * yükseklikte: aksiyon yoksa sağ taraf boş kalır, düzen kaymaz.
 *
 * Sekmeler bir KUTU içinde — dört alt başlık bir kontrol gibi okunsun.
 */
export function CollectionTabs({
  active, actions,
}: {
  active: "foy" | "maliyet" | "odeme" | "veri";
  /** Sağa sabitlenen aksiyonlar (sezon seçici, indir, yeni föy…). */
  actions?: React.ReactNode;
}) {
  const TABS: { key: string; href: string; label: string; icon: typeof Wallet }[] = [
    { key: "foy",     href: "/collection",         label: "Production Sheets", icon: ClipboardList },
    { key: "maliyet", href: "/collection/maliyet", label: "Cost",              icon: Wallet },
    { key: "odeme",   href: "/collection/odeme",   label: "Payment Table",     icon: HandCoins },
    { key: "veri",    href: "/collection/veri",    label: "Product Data",      icon: Boxes },
  ];

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      {/* Sekme şeridi dokunmatikte bir kademe iri — telefonda 32px ölçülüyordu. */}
      <div className="inline-flex h-9 max-w-full items-center overflow-x-auto rounded-control border border-line bg-surface-muted p-0.5 no-scrollbar pointer-coarse:h-11">
        {TABS.map((t, i) => {
          const isActive = t.key === active;
          /* AYIRICI: sekmeler bitişikken tek bir uzun düğme gibi okunuyordu
             (2026-08-29: "neden ayırıcı eklemiyorsun, iç içe geçmiş gibi").
             Çizgi yalnız İKİ PASİF sekme arasında çizilir; seçili sekme beyaz
             bir kart olduğu için kendi kenarını zaten belli ediyor. */
          const divider = i > 0 && !isActive && TABS[i - 1].key !== active;
          return (
            <span key={t.key} className="flex h-full items-center">
              {divider && <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-line" />}
              {/* TELEFONDA DA ADI OLAN SEKME. Etiket `sm` altında tamamen
                  gizleniyordu: dört ikon yan yana kalıyor, hangisinin ne
                  olduğu ne gözle ne ekran okuyucuyla anlaşılıyordu. Artık
                  SEÇİLİ sekmenin adı her boyutta yazar ("neredeyim?"),
                  diğerleri ikon kalır ama adını `title` ve ekran okuyucu
                  metniyle taşır. */}
              {isActive ? (
                <span
                  aria-current="page"
                  title={t.label}
                  className="inline-flex h-8 pointer-coarse:h-10 shrink-0 items-center gap-1.5 rounded-md bg-surface px-3 text-[13px] font-semibold text-ink shadow-xs ring-1 ring-line/70"
                >
                  <t.icon size={15} aria-hidden /> <span>{t.label}</span>
                </span>
              ) : (
                <Link
                  href={t.href}
                  title={t.label}
                  aria-label={t.label}
                  className="inline-flex h-8 pointer-coarse:h-10 shrink-0 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-muted transition-colors duration-150 hover:bg-surface hover:text-ink"
                >
                  <t.icon size={15} aria-hidden /> <span className="hidden sm:inline">{t.label}</span>
                </Link>
              )}
            </span>
          );
        })}
      </div>
      {/* Sağ taraf HER SEKMEDE var; boş olsa da satır yüksekliğini sekme
          kutusu belirler, o yüzden düzen kaymaz. */}
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        {actions}
      </div>
    </div>
  );
}
