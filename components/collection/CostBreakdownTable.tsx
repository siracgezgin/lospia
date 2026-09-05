"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Wallet, Check, Loader2, FileSpreadsheet, Info, Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { updateProductionSheetPricing, updateProductionSheetSizeDistribution } from "@/lib/actions/production";
import { TextInput } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { DownloadLink } from "@/components/ui/DownloadLink";
import {
  totalQuantity, formatMoney, COST_ITEM_DEFS, emptyCostItems, unitCostOf,
  MATERIAL_COST_KEY, bomLineCost, parseMoney,
} from "@/lib/collection/cost";
import { CollectionTabs } from "./PaymentTable";
import { SeasonSwitch, type SwitchSeason } from "./SeasonSwitch";
import type { ProductionSheet, ProductionPricing, CostItemKey, MaterialCategory, SizeDistribution } from "@/types";

type Row = Pick<
  ProductionSheet,
  | "id" | "title" | "product_kind" | "product_code" | "photo_refs" | "producer"
  | "category" | "subcategory" | "pricing" | "size_distribution"
>;

/** Satırdaki ürün görseli — Koleksiyon kartlarıyla AYNI öncelik: önce ürünün
 *  kendi fotoğrafı, teknik çizim en son. */
/* Kapak sırası: kullanıcının SEÇTİĞİ kapak her şeyin önünde. Föyde kapak
   yoksa eski davranış sürer (ürün fotoğrafı → teknik çizim). */
const COVER_PRIORITY = ["cover", "general", "embellishments", "accessories", "sewing", "fabric"] as const;
function coverOf(r: Row): string | null {
  const imgs = (Array.isArray(r.photo_refs) ? r.photo_refs : []).filter((i) => i?.url);
  for (const section of COVER_PRIORITY) {
    const hit = imgs.find((i) => i.section === section);
    if (hit) return hit.url;
  }
  return imgs[0]?.url ?? null;
}

/** Maliyet tablosunun ihtiyaç duyduğu sade reçete satırı. */
export type BomLite = {
  consumption: number;
  waste_pct: number;
  material: { id: string; category: MaterialCategory; unit_price: number | null } | null;
};

interface Props {
  rows: Row[];
  /** Sezon bağlamı — Koleksiyon ile aynı seçim. */
  seasons?: SwitchSeason[];
  /** föy id → reçete satırları. Malzeme kalemleri buradan hesaplanır. */
  bomBySheet?: Record<string, BomLite[]>;
}

/** Hücre girdisi — ortak TextInput'un sessiz hâli: dinlenirken çerçevesiz,
 *  hover'da çerçeve belirir, odakta yüzey beyazlanır. Kalem kalem girilen
 *  sekiz sütunda sekiz çerçeve yan yana ızgarayı boğuyordu. */
const cellInput =
  "h-8 border-transparent bg-transparent px-1.5 text-right tabular-nums hover:border-line focus:bg-surface";
/* Dikey çizgi yok; yalnız elle girilen kalemler ile HESAPLANAN sütunlar
   arasında tek ince ayırıcı. */
const groupSep = "border-l border-hairline";
const thSticky = "sticky top-0 z-10 border-b border-line-strong bg-surface py-2.5";
const tfSticky = "sticky bottom-0 z-10 border-t border-line-strong bg-surface-muted px-2 py-2";

/** Türkçe duyarsız arama normalizasyonu — Koleksiyon tarayıcısıyla AYNI kural. */
function norm(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c").replace(/İ/g, "i");
}

/** Sunucuya giden fiyat gövdesi — kaydetme ve "değişti mi?" karşılaştırması
 *  AYNI şekli kullansın diye tek yerde kurulur. */
function pricingPayload(p: ProductionPricing) {
  return {
    unit_price: p.unit_price ?? "",
    purchase_cost: p.purchase_cost ?? "",
    web_sale_price: p.web_sale_price ?? "",
    currency: p.currency ?? "TL",
    notes: p.notes ?? "",
    cost_items: p.cost_items,
    usta_unit_payment: p.usta_unit_payment ?? "",
    /* Fatura alanları Ödeme Tablosu'nda yaşar ama AYNI `pricing` JSON'unda
       durur; sunucu bu alanı bütün olarak değiştirdiği için burada taşınmazsa
       maliyet hücresinden çıkıldığı anda fatura kaydı silinirdi. */
    invoice_no: p.invoice_no ?? "",
    invoice_amount: p.invoice_amount ?? "",
  };
}

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
export function CostBreakdownTable({ rows, seasons = [], bomBySheet = {} }: Props) {
  const [pricing, setPricing] = useState<Record<string, ProductionPricing>>(() => {
    const m: Record<string, ProductionPricing> = {};
    for (const r of rows) {
      const p = { ...(r.pricing ?? {}) };
      if (!p.cost_items?.length) p.cost_items = emptyCostItems();
      m[r.id] = p;
    }
    return m;
  });
  /* ADET yerel durumu — hücre düzenlenebilir olduğu için ekrandaki değer
     kaydedilmiş föyden değil buradan okunur (satır toplamı ve genel toplam
     yazar yazmaz güncellensin). */
  const [sizeDist, setSizeDist] = useState<Record<string, SizeDistribution>>(() => {
    const m: Record<string, SizeDistribution> = {};
    for (const r of rows) m[r.id] = (r.size_distribution ?? { sizes: [], rows: [] }) as SizeDistribution;
    return m;
  });
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  /* Kaydetme hatası insan dilinde tek satır — ham veritabanı mesajı gösterilmez. */
  const [saveError, setSaveError] = useState<string | null>(null);
  const [, startSave] = useTransition();
  /* Son KAYDEDİLEN hâlin parmak izi (satır başına). Blur her hücreden
     çıkışta tetiklendiği için değişmemiş satırı tekrar yazmayı önler.
     Açılışta DİSKTEKİ hâlle tohumlanır: ilk gezinti de yazma açmasın. */
  const [initialSnapshots] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const r of rows) {
      const p = { ...(r.pricing ?? {}) };
      if (!p.cost_items?.length) p.cost_items = emptyCostItems();
      m[`price:${r.id}`] = JSON.stringify(pricingPayload(p));
      m[`qty:${r.id}`] = JSON.stringify((r.size_distribution ?? { sizes: [], rows: [] }) as SizeDistribution);
    }
    return m;
  });
  const savedSnapshots = useRef<Record<string, string>>(initialSnapshots);
  const params = useSearchParams();
  /* Excel indirmesi EKRANDAKİ sezonu izler: ekran süzülüyken tüm sezonları
     indirmek "tablo ile dosya tutmuyor" demekti. */
  const exportHref = (() => {
    const sezon = params.get("sezon");
    return sezon ? `/collection/maliyet/export?sezon=${encodeURIComponent(sezon)}` : "/collection/maliyet/export";
  })();

  /** Föyün reçetesinden gelen kalem tutarları (kalem anahtarına göre).
   *  Satır başına BİR kez hesaplanır: her hücrede yeniden toplamak, sekiz
   *  kalem × yüzlerce satırda gereksiz iş çıkarıyordu. */
  const bomByRow = useMemo(() => {
    const m: Record<string, Partial<Record<CostItemKey, number>>> = {};
    for (const [id, list] of Object.entries(bomBySheet)) {
      const out: Partial<Record<CostItemKey, number>> = {};
      for (const r of list) {
        const key = MATERIAL_COST_KEY[r.material?.category ?? "diger"] ?? "diger";
        // bomLineCost föy ekranıyla AYNI formülü kullansın diye uyumlu biçime sokulur.
        out[key] = (out[key] ?? 0) + bomLineCost({
          consumption: r.consumption, waste_pct: r.waste_pct,
          material: { unit_price: r.material?.unit_price ?? null },
        } as never);
      }
      m[id] = out;
    }
    return m;
  }, [bomBySheet]);
  const EMPTY_BOM: Partial<Record<CostItemKey, number>> = useMemo(() => ({}), []);
  const bomOf = (id: string): Partial<Record<CostItemKey, number>> => bomByRow[id] ?? EMPTY_BOM;

  const amountOf = (id: string, key: CostItemKey) =>
    pricing[id]?.cost_items?.find((i) => i.key === key)?.amount ?? "";

  /* Tutar okuma TEK yerden: lib/collection/cost.ts'teki parseMoney. Burada
     ayrı bir ayrıştırıcı vardı ve Türkçe binlik biçimini ("1.800,50") NaN'a
     çeviriyordu — satır toplamı sessizce sıfırlanıyordu. */
  const unitCost = (id: string) => {
    const bom = bomOf(id);
    const items = pricing[id]?.cost_items;
    if (items?.length) {
      const sum = items.reduce(
        (a, it) => a + (bom[it.key] != null ? bom[it.key]! : parseMoney(it.amount)),
        0,
      );
      if (sum > 0) return sum;
    }
    return unitCostOf(pricing[id]);
  };
  const qtyOf = (r: Row) => totalQuantity(sizeDist[r.id] ?? r.size_distribution);

  /* BİRİM MALİYET türetilmiş mi? Kalem ya da reçete bir tutar veriyorsa evet:
     o durumda elle girilen değer `unitCostOf` tarafından zaten yok sayılır,
     düzenlenebilir göstermek kullanıcıya yalan söylerdi. */
  const derivedUnitCost = (id: string) => {
    const bom = bomOf(id);
    if (Object.values(bom).some((v) => (v ?? 0) > 0)) return true;
    const items = pricing[id]?.cost_items ?? [];
    return items.some((it) => parseMoney(it.amount) > 0);
  };

  /* Üretim adedi föyün beden dağılımındaki ÜRETİM satırında yaşar; hangi satır
     olduğu lib/collection/cost.ts'teki seçimle AYNI kuralla bulunur (etiket
     satırı değil, "üretim adet" varsa o). Satır yoksa oluşturulur. */
  function withQty(sd: SizeDistribution | null | undefined, value: string): SizeDistribution {
    const base: SizeDistribution = sd && Array.isArray(sd.rows)
      ? { ...sd, rows: [...sd.rows] }
      : { sizes: sd?.sizes ?? [], rows: [] };
    const norm = (v: string) =>
      v.toLocaleLowerCase("tr").replace(/[İI]/g, "i").replace(/[^a-z ]/g, "").trim();
    let idx = base.rows.findIndex((r) => norm(r.label ?? "").includes("uretim adet"));
    if (idx === -1) idx = base.rows.findIndex((r) => !norm(r.label ?? "").includes("beden etiket"));
    if (idx === -1) {
      base.rows.push({ label: "Üretim adet", values: [], total: value });
      return base;
    }
    base.rows[idx] = { ...base.rows[idx], total: value };
    return base;
  }

  /** Hücrede GÖRÜNEN değer: üretim satırının kendi `total`ı varsa o (kullanıcı
   *  ne yazdıysa aynen), yoksa değerlerden hesaplanan toplam. */
  function qtyInputValue(r: Row): string {
    const sd = sizeDist[r.id];
    const norm = (v: string) =>
      v.toLocaleLowerCase("tr").replace(/[İI]/g, "i").replace(/[^a-z ]/g, "").trim();
    const list = sd?.rows ?? [];
    const row =
      list.find((x) => norm(x.label ?? "").includes("uretim adet")) ??
      list.find((x) => !norm(x.label ?? "").includes("beden etiket")) ??
      list[0];
    if (row && row.total !== undefined && row.total !== null && String(row.total) !== "") {
      return String(row.total);
    }
    const q = qtyOf(r);
    return q ? String(q) : "";
  }

  function setQty(id: string, value: string) {
    setSizeDist((m) => ({ ...m, [id]: withQty(m[id], value) }));
  }

  function saveQty(id: string) {
    const sd = sizeDist[id];
    if (!sd) return;
    /* Hücreden çıkmak tek başına bir DEĞİŞİKLİK değildir: dokunulmamış
       hücrede de blur tetikleniyor ve her satır gezildiğinde gereksiz bir
       yazma turu atılıyordu. */
    const snapshot = JSON.stringify(sd);
    if (savedSnapshots.current[`qty:${id}`] === snapshot) return;
    setSavingId(id);
    startSave(async () => {
      const res = await updateProductionSheetSizeDistribution(id, sd);
      setSavingId(null);
      if ("error" in res) setSaveError("Adet kaydedilemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.");
      else {
        savedSnapshots.current[`qty:${id}`] = snapshot;
        setSaveError(null);
        flash(id);
      }
    });
  }
  const lineTotal = (r: Row) => qtyOf(r) * unitCost(r.id);

  /* ARAMA — tek kutu: başlık, ürün kodu ya da usta. Süzgeç yığını yok
     (kategori ve sezon zaten sekmenin bağlamı). Uzun listede tek bir ürünün
     maliyetini düzeltmek için sayfayı gözle taramak gerekiyordu. */
  const visibleRows = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return rows;
    return rows.filter((r) =>
      norm([r.title, r.product_code, r.product_kind, r.producer].filter(Boolean).join(" ")).includes(q));
  }, [rows, query]);

  /* Genel toplam EKRANDAKİ satırları anlatır (arama varsa süzülmüş liste) ve
     ADEDE de bağlıdır: `sizeDist` bağımlılığı eksikken adet hücresine yazılan
     sayı satır toplamını değiştiriyor ama alttaki genel toplam eski değerde
     kalıyordu. */
  const grand = useMemo(
    () => visibleRows.reduce((a, r) => a + lineTotal(r), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleRows, pricing, sizeDist, bomBySheet],
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
    const payload = pricingPayload(pricing[id] ?? {});
    // Dokunulmamış hücreden çıkmak yazma turu açmasın (bkz. saveQty).
    const snapshot = JSON.stringify(payload);
    if (savedSnapshots.current[`price:${id}`] === snapshot) return;
    setSavingId(id);
    startSave(async () => {
      const res = await updateProductionSheetPricing(id, payload);
      setSavingId(null);
      if ("error" in res) setSaveError("Maliyet kaydedilemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.");
      else {
        savedSnapshots.current[`price:${id}`] = snapshot;
        setSaveError(null);
        flash(id);
      }
    });
  }

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      {/* Başlık uygulama çubuğunda; aksiyonlar sekme satırının SAĞINDA. */}
      <h1 className="sr-only">Cost</h1>
      <CollectionTabs
        active="maliyet"
        actions={
          <>
            {/* ARAMA — tek kutu, süzgeç yığını yok. */}
            {rows.length > 0 && (
              <div className="relative min-w-[180px] flex-1 sm:max-w-[240px] sm:flex-none">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
                <TextInput
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ürün ara…"
                  aria-label="Maliyet tablosunda ürün ara"
                  className="pl-9"
                />
              </div>
            )}
            <SeasonSwitch seasons={seasons} />
            {rows.length > 0 && (
              /* İNDİRME ONAYI — Koleksiyon'daki "Tümünü indir" ile aynı kapı:
                 maliyet dosyası sistemin dışına çıkıyor. */
              <DownloadLink
                href={exportHref}
                what="Maliyet tablosu"
                title="Maliyet tablosunu Excel olarak indir"
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-control border border-line bg-surface px-3.5 text-[13.5px] font-medium text-ink shadow-xs transition-[background-color,border-color,transform] duration-150 ease-standard hover:border-line-strong hover:bg-surface-muted active:scale-[0.98]"
              >
                <FileSpreadsheet size={15} /> Excel indir
              </DownloadLink>
            )}
          </>
        }
      />

      {/* Kaydetme hatası — tek cümle, ham veritabanı mesajı yok. */}
      {saveError && (
        <p role="alert" className="anim-fade-down mb-3 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[13.5px] font-medium text-danger">
          {saveError}
        </p>
      )}

      <p className="mb-3 flex items-start gap-2 rounded-control border border-line bg-surface-muted px-3 py-2 text-[12.5px] text-muted">
        <Info size={14} className="mt-px shrink-0 text-subtle" />
        <span>
          Bu tablo <b className="font-semibold text-ink">ürün maliyetidir</b>. Ustaya ödenecek tutar
          ayrı bir şeydir ve <Link href="/collection/odeme" className="font-medium text-brand hover:text-brand-strong">Payment Table</Link>’da
          usta bazında toplanır.
        </span>
      </p>

      {rows.length === 0 ? (
        <EmptyState icon={Wallet} className="anim-fade-up" title="Henüz ürün yok." description="Collection’a föy ekleyin; maliyet burada kalem kalem girilir." />
      ) : visibleRows.length === 0 ? (
        <EmptyState
          icon={Search}
          className="anim-fade-up"
          title="Eşleşen ürün yok."
          description="Başka bir ad, ürün kodu ya da usta adı deneyin."
        />
      ) : (
        <div className="anim-fade-up overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[980px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
                  {/* ÜRÜN sütunu yatayda da SABİT: telefonda sekiz maliyet
                      kalemi arasında kaydırırken hangi ürünün satırında
                      olduğunuz görünür kalsın. */}
                  <th className={cn(thSticky, "sticky left-0 z-20 min-w-[168px] border-r border-hairline px-3 text-left sm:min-w-[200px]")}>Ürün</th>
                  {COST_ITEM_DEFS.map((d) => (
                    <th key={d.key} className={cn(thSticky, "w-[92px] px-1.5 text-right")}>
                      {d.label}
                    </th>
                  ))}
                  <th className={cn(thSticky, groupSep, "w-28 px-2 text-right")}>Birim maliyet</th>
                  <th className={cn(thSticky, "w-16 px-2 text-right")}>Adet</th>
                  <th className={cn(thSticky, "min-w-[120px] px-3 text-right")}>Toplam</th>
                  <th className={cn(thSticky, "w-8 px-2")} />
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>td]:border-b-0 [&>tr>td]:border-b [&>tr>td]:border-b-hairline">
                {visibleRows.map((r) => (
                  <tr key={r.id} className="group/row transition-colors duration-150 hover:bg-surface-hover">
                    {/* ÜRÜN — fotoğrafıyla. Maliyet tablosu bir muhasebe
                        çizelgesi gibi duruyordu; hangi ürünün satırında
                        olduğunu ancak adı okuyarak anlıyordunuz. */}
                    <td className="sticky left-0 z-[1] border-r border-hairline bg-surface px-3 py-1.5 transition-colors duration-150 group-hover/row:bg-surface-hover">
                      <Link href={`/production/${r.id}`} className="group/prod flex items-center gap-2.5">
                        {/* Koleksiyon kartıyla aynı oran (3/4) ve kırpma —
                            küçük de olsa aynı ürün, aynı çerçeve. */}
                        <span className="grid h-12 w-9 shrink-0 place-items-center overflow-hidden rounded-[6px] bg-surface-muted">
                          {coverOf(r) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={coverOf(r)!} alt="" loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <Wallet size={14} className="text-subtle" aria-hidden />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink transition-colors duration-150 group-hover/prod:text-brand-strong">
                            {r.title}
                          </span>
                          {(r.product_code || r.producer) && (
                            <span className="block truncate text-[12px] text-subtle">
                              {[r.product_code, r.producer].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </span>
                      </Link>
                    </td>
                    {COST_ITEM_DEFS.map((d) => {
                      const fromBom = bomOf(r.id)[d.key];
                      return (
                        <td key={d.key} className="px-0.5 py-1">
                          {fromBom != null ? (
                            // Reçeteden hesaplanıyor — elle değiştirilemez,
                            // yoksa iki kaynak çakışır.
                            <span
                              className="block px-1.5 py-1 text-right text-[13px] tabular-nums text-brand-strong"
                              title="Reçeteden hesaplanıyor"
                            >
                              {formatMoney(fromBom)}
                            </span>
                          ) : (
                            <TextInput
                              className={cellInput}
                              aria-label={`${r.title} — ${d.label}`}
                              value={amountOf(r.id, d.key)}
                              onChange={(e) => setAmount(r.id, d.key, e.target.value)}
                              onBlur={() => save(r.id)}
                              placeholder="·"
                              inputMode="decimal"
                            />
                          )}
                        </td>
                      );
                    })}
                    {/* BİRİM MALİYET — kalem/reçete belirlemiyorsa ELLE girilir.
                        Sıraç (2026-08-29): "costta Birim maliyet / Adet
                        değişebilir olmalı önceki gibi". Girilen değer föyün
                        `unit_price` alanına yazılır; `unitCostOf` kalem yokken
                        zaten bu alanı birim maliyet olarak okuyor, yani yeni bir
                        veri alanı açılmadı. Kalem ya da reçete bir tutar
                        veriyorsa hücre türetilmiş kalır — iki kaynak çakışırsa
                        elle girilen sessizce yok sayılırdı. */}
                    <td className={cn(groupSep, "px-0.5 py-1")}>
                      {derivedUnitCost(r.id) ? (
                        <span
                          className="block px-1.5 py-1 text-right text-[13px] font-semibold tabular-nums text-ink"
                          title="Kalemlerden hesaplanıyor"
                        >
                          {unitCost(r.id) ? formatMoney(unitCost(r.id)) : "—"}
                        </span>
                      ) : (
                        <TextInput
                          className={cn(cellInput, "font-semibold")}
                          aria-label={`${r.title} — birim maliyet`}
                          value={pricing[r.id]?.unit_price ?? ""}
                          onChange={(e) =>
                            setPricing((m) => ({ ...m, [r.id]: { ...(m[r.id] ?? {}), unit_price: e.target.value } }))
                          }
                          onBlur={() => save(r.id)}
                          placeholder="·"
                          inputMode="decimal"
                        />
                      )}
                    </td>
                    {/* ADET — föyün beden dağılımındaki üretim satırına yazılır. */}
                    <td className="px-0.5 py-1">
                      <TextInput
                        className={cellInput}
                        aria-label={`${r.title} — üretim adedi`}
                        value={qtyInputValue(r)}
                        onChange={(e) => setQty(r.id, e.target.value)}
                        onBlur={() => saveQty(r.id)}
                        placeholder="·"
                        inputMode="numeric"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-ink">
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
                <tr className="text-[13px] font-semibold">
                  {/* Arama açıkken toplam EKRANDAKİ satırları anlatır —
                      "genel toplam" demek yanıltıcı olurdu. */}
                  <td className={cn(tfSticky, "sticky left-0 z-20 border-r border-hairline px-3 text-ink")}>
                    {query.trim() ? "Aramadaki toplam" : "Genel toplam"}
                  </td>
                  <td colSpan={COST_ITEM_DEFS.length + 2} className={tfSticky} />
                  <td className={cn(tfSticky, "px-3 text-right tabular-nums text-ink")}>{formatMoney(grand)}</td>
                  <td className={tfSticky} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <p className="mt-2 px-1 text-[12px] text-subtle">
        Hücreye yazıp başka yere tıklayınca kaydedilir; aynı değerler ürünün üretim föyünde de görünür (tek kaynak).
        <span className="mt-1 block sm:hidden">Tablo yana kaydırılabilir → ürün sütunu sabit kalır.</span>
      </p>
    </div>
  );
}
