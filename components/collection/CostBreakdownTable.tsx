"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Wallet, Check, Loader2, FileSpreadsheet, Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { updateProductionSheetPricing, updateProductionSheetSizeDistribution } from "@/lib/actions/production";
import { TextInput } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { DownloadLink } from "@/components/ui/DownloadLink";
import {
  formatMoney, COST_ITEM_DEFS, mergeCostItems, unitCostOf, amountForQty,
  MATERIAL_COST_KEY, bomLineCost, parseMoney, productionRowIndex, productionQtyOf,
} from "@/lib/collection/cost";
import { CollectionTabs, cellInput, secondaryBtnCls } from "./PaymentTable";
import { SeasonSwitch, type SwitchSeason } from "./SeasonSwitch";
import type {
  ProductionSheet, ProductionPricing, CostItemKey, MaterialCategory, SizeDistribution,
  SheetMaterialWithMaterial,
} from "@/types";

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

/* Dikey çizgi yok; yalnız elle girilen kalemler ile HESAPLANAN sütunlar
   arasında tek ince ayırıcı. */
const groupSep = "border-l border-hairline";
const thSticky = "sticky top-0 z-10 border-b border-line-strong bg-surface py-2.5 align-bottom";
const tfSticky = "sticky bottom-0 z-10 border-t border-line-strong bg-surface-muted px-2 py-2";

/* TABLO EKRAN SONUNA KADAR ESNEMEZ. `w-full` geniş monitörde on beş sütunu
   boydan boya geriyor ve sayı sütunları birbirinden kopuyordu; genişlik artık
   sütunların kendi ölçüsü kadar (proje kuralı: sabit + kolon sayısı × kolon
   genişliği). Dar ekranda alt sınır korunur, tablo yana kaydırılır. */
const ITEM_COL = 104;
const TABLE_MAX_WIDTH = 240 + COST_ITEM_DEFS.length * ITEM_COL + 128 + 88 + 140 + 44;

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
    /* ÜRETİM ADEDİ TAŞINIR. Sunucu `pricing` JSON'unu bütün olarak değiştirdiği
       için burada yazılmayan alan SİLİNİR: föyde seçilmiş "toplam üretim adedi"
       bir maliyet hücresinden çıkıldığı anda kayboluyordu — kalıp ve numune
       payı da onunla birlikte bozuluyordu (fatura alanlarında aynı tuzak). */
    production_qty: p.production_qty ?? "",
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
    /* ADET KADEMELERİ de taşınır. Aynı tuzak: föyde elle açılan kademeler
       (50 / 100 / 250) burada yazılmadığı için, Maliyet ya da Ödeme
       tablosunda HERHANGİ bir hücreye girip çıkmak diskteki diziyi siliyordu.
       Şemada `optional` olduğu için doğrulama da uyarmıyordu; parmak izi bu
       eksik şekilden üretildiği için karşılaştırma da "değişti" demiyordu —
       kayıp hiçbir yerde görünmüyordu. */
    qty_tiers: p.qty_tiers,
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
  /* Kalemler FÖYDEKİ ile aynı listeye getirilir (mergeCostItems): sonradan
     tanımlanmış bir kalem eski föyde de sütununu bulsun, listeden çıkmış ama
     DOLU kalem kaybolmasın. Föy ekranı da aynı birleştirmeyi yapıyor; tablo
     ham diziyi çizdiği için iki ekran farklı kalem seti gösterebiliyordu. */
  const [pricing, setPricing] = useState<Record<string, ProductionPricing>>(() => {
    const m: Record<string, ProductionPricing> = {};
    for (const r of rows) m[r.id] = { ...(r.pricing ?? {}), cost_items: mergeCostItems(r.pricing?.cost_items) };
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
      const p = { ...(r.pricing ?? {}), cost_items: mergeCostItems(r.pricing?.cost_items) };
      m[`price:${r.id}`] = JSON.stringify(pricingPayload(p));
      m[`qty:${r.id}`] = JSON.stringify((r.size_distribution ?? { sizes: [], rows: [] }) as SizeDistribution);
    }
    return m;
  });
  const savedSnapshots = useRef<Record<string, string>>(initialSnapshots);
  /* UÇMAKTA OLAN YAZMALAR. "Excel indir" dosyayı sunucuda VERİTABANINDAN
     üretiyor; hücreden yeni çıkılmışsa (blur ile açılan tur) o tutar henüz
     diskte olmayabilir ve dosyaya eski değer girerdi. Zincir "bekleyen ne varsa
     bitsin"i tek `await`e indirir; turlar birbirini beklemez, yalnız topluca
     beklenir. Zincir asla reddetmez — hata mesajını zaten çağıran gösteriyor. */
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  function trackWrite<T>(p: Promise<T>) {
    writes.current = writes.current.then(() => p).catch(() => undefined);
    return p;
  }
  const params = useSearchParams();
  /* Excel indirmesi EKRANDAKİ sezonu izler: ekran süzülüyken tüm sezonları
     indirmek "tablo ile dosya tutmuyor" demekti. */
  const exportHref = (() => {
    const sezon = params.get("sezon");
    return sezon ? `/collection/maliyet/export?sezon=${encodeURIComponent(sezon)}` : "/collection/maliyet/export";
  })();
  /* GERİ DÖNÜŞ ADRESİ — föye giderken taşınır (Koleksiyon kartlarıyla aynı
     desen). Yoksa föydeki geri bağlantısı "Collection" diyor ve maliyet
     tablosundan bir ürüne bakan kişi listeye değil katalog ızgarasına
     düşüyordu; sezon seçimi de kayboluyordu. */
  const backTo = `/collection/maliyet${params.toString() ? `?${params.toString()}` : ""}`;

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

  const itemOf = (id: string, key: CostItemKey) => pricing[id]?.cost_items?.find((i) => i.key === key);
  const amountOf = (id: string, key: CostItemKey) => itemOf(id, key)?.amount ?? "";
  /** Föydeki serbest satırlar ("Diğer") birden çok olabilir. */
  const freeRowsOf = (id: string) => (pricing[id]?.cost_items ?? []).filter((i) => i.key === "diger");
  /** Satırın para birimi — föy USD ile çalışıyorsa ekranda ₺ yazmasın. */
  const currencyOf = (id: string) => (pricing[id]?.currency || "TL").trim() || "TL";

  /* BİRİM MALİYET FÖYLE AYNI FORMÜLDEN. Burada kalemler düpedüz toplanıyordu:
     kademeli fiyat (150 adette başka rakam) okunmuyor, KALIP ve NUMUNE ise
     toplam tutarıyla ekleniyordu — Aslı Hanım'ın "4500 TL kalıp 50 adete
     bölünecek" kuralı yalnız föyde işliyor, maliyet tablosu aynı ürün için
     bambaşka bir birim maliyet gösteriyordu. Hesap artık tek yerde
     (lib/collection/cost.ts → unitCostOf), reçete ve adet de onunla birlikte. */
  const bomRowsOf = (id: string) =>
    bomBySheet[id] as unknown as SheetMaterialWithMaterial[] | undefined;
  const unitCost = (id: string, qty: number) => unitCostOf(pricing[id], bomRowsOf(id), qty);
  /* Maliyetin paydası föydeki ile AYNI: elle seçilmiş üretim adedi varsa o,
     yoksa beden dağılımının toplamı. */
  const qtyOf = (r: Row) => productionQtyOf(pricing[r.id], sizeDist[r.id] ?? r.size_distribution);

  /* BİRİM MALİYET türetilmiş mi? Kalem ya da reçete bir tutar veriyorsa evet:
     o durumda elle girilen değer `unitCostOf` tarafından zaten yok sayılır,
     düzenlenebilir göstermek kullanıcıya yalan söylerdi. Kademeli fiyatta
     temel tutar boş olabilir; bakılan adedin tutarı okunur. */
  const derivedUnitCost = (id: string, qty: number) => {
    const bom = bomOf(id);
    if (Object.values(bom).some((v) => (v ?? 0) > 0)) return true;
    const items = pricing[id]?.cost_items ?? [];
    return items.some((it) => parseMoney(amountForQty(it, qty)) > 0);
  };

  /* Üretim adedi föyün beden dağılımındaki ÜRETİM satırında yaşar; hangi satır
     olduğu lib/collection/cost.ts'teki seçimle AYNI kuralla bulunur (etiket
     satırı değil, "üretim adet" varsa o). Satır yoksa oluşturulur. */
  function withQty(sd: SizeDistribution | null | undefined, value: string): SizeDistribution {
    const base: SizeDistribution = sd && Array.isArray(sd.rows)
      ? { ...sd, rows: [...sd.rows] }
      : { sizes: sd?.sizes ?? [], rows: [] };
    const idx = productionRowIndex(base);
    if (idx === -1) {
      base.rows.push({ label: "Üretim adeti", values: [], total: value });
      return base;
    }
    base.rows[idx] = { ...base.rows[idx], total: value };
    return base;
  }

  /* ADET HÜCRESİ YÜRÜRLÜKTEKİ SAYIYI DÜZENLER. Föyde "toplam üretim adedi"
     seçilmişse maliyetin paydası odur; hücre her koşulda beden dağılımına
     yazdığı için o föylerde yazılan sayı ne birim maliyeti ne toplamı
     değiştiriyordu — alan kaydediyor ama hiçbir şey olmuyor gibi görünüyordu.
     Seçim yoksa eskisi gibi beden dağılımının üretim satırına yazılır. */
  const chosenQtyOf = (id: string) => (pricing[id]?.production_qty ?? "").trim();

  /** Hücrede GÖRÜNEN değer: föyde seçilmiş üretim adedi varsa o; yoksa üretim
   *  satırının kendi `total`ı (kullanıcı ne yazdıysa aynen), o da yoksa
   *  değerlerden hesaplanan toplam. */
  function qtyInputValue(r: Row): string {
    const chosen = chosenQtyOf(r.id);
    if (chosen) return chosen;
    const sd = sizeDist[r.id];
    const idx = productionRowIndex(sd);
    const row = idx === -1 ? undefined : sd?.rows?.[idx];
    if (row && row.total !== undefined && row.total !== null && String(row.total) !== "") {
      return String(row.total);
    }
    const q = qtyOf(r);
    return q ? String(q) : "";
  }

  function setQty(id: string, value: string) {
    if (chosenQtyOf(id)) {
      setPricing((m) => ({ ...m, [id]: { ...(m[id] ?? {}), production_qty: value } }));
      return;
    }
    setSizeDist((m) => ({ ...m, [id]: withQty(m[id], value) }));
  }

  /* Hücreden çıkışta İKİ kaynak da yazılır; değişmeyen taraf anlık görüntü
     karşılaştırmasında kendiliğinden elenir. Tek tarafı yazmak, seçili adedi
     silip beden dağılımına geçen düzenlemede eski seçimi diskte bırakıyordu. */
  function saveQty(id: string) {
    save(id);
    saveSizeDist(id);
  }

  function saveSizeDist(id: string) {
    const sd = sizeDist[id];
    if (!sd) return;
    /* Hücreden çıkmak tek başına bir DEĞİŞİKLİK değildir: dokunulmamış
       hücrede de blur tetikleniyor ve her satır gezildiğinde gereksiz bir
       yazma turu atılıyordu. */
    const snapshot = JSON.stringify(sd);
    if (savedSnapshots.current[`qty:${id}`] === snapshot) return;
    setSavingId(id);
    startSave(async () => {
      const res = await trackWrite(updateProductionSheetSizeDistribution(id, sd));
      setSavingId(null);
      if ("error" in res) setSaveError("Adet kaydedilemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.");
      else {
        savedSnapshots.current[`qty:${id}`] = snapshot;
        setSaveError(null);
        flash(id);
      }
    });
  }
  const lineTotal = (r: Row) => {
    const q = qtyOf(r);
    return q * unitCost(r.id, q);
  };

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
  /* Adet toplamı da EKRANDAKİNİ anlatır: "Toplam" sütununun neyle çarpıldığı
     dip satırında da okunsun (Ödeme Tablosu'nun dip satırıyla aynı düzen). */
  const footer = useMemo(
    () => {
      const cur = new Set(visibleRows.map((r) => currencyOf(r.id)));
      return {
        qty: visibleRows.reduce((a, r) => a + qtyOf(r), 0),
        total: visibleRows.reduce((a, r) => a + lineTotal(r), 0),
        /* Para birimi yalnız hepsi aynıysa yazılır; karışık listede tek bir
           sembol toplamı yanlış etiketlerdi. */
        currency: cur.size === 1 ? [...cur][0]! : "TL",
      };
    },
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
      const items = cur.cost_items?.length ? [...cur.cost_items] : mergeCostItems(null);
      const idx = items.findIndex((i) => i.key === key);
      if (idx === -1) items.push({ key, amount: value });
      else items[idx] = { ...items[idx], amount: value };
      return { ...p, [id]: { ...cur, cost_items: items } };
    });
  }

  function save(id: string) {
    /* DURUMDA KARŞILIĞI OLMAYAN SATIRA YAZMA.
       `pricing` yalnız ilk mount'ta prop'tan tohumlanıyor. Sezon değiştirmek
       (SeasonSwitch → router.push(?sezon=…)) aynı rotada yalnız searchParams'ı
       değiştirdiği için React bileşeni yeniden MONTE ETMİYOR: sunucu yeni
       sezonun satırlarını gönderiyor, durum eskisinde kalıyor ve yeni föyler
       için `pricing[id]` undefined oluyor. Bu hâldeyken `pricingPayload({})`
       tamamen BOŞ bir gövde kurar; sunucu `pricing` JSON'unu bütün olarak
       değiştirdiği için o föyün kumaş/dikim/kalıp tutarları, üretim adedi ve
       fatura bilgisi tek bir hücreye girip çıkmakla silinirdi.
       (Beden tarafı bu kapıyı zaten alıyordu — bkz. saveSizeDist.)
       Kök neden ayrıca sayfada `key` ile kapatıldı: sezon değişince bileşen
       yeniden monte olur ve durum tazelenir. Bu kapı ikinci emniyet. */
    const cur = pricing[id];
    if (!cur) return;
    const payload = pricingPayload(cur);
    // Dokunulmamış hücreden çıkmak yazma turu açmasın (bkz. saveQty).
    const snapshot = JSON.stringify(payload);
    if (savedSnapshots.current[`price:${id}`] === snapshot) return;
    setSavingId(id);
    startSave(async () => {
      const res = await trackWrite(updateProductionSheetPricing(id, payload));
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
                beforeDownload={() => writes.current}
                what="Maliyet tablosu"
                title="Maliyet tablosunu Excel olarak indir"
                className={secondaryBtnCls}
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

      {/* "Bu tablo ürün maliyetidir, ödeme ayrı ekrandadır" açıklaması
          KALDIRILDI: hemen üstteki sekme şeridinde Cost ile Payment Table yan
          yana duruyor, satır aynı şeyi ikinci kez söylüyordu. */}

      {rows.length === 0 ? (
        <EmptyState icon={Wallet} className="anim-fade-up" title="Henüz ürün yok." description="Collection’a föy ekleyin; maliyet burada girilir." />
      ) : visibleRows.length === 0 ? (
        <EmptyState
          icon={Search}
          className="anim-fade-up"
          title="Eşleşen ürün yok."
          description="Başka bir ad, ürün kodu ya da usta adı deneyin."
        />
      ) : (
        <div
          className="anim-fade-up overflow-hidden rounded-card border border-line bg-surface shadow-card"
          style={{ maxWidth: TABLE_MAX_WIDTH }}
        >
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[1040px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
                  {/* ÜRÜN sütunu yatayda da SABİT: telefonda sekiz maliyet
                      kalemi arasında kaydırırken hangi ürünün satırında
                      olduğunuz görünür kalsın. */}
                  <th className={cn(thSticky, "sticky left-0 z-20 min-w-[200px] border-r border-hairline px-3 text-left sm:min-w-[240px]")}>Ürün</th>
                  {COST_ITEM_DEFS.map((d) => (
                    /* Kalemin kuralı (ütü/paket dikime dahil, kalıp adede
                       bölünür…) başlığın `title`ında: ekranda satır kaplamadan
                       tam da bakılan yerde okunur. */
                    <th
                      key={d.key}
                      title={d.hint ?? undefined}
                      className={cn(thSticky, "px-1.5 text-right leading-tight")}
                      style={{ width: ITEM_COL }}
                    >
                      {d.label}
                    </th>
                  ))}
                  <th className={cn(thSticky, groupSep, "w-32 px-2 text-right leading-tight")}>Birim maliyet</th>
                  <th className={cn(thSticky, "w-[88px] px-2 text-right")}>Adet</th>
                  <th className={cn(thSticky, "w-[140px] px-3 text-right")}>Toplam</th>
                  <th className={cn(thSticky, "w-11 px-2")} />
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>td]:border-b-0 [&>tr>td]:border-b [&>tr>td]:border-b-hairline">
                {visibleRows.map((r) => {
                  /* Satırın adedi ve birim maliyeti BİR kez hesaplanır: hücre
                     hücre çağırmak aynı toplamı sekiz kez kurduruyordu. */
                  const qty = qtyOf(r);
                  const unit = unitCost(r.id, qty);
                  const cur = currencyOf(r.id);
                  const freeRows = freeRowsOf(r.id);
                  return (
                  <tr key={r.id} className="group/row transition-colors duration-150 hover:bg-surface-hover">
                    {/* ÜRÜN — fotoğrafıyla. Maliyet tablosu bir muhasebe
                        çizelgesi gibi duruyordu; hangi ürünün satırında
                        olduğunu ancak adı okuyarak anlıyordunuz. */}
                    <td className="sticky left-0 z-[1] border-r border-hairline bg-surface px-3 py-1.5 transition-colors duration-150 group-hover/row:bg-surface-hover">
                      <Link
                        href={`/production/${r.id}?from=${encodeURIComponent(backTo)}`}
                        className="group/prod flex items-center gap-2.5"
                      >
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
                      /* SERBEST SATIRLAR TEK HÜCREYE SIĞMAZ. Föyde "Diğer"
                         birden çok satır olabilir (agraf montajı, tığ dikişi…);
                         hücre yalnız İLKİNİ gösterip düzenliyor, birim maliyet
                         ise hepsini topluyordu — sütun kendi toplamını
                         açıklamıyordu. Birden fazlaysa hücre okunur kalır,
                         düzenleme föyde yapılır. */
                      const multiFree = d.key === "diger" && freeRows.length > 1;
                      const freeSum = multiFree
                        ? freeRows.reduce((a, it) => a + parseMoney(amountForQty(it, qty)), 0)
                        : 0;
                      /* KADEMELİ FİYAT TEK KUTUYA SIĞMAZ. Föyde bir kalemin
                         adede göre ayrı fiyatı olabilir (50'de başka, 150'de
                         başka). Hücre TEMEL tutarı gösterip düzenliyordu: kutu
                         boş görünüyor ama birim maliyette kademenin rakamı
                         vardı; üstüne yazınca da hiçbir şey değişmiyordu,
                         çünkü kademe temel tutarı eziyor. Artık yürürlükteki
                         tutar okunur biçimde yazar, düzenleme föyde yapılır. */
                      const item = itemOf(r.id, d.key);
                      const tiered =
                        !multiFree
                        && !!item?.tiers
                        && Object.values(item.tiers).some((v) => (v ?? "").trim() !== "");
                      return (
                        <td key={d.key} className="px-0.5 py-1">
                          {fromBom != null ? (
                            // Reçeteden hesaplanıyor — elle değiştirilemez,
                            // yoksa iki kaynak çakışır.
                            <span
                              className="block px-1.5 py-1 text-right text-[13px] tabular-nums text-brand-strong"
                              title="Reçeteden hesaplanıyor"
                            >
                              {formatMoney(fromBom, cur)}
                            </span>
                          ) : multiFree ? (
                            <span
                              className="block px-1.5 py-1 text-right text-[13px] tabular-nums text-ink"
                              title={`Föyde ${freeRows.length} serbest satır var — toplamı`}
                            >
                              {formatMoney(freeSum, cur)}
                            </span>
                          ) : tiered ? (
                            <span
                              className="block px-1.5 py-1 text-right text-[13px] tabular-nums text-ink"
                              title={`Adede göre değişen fiyat — ${qty || 0} adet için geçerli tutar, föyde düzenlenir`}
                            >
                              {formatMoney(parseMoney(amountForQty(item!, qty)), cur)}
                            </span>
                          ) : (
                            <TextInput
                              className={cellInput}
                              aria-label={`${r.title} — ${d.label}`}
                              value={amountOf(r.id, d.key)}
                              onChange={(e) => setAmount(r.id, d.key, e.target.value)}
                              onBlur={() => save(r.id)}
                              /* Bölünen kalemlerde TOPLAM tutar girilir; bunu
                                 yazacak yerde söylemek, ekrana açıklama satırı
                                 eklemeden anlatmanın tek yolu. */
                              placeholder={d.dividedByQty ? "toplam" : "·"}
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
                      {derivedUnitCost(r.id, qty) ? (
                        <span
                          className="block px-1.5 py-1 text-right text-[13px] font-semibold tabular-nums text-ink"
                          title="Kalemlerden hesaplanıyor"
                        >
                          {unit ? formatMoney(unit, cur) : "—"}
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
                      {qty * unit ? formatMoney(qty * unit, cur) : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {savingId === r.id ? (
                        <Loader2 size={13} className="mx-auto animate-spin text-subtle" />
                      ) : savedId === r.id ? (
                        <Check size={13} className="mx-auto text-success" />
                      ) : null}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="text-[13px] font-semibold">
                  {/* Arama açıkken toplam EKRANDAKİ satırları anlatır —
                      "genel toplam" demek yanıltıcı olurdu. */}
                  <td className={cn(tfSticky, "sticky left-0 z-20 border-r border-hairline px-3 text-ink")}>
                    {query.trim() ? "Aramadaki toplam" : "Genel toplam"}
                  </td>
                  {/* Kalem/hesap ayıracı dip satırında da sürer: tek bir
                      colSpan hücresi çizgiyi tablonun sonunda kesiyordu. */}
                  <td colSpan={COST_ITEM_DEFS.length} className={tfSticky} />
                  <td className={cn(tfSticky, groupSep)} />
                  <td className={cn(tfSticky, "px-2 text-right tabular-nums text-ink")}>{footer.qty || ""}</td>
                  <td className={cn(tfSticky, "px-3 text-right tabular-nums text-ink")}>
                    {formatMoney(footer.total, footer.currency)}
                  </td>
                  <td className={tfSticky} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Tek satır kalır: ne zaman kaydedildiği ve verinin nerede yaşadığı.
          "Tablo yana kaydırılabilir" satırı gitti — kaydırmayı kaydırarak
          öğrenen bir kullanıcıya tarif etmek gereksizdi. */}
      <p className="mt-2 px-1 text-[12px] text-subtle">
        Hücreye yazıp başka yere tıklayınca kaydedilir — aynı değerler ürünün üretim föyünde de görünür.
      </p>
    </div>
  );
}
