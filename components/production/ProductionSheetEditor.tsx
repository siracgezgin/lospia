"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import {
  ClipboardList, Plus, Trash2, Save, User, Clock, FileDown, Printer, AlertTriangle, CheckCircle2, Ruler, Wallet, Layers,
} from "lucide-react";
import {
  createProductionSheet, updateProductionSheet, updateProductionSheetImages,
  deleteProductionSheet,
  type ProductionSheetInput,
} from "@/lib/actions/production";
import { cn } from "@/lib/utils/cn";
import { useConfirm } from "@/components/ui/useConfirm";
import { DownloadLink } from "@/components/ui/DownloadLink";
import { Button, IconButton } from "@/components/ui/Button";
import { TextInput, TextArea as UiTextArea, SelectInput } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { SendToManufacturer } from "./SendToManufacturer";
import { BackLink } from "@/components/modules/BackLink";
import { ImageUploader } from "./ImageUploader";
import { SheetReadiness } from "./SheetReadiness";
import { SheetBom, type PickableMaterial } from "./SheetBom";
import { SheetVariants, type SiblingSheet } from "./SheetVariants";
import { checkSheet } from "@/lib/production/completeness";
import { COLLECTION_TAXONOMY, type CategoryNode } from "@/lib/collection/taxonomy";
import { subsOf } from "@/lib/collection/category-tree";
import { flattenSubs } from "@/lib/collection/taxonomy";
import {
  totalQuantity, parseMoney, formatMoney, STANDARD_SIZES, normalizeToStandardSizes,
  DEFAULT_SIZE_GROUPS, emptyCostItems, costItemLabel, bomCostByKey,
} from "@/lib/collection/cost";
import type {
  ProductionSheet, MeasurementRow, DeliveredItemRow, SizeDistribution, ProductionCategory,
  CostItem, Manufacturer, SheetMaterialWithMaterial,
} from "@/types";

/** Föydeki "Üretici" seçicisini besleyen sade usta kaydı. */
export type SheetManufacturer = Pick<
  Manufacturer, "id" | "name" | "is_active" | "lead_time_days" | "min_order_qty" | "currency" | "city"
> & {
  /** Föyü maille göndermek için (2026-08-28). Yoksa gönderirken elle yazılır. */
  email?: string | null;
};

interface Props {
  sheet: ProductionSheet | null;
  /** Yeni föy açılırken ön-dolu kategori — Koleksiyon'da hangi kategorinin
   *  içindeysen o (2026-08-29). Föy bir kategorinin ALTINDA doğar. */
  initialCategory?: string | null;
  initialSubcategory?: string | null;
  memberNames: Record<string, string>;
  /** Usta listesi. Boşsa alan serbest metne düşer (tablo migrate edilmemiş). */
  manufacturers?: SheetManufacturer[];
  /** Sezon listesi. Boşsa alan serbest metne düşer. */
  seasons?: { id: string; name: string; is_current: boolean }[];
  /** Hammadde kütüphanesi — reçeteye eklenebilecekler. */
  materials?: PickableMaterial[];
  /** Bu föyün reçetesi (BOM). Maliyetin malzeme kalemleri bundan hesaplanır. */
  bom?: SheetMaterialWithMaterial[];
  /** Aynı modelin diğer renkleri. */
  siblings?: SiblingSheet[];
  isAdmin: boolean;
  currentUserId: string;
  /** Düzenlenebilir kategori ağacı (workspace_product_categories). Verilmezse
   *  kod varsayılanları — Koleksiyon ile AYNI liste görünsün diye geçilir. */
  categories?: CategoryNode[];
}

/**
 * Föy sekmeleri.
 *
 * Aslı Hanım (2026-08-19): "Bu resmen çok yoruyor. Hangi bir noktaya bakacağımı
 * şaşırıyorum… 50 tane işi bir anda görmek işine gelmiyor. Biraz daha
 * basitleştirmemiz gerekiyor."
 *
 * Zedonk (rakip PLM) aynı sorunu sekmeyle çözüyor: ürünün her yönü tek sayfada
 * ama ayrı sekmelerde. ÇIKTI DEĞİŞMEZ — Excel hâlâ tek sayfadır ("çıktı
 * aldığımda tek sayfa görüp kalıbın üstüne yapıştıracağım"); sekmeler yalnız
 * düzenleme ekranıdır.
 */
type SheetTabId = "urun" | "olcu" | "maliyet" | "malzeme";

const SHEET_TABS: { id: SheetTabId; label: string; icon: typeof ClipboardList }[] = [
  { id: "urun",    label: "Ürün",             icon: ClipboardList },
  { id: "olcu",    label: "Ölçü & Beden",     icon: Ruler },
  { id: "maliyet", label: "Maliyet",          icon: Wallet },
  { id: "malzeme", label: "Malzeme & Talimat", icon: Layers },
];

/** Hangi zorunlu alan hangi sekmede — sekme rozetleri buradan sayılır. */
const CHECK_TAB: Record<string, SheetTabId> = {
  title: "urun", category: "urun", subcategory: "urun", description: "urun",
  producer: "urun", delivery_date: "urun", sewing_delivery_date: "urun", drawing: "urun",
  sizes: "olcu", measurements: "olcu",
};

// Beden kolonları artık her föyde sabit standart set (bkz. STANDARD_SIZES).

function emptyState(): ProductionSheetInput {
  return {
    title: "",
    status: "active",
    product_code: "",
    product_kind: "",
    producer: "",
    manufacturer_id: null,
    colorway: "",
    description: "",
    season: "",
    season_id: null,
    production_date: "",
    delivery_date: "",
    sewing_delivery_date: "",
    meterage: "",
    // Aslı Hanım (2026-08-19): "Şimdi ölçüler daha uzun oluyor. Oraya bir 10
    // tane falan ekle." 4 → 14 satır.
    measurements: Array.from({ length: 14 }, (_, i) => ({ no: String(i + 1), label: "", value: "" })),
    delivered_items: Array.from({ length: 3 }, (_, i) => ({ no: String(i + 1), label: "", qty: "" })),
    size_distribution: {
      sizes: [...STANDARD_SIZES],
      rows: [
        { label: "Üretim adeti", values: STANDARD_SIZES.map(() => ""), total: "" },
      ],
      groups: { ...DEFAULT_SIZE_GROUPS },
    },
    photo_refs: [],
    wash_instruction: "",
    fabric_lining: "",
    fabric_info: "",
    accessories_info: "",
    embellishments: "",
    sewing_instruction: "",
    workmanship_notes: "",
    qc_revision: "",
    revision_notes: "",
    production_waste: "",
    category: null,
    subcategory: "",
    pricing: {
      unit_price: "", purchase_cost: "", web_sale_price: "", currency: "TL", notes: "",
      cost_items: emptyCostItems(), usta_unit_payment: "",
    },
  };
}

function fromSheet(s: ProductionSheet): ProductionSheetInput {
  // Mevcut föyleri de sabit standart beden setine getir (değerler ada göre eşlenir).
  const sd: SizeDistribution = normalizeToStandardSizes(s.size_distribution);
  if (!sd.rows.length) sd.rows = [{ label: "Üretim adeti", values: sd.sizes.map(() => ""), total: "" }];
  // Grup satırı henüz yoksa Aslı Hanım'ın verdiği eşlemeyle açılır (düzenlenebilir).
  if (!sd.groups || Object.keys(sd.groups).length === 0) sd.groups = { ...DEFAULT_SIZE_GROUPS };
  return {
    title: s.title ?? "",
    status: s.status,
    product_code: s.product_code ?? "",
    product_kind: s.product_kind ?? "",
    producer: s.producer ?? "",
    manufacturer_id: s.manufacturer_id ?? null,
    colorway: s.colorway ?? "",
    description: s.description ?? "",
    season: s.season ?? "",
    season_id: s.season_id ?? null,
    production_date: s.production_date ?? "",
    delivery_date: s.delivery_date ?? "",
    sewing_delivery_date: s.sewing_delivery_date ?? "",
    meterage: s.meterage ?? "",
    measurements: s.measurements?.length ? s.measurements : [{ no: "1", label: "", value: "" }],
    delivered_items: s.delivered_items?.length ? s.delivered_items : [{ no: "1", label: "", qty: "" }],
    size_distribution: sd,
    photo_refs: s.photo_refs ?? [],
    wash_instruction: s.wash_instruction ?? "",
    fabric_lining: s.fabric_lining ?? "",
    fabric_info: s.fabric_info ?? "",
    accessories_info: s.accessories_info ?? "",
    embellishments: s.embellishments ?? "",
    sewing_instruction: s.sewing_instruction ?? "",
    workmanship_notes: s.workmanship_notes ?? "",
    qc_revision: s.qc_revision ?? "",
    revision_notes: s.revision_notes ?? "",
    production_waste: s.production_waste ?? "",
    category: s.category ?? null,
    subcategory: s.subcategory ?? "",
    pricing: {
      unit_price: s.pricing?.unit_price ?? "",
      purchase_cost: s.pricing?.purchase_cost ?? "",
      web_sale_price: s.pricing?.web_sale_price ?? "",
      currency: s.pricing?.currency ?? "TL",
      notes: s.pricing?.notes ?? "",
      // Kalem seti yoksa boş iskeletle açılır; eski tek "birim fiyat" rakamı
      // ustaya ödeme kabul edilir (bkz. ustaUnitPaymentOf) — veri kaybolmaz.
      cost_items: s.pricing?.cost_items?.length ? s.pricing.cost_items : emptyCostItems(),
      usta_unit_payment: s.pricing?.usta_unit_payment ?? "",
    },
  };
}

// ── Field primitives ─────────────────────────────────────────────────────────
/* Girdiler ortak TextInput / SelectInput / TextArea'dır (components/ui/Field):
   aynı boy, aynı çerçeve, aynı odak halkası. Föy eskiden kendi inputCls'ini
   taşıyordu ve uygulamanın geri kalanından bir tık farklı duruyordu. */

/** DownloadLink kendi <button>'ını çizer; Button'ın `secondary` görünümü
 *  sınıf olarak buraya taşınır ki üst çubuktaki düğmeler aynı boyda dursun. */
const secondaryBtnCls =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-control border border-line bg-surface px-3.5 text-[13.5px] font-medium text-ink shadow-xs " +
  "transition-[background-color,border-color,transform] duration-150 ease-standard hover:border-line-strong hover:bg-surface-muted active:scale-[0.98]";

/** Bölüm eyebrow'u ve alan etiketi — föy boyunca TEK etiket dili. */
const LABEL_CLS = "text-[12px] font-semibold uppercase tracking-[0.06em]";

/** Izgara hücresi girdisi (ölçü, beden, teslim, kalem): çerçevesiz, hücreyi
 *  doldurur; odakta içeri halka. Ortak TextInput'un üstüne yazılır ki metin
 *  boyu, renk ve devre dışı hâli yine ortak kalsın. */
const CELL_CLS =
  "h-8 rounded-none border-0 bg-transparent px-2 shadow-none " +
  "hover:border-0 focus:border-0 focus:bg-surface focus:ring-2 focus:ring-inset focus:ring-brand-ring";
function CellInput({ className, ...props }: React.ComponentProps<typeof TextInput>) {
  return <TextInput {...props} className={cn(CELL_CLS, className)} />;
}

/** Satır silme — küçük, sessiz, parmakta 40px hedef. */
function RowDelete({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <IconButton size="sm" onClick={onClick} aria-label={label} title="Satırı sil" className="text-subtle hover:bg-danger/10 hover:text-danger">
      <Trash2 size={13} aria-hidden />
    </IconButton>
  );
}

/** Izgara başlık hücresi — Excel çizgili ızgara (Aslı Hanım: "çizgi çizgi
 *  kare kare"), 12px eyebrow. */
const TH_CLS = cn("border border-line-strong px-2 py-1.5 text-subtle", LABEL_CLS);

/** Etiket telefonda ÜSTTE (160px sabit sütun 390px'te girdiye yer bırakmıyordu),
 *  sm ve üstünde solda — Excel föyünün hizalı görünümü korunur. */
/**
 * Alan satiri — etiket + girdi.
 *
 * Etiket sola YALNIZ kendi sutunu genisse gecer. Olcu ekran genisligi DEGIL,
 * alanin bulundugu sutun: foy izgarasi 768px'te ikiye bolundugu icin ekran
 * kirilimina baglanan sabit etiket girdiyi 768–1280 arasinda 22–82px'e
 * eziyordu (tasma olmadigi icin denetimden kaciyordu). Kapsayici sorgusu
 * sutunu olctugu icin sonuc her genislikte dogru.
 */
function FieldRow({
  label, align = "center", className, missing, hint, children, checkKey,
}: {
  label: string; align?: "center" | "start"; className?: string;
  /** Eksiksizlik denetiminde açık kalan alan → etiketin yanında uyarı ikonu. */
  missing?: boolean; hint?: string;
  /** Eksiksizlik anahtarı (lib/production/completeness.ts). Üstteki şeritte
   *  bu kaleme tıklanınca alan BU işaretten bulunur. */
  checkKey?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      data-check={checkKey}
      className={cn(
        "@container block scroll-mt-24 rounded-control transition-[box-shadow,background-color] duration-300",
        /* Şeritten atlandığında alan bir an vurgulanır — uzun föyde "hangisiydi"
           sorusu doğuyordu. Sınıf DOM'dan eklenir/çıkarılır (bkz. jumpTo). */
        className,
      )}
    >
      <span
        className={cn(
          "flex flex-col gap-1 @[23rem]:flex-row @[23rem]:gap-2",
          align === "start" ? "@[23rem]:items-start" : "@[23rem]:items-center",
        )}
      >
        <span
          className={cn(
            "inline-flex items-center gap-1 @[23rem]:w-36 @[23rem]:shrink-0",
            LABEL_CLS,
            missing ? "text-warning" : "text-muted",
            align === "start" && "@[23rem]:pt-2.5",
          )}
        >
          {label}
          {missing && (
            <span title={hint || "Üreticiye giden dosyada bu alan zorunlu."} aria-label="Bu alan eksik">
              <AlertTriangle size={12} className="shrink-0" />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">{children}</span>
      </span>
    </label>
  );
}

function LabeledField({
  label, value, onChange, placeholder, missing, hint, checkKey,
}: {
  label: string; value: string; onChange: (_v: string) => void; placeholder?: string;
  missing?: boolean; hint?: string; checkKey?: string;
}) {
  return (
    <FieldRow label={label} missing={missing} hint={hint} checkKey={checkKey}>
      <TextInput value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </FieldRow>
  );
}

function TextArea({
  value, onChange, placeholder, rows = 3,
}: { value: string; onChange: (_v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <UiTextArea
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

/** Föy bölümü — çerçeveli, üstte başlık şeridi (Excel föyü hissi). */
function Section({ title, children, className, checkKey }: {
  title: string; children: React.ReactNode; className?: string;
  /** Eksiksizlik anahtarı — şeritteki kalemden buraya atlanır (bkz. jumpTo). */
  checkKey?: string;
}) {
  return (
    <section
      data-check={checkKey}
      className={cn(
        "overflow-hidden rounded-card border border-line bg-surface scroll-mt-24 transition-[box-shadow,background-color] duration-300 ease-standard",
        className,
      )}
    >
      {/* Başlık + ince ayırıcı: teknik doküman gibi net bölüm sınırı. */}
      <div className="flex items-center gap-2 border-b border-hairline bg-surface-muted/60 px-3 py-2">
        <span aria-hidden className="h-3.5 w-[3px] shrink-0 rounded-full bg-brand" />
        <h2 className={cn(LABEL_CLS, "text-muted")}>{title}</h2>
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

export function ProductionSheetEditor({ sheet, initialCategory = null, initialSubcategory = null, memberNames, manufacturers = [], seasons = [], materials = [], bom = [], siblings = [], isAdmin, currentUserId, categories }: Props) {
  const tree = categories && categories.length > 0 ? categories : COLLECTION_TAXONOMY;
  const { ask, dialog } = useConfirm();
  const router = useRouter();
  const [form, setForm] = useState<ProductionSheetInput>(() => {
    if (sheet) return fromSheet(sheet);
    /* Yeni föy, GELDİĞİ KATEGORİYLE açılır — föy bir kategorinin altında doğar
       (2026-08-29). Kategori ızgarasından açıldıysa boş kalır ve "Kategori"
       alanı eksik olarak işaretlenir. */
    const blank = emptyState();
    return {
      ...blank,
      category: (initialCategory as ProductionSheetInput["category"]) ?? blank.category,
      subcategory: initialSubcategory ?? blank.subcategory,
    };
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Kaydedilmemiş değişiklik: konfirme yalnız DİSKTEKİ hâli onaylar, ekrandaki
  // taslağı değil. Yoksa "konfirme edildi" yazan bir föyün içeriği başka olur.
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<SheetTabId>("urun");
  const [isSaving, startSave] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  const isNew = sheet === null;
  const sheetId = sheet?.id ?? "new";
  // Silme: admin her föyü; üye kendi oluşturduğu föyü siler (RLS de bunu uygular).
  const canDelete = !isNew && !!sheet && (isAdmin || sheet.created_by === currentUserId);
  /**
   * Eksik kalemden ALANA git.
   *
   * Sıraç (2026-08-29): "Eksik alanda neresi eksikse tıkladığımda beni oraya
   * atsın." Önce yalnız sekme değişiyordu; föy uzun olduğu için alan hâlâ
   * gözle aranıyordu.
   *
   * Sekme değişimi DOM'a yansısın diye iki kare beklenir; sonra alan ekranın
   * ortasına kaydırılır, içindeki ilk girdi odaklanır ve alan bir buçuk saniye
   * vurgulanır.
   */
  function jumpTo(key: string) {
    setTab(CHECK_TAB[key] ?? "urun");
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(`[data-check="${key}"]`);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.querySelector<HTMLElement>("input, select, textarea, button")?.focus({ preventScroll: true });
        el.classList.add("bg-warning/10", "ring-2", "ring-warning");
        window.setTimeout(() => el.classList.remove("bg-warning/10", "ring-2", "ring-warning"), 1500);
      }),
    );
  }

  const set = <K extends keyof ProductionSheetInput>(key: K, value: ProductionSheetInput[K]) => {
    setDirty(true);
    setForm((f) => ({ ...f, [key]: value }));
  };

  // Eksiksizlik tek yerde hesaplanır: hem üstteki şerit hem sekme rozetleri
  // aynı sonucu kullansın (iki ayrı hesap er geç ayrışır).
  const checks = checkSheet({
    title: form.title,
    product_kind: form.product_kind ?? null,
    description: form.description ?? null,
    producer: form.producer ?? null,
    manufacturer_id: form.manufacturer_id ?? null,
    category: form.category ?? null,
    subcategory: form.subcategory ?? null,
    delivery_date: form.delivery_date ?? null,
    sewing_delivery_date: form.sewing_delivery_date ?? null,
    size_distribution: form.size_distribution,
    measurements: form.measurements,
    photo_refs: form.photo_refs,
  });
  /* Eksik alanların ANAHTAR kümesi — Aslı Hanım (2026-08-24): "Eksiklikleri
     gör kısmında hangi yer eksikse yanında da ikon çıksın." Uyarı artık ayrı
     bir panelde saklı değil, alanın kendi etiketinin yanında duruyor. */
  const missingKeys = new Set(checks.filter((c) => !c.ok).map((c) => c.key));
  const hintOf = new Map(checks.map((c) => [c.key, c.hint ?? ""]));

  const missingByTab = checks.reduce<Record<string, number>>((acc, c) => {
    if (!c.ok) {
      const t = CHECK_TAB[c.key] ?? "urun";
      acc[t] = (acc[t] ?? 0) + 1;
    }
    return acc;
  }, {});

  const nameOf = (id: string | null) => (id && memberNames[id]) || "—";
  const relTime = (iso: string) => {
    try { return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: tr }); } catch { return ""; }
  };

  // Görsel ekleme/kaldırma: yerel state'i güncelle VE mevcut föyde DB'yi anında
  // kaydet (kullanıcı "Kaydet"e basmasa bile depo ile DB tutarlı kalsın —
  // özellikle silmede). Yeni (kaydedilmemiş) föyde görseller create ile kaydolur.
  const [imgError, setImgError] = useState<string | null>(null);
  function handleImagesChange(next: ProductionSheetInput["photo_refs"]) {
    set("photo_refs", next);
    if (!isNew && sheet) {
      updateProductionSheetImages(sheet.id, next).then((res) => {
        if (res && "error" in res) setImgError(res.error);
      });
    }
  }

  // ── Ölçüler ──
  const updateMeasurement = (i: number, patch: Partial<MeasurementRow>) =>
    set("measurements", form.measurements.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addMeasurement = () =>
    set("measurements", [...form.measurements, { no: String(form.measurements.length + 1), label: "", value: "" }]);
  const removeMeasurement = (i: number) =>
    set("measurements", form.measurements.filter((_, idx) => idx !== i));

  // ── Teslim edilen ürünler ──
  const updateDelivered = (i: number, patch: Partial<DeliveredItemRow>) =>
    set("delivered_items", form.delivered_items.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addDelivered = () =>
    set("delivered_items", [...form.delivered_items, { no: String(form.delivered_items.length + 1), label: "", qty: "" }]);
  const removeDelivered = (i: number) =>
    set("delivered_items", form.delivered_items.filter((_, idx) => idx !== i));

  // ── Beden dağılımı ── (kolonlar sabit standart set; başlıklar düzenlenmez)
  const sd = form.size_distribution;
  const setDistCell = (rowIdx: number, colIdx: number, v: string) =>
    set("size_distribution", {
      ...sd,
      rows: sd.rows.map((r, ri) =>
        ri === rowIdx ? { ...r, values: r.values.map((val, ci) => (ci === colIdx ? v : val)) } : r),
    });
  const setDistLabel = (rowIdx: number, v: string) =>
    set("size_distribution", { ...sd, rows: sd.rows.map((r, ri) => (ri === rowIdx ? { ...r, label: v } : r)) });
  const setDistTotal = (rowIdx: number, v: string) =>
    set("size_distribution", { ...sd, rows: sd.rows.map((r, ri) => (ri === rowIdx ? { ...r, total: v } : r)) });
  const addDistRow = () =>
    set("size_distribution", { ...sd, rows: [...sd.rows, { label: "", values: sd.sizes.map(() => ""), total: "" }] });
  const removeDistRow = (rowIdx: number) =>
    set("size_distribution", { ...sd, rows: sd.rows.filter((_, ri) => ri !== rowIdx) });
  /** Beden grubu hücresi ("1" | "2" | "3" | "OS") — boş bırakılırsa silinir. */
  const setSizeGroup = (size: string, v: string) => {
    const groups = { ...(sd.groups ?? {}) };
    const t = v.trim();
    if (t) groups[size] = t; else delete groups[size];
    set("size_distribution", { ...sd, groups });
  };

  function handleSave() {
    setError(null);
    setSaved(false);
    if (!form.title.trim()) { setError("Föy başlığı (ürün adı) gerekli."); return; }
    startSave(async () => {
      const res = isNew ? await createProductionSheet(form) : await updateProductionSheet(sheet!.id, form);
      if ("error" in res) { setError(res.error); return; }
      if (isNew && "id" in res) {
        router.replace(`/production/${res.id}`);
      } else {
        setSaved(true);
        setDirty(false);
        window.setTimeout(() => setSaved(false), 2600);
        router.refresh();
      }
    });
  }

  async function handleDelete() {
    if (!sheet) return;
    if (!(await ask({
      title: "Föy silinsin mi?",
      message: `"${sheet.title}" ve içindeki bütün bilgiler kalıcı olarak silinir.\n\nYalnız gözden kaldırmak istiyorsanız durumu "Arşiv" yapın.`,
    }))) return;
    setError(null);
    startDelete(async () => {
      const res = await deleteProductionSheet(sheet.id);
      if ("error" in res) { setError(res.error); return; }
      router.push("/production");
      router.refresh();
    });
  }

  /* TEK primary: Kaydet. Sil, çıktı, Excel, gönder hepsi ikincil. */
  const SaveBtn = (
    <Button onClick={handleSave} loading={isSaving} disabled={isDeleting} className="shrink-0">
      {!isSaving && <Save size={15} />}
      {isNew ? "Föyü oluştur" : "Kaydet"}
    </Button>
  );

  return (
    <div className="w-full px-4 py-4 sm:px-6 lg:px-8">
      {/* Kaydedildi bildirimi (toast) */}
      <div
        aria-live="polite"
        className={cn(
          "pointer-events-none fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-control bg-ink px-4 py-2.5 text-[13.5px] font-medium text-white shadow-drawer transition-[opacity,transform] duration-300",
          saved ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
      >
        <CheckCircle2 size={16} className="text-success" aria-hidden /> Kaydedildi.
      </div>
      {dialog}

      {/* Üst bar — eylemler sabit kalır (sticky) ki uzun föyde her zaman erişilebilir */}
      {/* Opak zemin, gölgesiz: bulanık/yarı saydam çubuk föyün üstünde yüzüyordu. */}
      <div className="sticky top-0 z-20 -mx-4 mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-app px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="min-w-0">
          {/* GERİ — uygulamanın TEK geri düğmesiyle aynı (components/modules/BackLink).
              Burada elle yazılmış bir bağlantı vardı ve yalnız "Collection"
              yazıyordu: bir düğme gibi değil, sayfanın üstünde duran bir etiket
              gibi okunuyordu (Sıraç, 2026-08-30: "bi föydeyken geri butonu yok,
              direkt Collection var"). Ortak bileşen "← Geri" der, dokunma hedefi
              parmağa göredir ve hedefi hiyerarşiden türetir (föy → Koleksiyon). */}
          <div className="mb-1">
            <BackLink />
          </div>
          {!isNew && sheet && (
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-subtle">
              <span className="flex items-center gap-1">
                <User size={12} aria-hidden /> Oluşturan: <span className="font-medium text-muted">{nameOf(sheet.created_by)}</span>
              </span>
              <span className="flex items-center gap-1">
                <Clock size={12} aria-hidden /> Son giren: <span className="font-medium text-muted">{nameOf(sheet.updated_by)}</span> · {relTime(sheet.updated_at)}
              </span>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canDelete && (
            /* Yıkıcı eylem sessiz durur; kırmızı yalnız hover'da. */
            <Button
              variant="ghost"
              onClick={handleDelete}
              loading={isDeleting}
              disabled={isSaving}
              title="Föyü sil"
              aria-label="Föyü sil"
              className="hover:bg-danger/10 hover:text-danger"
            >
              {!isDeleting && <Trash2 size={15} aria-hidden />}
              <span className="hidden sm:inline">Sil</span>
            </Button>
          )}
          {/* DURUM föyün İÇERİĞİ değil KÜNYESİ — Aslı Hanım (2026-08-24):
              "Föy içinde DURUM kısmı ne alaka, onu anlamadım." Ürün sekmesinin
              altında bir bölüm olarak duruyordu ve föyün bir parçasıymış gibi
              okunuyordu. Yetenek kaybolmadı: künye bilgisi künyenin yanına,
              üst çubuğa alındı. */}
          {isAdmin && !isNew && (
            /* DURUM okunur değildi: kutuda yalnız "Aktif" yazıyordu, neyin
               durumu olduğu ve seçeneklerin ne anlama geldiği belirsizdi
               (2026-08-29: "şurada da Aktif/Taslak/Arşiv, anlamadım").
               Artık etiket görünür, renk noktası durumu tek bakışta söyler ve
               seçeneklerin karşılığı yazıyor. Ok GLOBAL select kuralından
               gelir — burada ayrıca çizilmez. */
            <label
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-control border border-line bg-surface pl-2.5 shadow-xs transition-[border-color,box-shadow] duration-150 focus-within:border-brand-ring focus-within:ring-2 focus-within:ring-brand-ring/40 hover:border-line-strong"
              title="Föyün künye durumu — içeriğini değiştirmez"
            >
              <span className={cn(LABEL_CLS, "text-subtle")}>Durum</span>
              <span
                aria-hidden
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  form.status === "active" ? "bg-success" : form.status === "draft" ? "bg-warning" : "bg-subtle",
                )}
              />
              <SelectInput
                value={form.status}
                onChange={(e) => set("status", e.target.value as ProductionSheetInput["status"])}
                aria-label="Föy durumu"
                className="h-full w-auto border-0 bg-transparent pl-0 font-medium shadow-none hover:border-0 focus:border-0 focus:ring-0"
              >
                <option value="draft">Taslak — hazırlanıyor</option>
                <option value="active">Aktif — üretimde</option>
                <option value="archived">Arşiv — listeden kalkar</option>
              </SelectInput>
            </label>
          )}
          {/* TEK SAYFA CIKTI — Asli Hanim (2026-08-23): "cikti aldigin zaman tek
              sayfada ciksin ve her sey gorunsun… firmaya vereyim." Ekrandaki
              dort sekme kagitta tek parca olur. */}
          {!isNew && sheet && (
            <DownloadLink
              href={`/production/${sheet.id}/print`}
              what={`“${sheet.title}” föyünün çıktısı`}
              label="Çıktı al"
              title="Föyün tamamı tek A4 sayfada — yazdır veya PDF olarak kaydet"
              className={secondaryBtnCls}
            >
              <Printer size={15} aria-hidden /> <span className="hidden sm:inline">Tek sayfa çıktı</span><span className="sr-only sm:hidden">Tek sayfa çıktı</span>
            </DownloadLink>
          )}
          {/* ÜRETİCİYE GÖNDER — Aslı Hanım (2026-08-28): "Üreticiye bu föy
              gidiyor. Aynı mail sistemiyle." Üretici uygulamaya girmez. */}
          {!isNew && sheet && (
            <SendToManufacturer
              sheetId={sheet.id}
              defaultEmail={manufacturers.find((m) => m.id === sheet.manufacturer_id)?.email ?? null}
              manufacturerName={
                manufacturers.find((m) => m.id === sheet.manufacturer_id)?.name ?? sheet.producer ?? null
              }
              confirmed={!!sheet.confirmed_at}
            />
          )}
          {!isNew && sheet && (
            <DownloadLink
              href={`/production/${sheet.id}/export`}
              what={`“${sheet.title}” föyünün Excel dosyası`}
              title="Föyü Excel (.xlsx) olarak indir"
              className={secondaryBtnCls}
            >
              <FileDown size={15} aria-hidden /> <span className="hidden sm:inline">Excel indir</span><span className="sr-only sm:hidden">Excel indir</span>
            </DownloadLink>
          )}
          {SaveBtn}
        </div>
      </div>

      {error && (
        <div role="alert" className="anim-fade-down mb-4 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[13.5px] font-medium text-danger">{error}</div>
      )}
      {imgError && (
        <div role="alert" className="anim-fade-down mb-4 rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-[13.5px] font-medium text-danger">Görsel kaydedilemedi: {imgError}</div>
      )}

      {/* ── Hazır mı? — eksiksizlik + Nisa konfirmasyonu ──────────────────
          Aslı Hanım (2026-08-21): üç kez eksik föy aldı. "Üreticiye gidecek
          dosyanın eksiksiz olmasını istiyorum" + "Nisa'yla konfirme ederek bana
          göstermenizi istiyorum." Şerit föyün EN ÜSTÜNDE durur; eksiksiz
          olmayan föy konfirme edilemez. */}
      <SheetReadiness
        sheetId={sheet?.id ?? null}
        checks={checks}
        onJump={jumpTo}
        confirmedAt={sheet?.confirmed_at ?? null}
        confirmedByName={sheet?.confirmed_by ? nameOf(sheet.confirmed_by) : null}
        dirty={dirty}
      />

      {/* ── Föy belgesi ── */}
      <div className="stagger-children space-y-3 rounded-card border border-line bg-surface p-4 shadow-card sm:p-6">
        {/* Başlık şeridi. Aslı Hanım (2026-08-19): "Şu Aslı Filinta'yı yazma
            böyle… Logoya gerek yok kendi iç üretimimizde güzelim." — marka
            kimliği çıkarıldı; şerit yalnız belgenin adını taşır. Sağda ürün
            kodu, çıktıda sayfayı tanımlayan tek işaret olarak durur. */}
        <div className="flex items-center justify-between gap-3 rounded-control bg-ink px-5 py-3">
          <div className="flex items-center gap-2.5 text-white">
            <ClipboardList size={18} aria-hidden />
            <span className="text-[14px] font-semibold uppercase tracking-[0.18em]">Üretim Föyü</span>
          </div>
          {form.product_code ? (
            <span className="text-[13px] font-semibold tabular-nums tracking-wide text-white/85">
              {form.product_code}
            </span>
          ) : null}
        </div>

        {/* SEKMELER — Aslı Hanım (2026-08-19): "Bu resmen çok yoruyor. Hangi
            bir noktaya bakacağımı şaşırıyorum… Yaratıcı insanlarda zihinde
            zaten 50 tane iş döndüğü için 50 tane işi bir anda görmek işine
            gelmiyor. Biraz daha basitleştirmemiz gerekiyor."
            Föy tek uzun dikey akıştı: 14 ölçü + beden ızgarası + maliyet + 8
            metin bloğu alt alta. Artık dört sekme. ÇIKTI DEĞİŞMEDİ — Excel
            hâlâ tek sayfa; sekmeler yalnız DÜZENLEME ekranı içindir.
            Eksik zorunlu alan olan sekme sarı noktayla işaretlenir. */}
        <div role="tablist" aria-label="Föy bölümleri" className="flex flex-wrap items-center gap-1 border-b border-line">
          {SHEET_TABS.map((t) => {
            const on = tab === t.id;
            const eksik = missingByTab[t.id] ?? 0;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={on}
                onClick={() => setTab(t.id)}
                className={cn(
                  "inline-flex h-10 items-center gap-1.5 border-b-2 px-3 text-[13.5px] transition-colors duration-150",
                  on
                    ? "border-brand font-semibold text-ink"
                    : "border-transparent font-medium text-muted hover:border-line-strong hover:text-ink",
                )}
              >
                <t.icon size={14} aria-hidden />
                {t.label}
                {/* SAYI DEĞİL NOKTA: "2 eksik" sekmeyi puanlıyordu (sadelik
                    kuralı). Kaç alanın eksik olduğunu üstteki şerit zaten
                    söylüyor; sekmede yalnız "burada bir şey var" işareti. */}
                {eksik > 0 && (
                  <span
                    className="size-1.5 shrink-0 rounded-full bg-warning"
                    role="img"
                    aria-label="Bu sekmede eksik alan var"
                    title="Bu sekmede eksik alan var"
                  />
                )}
              </button>
            );
          })}
        </div>

      {tab === "urun" && (<>
      {/* Sipariş bilgisi (sol) + TEKNİK ÇİZİM ÖN/ARKA (sağ üst).
          Aslı Hanım (2026-08-19): "Benim yukarıda çizimini görmem lazım.
          Teknik çizimini yukarıda sağda… En üst sağda teknik çizim ön,
          teknik çizim arka olacak." ve "Teslim edilen ürünler yukarıda olmaz.
          Önce siparişi görmemiz lazım." */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* Ürün bilgileri — 2 kolon (Excel'deki gibi) */}
        {/* TEK ızgara, iki kolon: alanlar satır satır akar, sütunların boyu
            farklı olduğu için altta BOŞLUK oluşmaz. Aslı Hanım (2026-08-19):
            "Hiçbir şey boş kalmasın… hiçbir yerde boşluk istemiyorum." */}
        {/* Alan izgarasi ikiye YALNIZ kutu gercekten genisse bolunur — sabit
            ekran kirilimi 1024'te sutunu 122px'e dusuruyordu. */}
        <div className="@container">
        <div className="grid grid-cols-1 gap-x-5 gap-y-2.5 rounded-card border border-line p-3 @[49rem]:grid-cols-2">
          <LabeledField checkKey="title" label="Föy başlığı *" value={form.title} onChange={(v) => set("title", v)} placeholder="Beyaz Dantel Etek" missing={missingKeys.has("title")} hint={hintOf.get("title")} />
          <LabeledField label="Üretim tarihi" value={form.production_date ?? ""} onChange={(v) => set("production_date", v)} />
          <LabeledField label="Ürün kodu" value={form.product_code ?? ""} onChange={(v) => set("product_code", v)} />
          <LabeledField checkKey="delivery_date" label="Teslim tarihi" value={form.delivery_date ?? ""} onChange={(v) => set("delivery_date", v)} placeholder="21.07.2026" missing={missingKeys.has("delivery_date")} hint={hintOf.get("delivery_date")} />
          <LabeledField checkKey="description" label="Ürün cinsi" value={form.product_kind ?? ""} onChange={(v) => set("product_kind", v)} placeholder="Etek" missing={missingKeys.has("description")} hint={hintOf.get("description")} />
          {/* RENK — föy kimliğinin üçüncü parçası (model | kumaş | renk),
              Zedonk deseni. Aynı modelin başka rengi için aşağıdaki varyant
              şeridinden "Renk ekle" kullanılır. */}
          <LabeledField label="Renk" value={form.colorway ?? ""} onChange={(v) => set("colorway", v)} placeholder="Mavi" />
          {/* İkinci tarih — "Bir ürünlerin teslim tarihi, bir de dikim teslim
              tarihi lazım." */}
          <LabeledField checkKey="sewing_delivery_date" label="Dikim teslim tarihi" value={form.sewing_delivery_date ?? ""} onChange={(v) => set("sewing_delivery_date", v)} placeholder="14.07.2026" missing={missingKeys.has("sewing_delivery_date")} hint={hintOf.get("sewing_delivery_date")} />
          {/* ÜRETİCİ — artık serbest metin değil, gerçek usta kaydı.
              Aslı Hanım (2026-08-19): "Cihan Usta, Hakan Usta… ona gireceksin,
              hangi ürünler orada dikiliyor." Serbest metinken Ödeme Tablosu
              "Hakan Günaydın" ile "Hakan usta"yı iki ayrı usta sayıyordu.
              Liste boşsa (tablo migrate edilmemiş) eski metin alanına düşer —
              föy her hâlükârda açılır. */}
          {manufacturers.length > 0 ? (
            <FieldRow checkKey="producer" label="Üretici" missing={missingKeys.has("producer")} hint={hintOf.get("producer")}>
              <SelectInput
                value={form.manufacturer_id ?? ""}
                onChange={(e) => {
                  const id = e.target.value || null;
                  const m = manufacturers.find((x) => x.id === id);
                  // producer metnini de senkron tut: eski föyler, Excel çıktısı
                  // ve migrate edilmemiş ortamlar hâlâ onu okuyor.
                  setDirty(true);
                  setForm((f) => ({ ...f, manufacturer_id: id, producer: m?.name ?? "" }));
                }}
              >
                <option value="">Seçiniz…</option>
                {manufacturers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}{m.is_active ? "" : " (pasif)"}
                  </option>
                ))}
              </SelectInput>
            </FieldRow>
          ) : (
            <LabeledField label="Üretici" value={form.producer ?? ""} onChange={(v) => set("producer", v)} />
          )}
          {/* SEZON — artık serbest metin değil, gerçek kayıt. Ürün ekranlarının
              bağlamı bu (Zedonk `SS 21 - WW` deseni). Liste boşsa eski metin
              alanına düşer. Yeni föy varsayılan olarak AKTİF sezonda açılır. */}
          {seasons.length > 0 ? (
            <FieldRow label="Sezon">
              <SelectInput
                value={form.season_id ?? ""}
                onChange={(e) => {
                  const id = e.target.value || null;
                  const sn = seasons.find((x) => x.id === id);
                  setDirty(true);
                  setForm((f) => ({ ...f, season_id: id, season: sn?.name ?? "" }));
                }}
              >
                <option value="">Seçiniz…</option>
                {seasons.map((sn) => (
                  <option key={sn.id} value={sn.id}>{sn.name}{sn.is_current ? " ·" : ""}</option>
                ))}
              </SelectInput>
            </FieldRow>
          ) : (
            <LabeledField label="Sezon" value={form.season ?? ""} onChange={(v) => set("season", v)} placeholder="2026 RESORT" />
          )}
          {/* Koleksiyon kategorisi — web nav yapısı (One-of-a-Kind / Ready to Wear …) */}
          <FieldRow checkKey="category" label="Kategori" missing={missingKeys.has("category")} hint={hintOf.get("category")}>
            <SelectInput
              value={form.category ?? ""}
              onChange={(e) => {
                const next = (e.target.value || null) as ProductionCategory | null;
                // Kategori değişince geçersiz alt kategoriyi temizle.
                const validSubs = subsOf(tree, next).map((s) => s.key);
                setDirty(true);
                setForm((f) => ({
                  ...f,
                  category: next,
                  subcategory: validSubs.includes(f.subcategory ?? "") ? f.subcategory : "",
                }));
              }}
            >
              <option value="">Seçiniz…</option>
              {tree.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </SelectInput>
          </FieldRow>
          <FieldRow checkKey="subcategory" label="Alt kategori" missing={missingKeys.has("subcategory")} hint={hintOf.get("subcategory")}>
            <SelectInput
              value={form.subcategory ?? ""}
              onChange={(e) => set("subcategory", e.target.value)}
              disabled={subsOf(tree, form.category).length === 0}
            >
              <option value="">{subsOf(tree, form.category).length === 0 ? "—" : "Seçiniz…"}</option>
              {/* ÜÇ KADEME (Accessories › Hats › Bucket Hat): alt dallar
                  girintiyle listelenir — ayrı bir ikinci seçici açmak formu
                  uzatırdı ve föyde alt kategori TEK alandır. */}
              {flattenSubs(subsOf(tree, form.category)).map(({ node, depth }) => (
                <option key={node.key} value={node.key}>
                  {depth > 0 ? `${"\u00A0\u00A0".repeat(depth)}↳ ${node.label}` : node.label}
                </option>
              ))}
            </SelectInput>
          </FieldRow>
          <LabeledField label="1 ürüne giden metraj" value={form.meterage ?? ""} onChange={(v) => set("meterage", v)} placeholder="1.60 CM" />
          <FieldRow checkKey="description" label="Ürünün açıklaması" align="start" className="@[49rem]:col-span-2" missing={missingKeys.has("description")} hint={hintOf.get("description")}>
            <TextArea value={form.description ?? ""} onChange={(v) => set("description", v)} rows={2} />
          </FieldRow>
        </div>
        </div>

        {/* KAPAK + TEKNİK ÇİZİM — HER ZAMAN YAN YANA (geniş ekranda üç sütun).
            Alt alta dizilince sağ sütun solun iki katı uzuyor ve altında boşluk
            kalıyordu (Aslı Hanım, 2026-08-24: "föyde çoğu yer boşluklu").
            Kapak, ürünün Koleksiyon'daki yüzüdür: kart kapağı artık yüklenen
            görseller arasından TAHMİN edilmiyor, buradan seçiliyor
            (Sıraç, 2026-08-30: "föylerde de kapak resmi ekleme kısmı olsun,
            bu resmin tamamını değiştireceğim"). `variant="drawing"` tek görsel
            gösterir ve "Değiştir" düğmesiyle gelir — kapak bir galeri değil,
            tek bir karardır. Zorunlu alan DEĞİLDİR: eksik uyarısını şişirmez. */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <Section title="Kapak Görseli">
            <ImageUploader sheetId={sheetId} section="cover" images={form.photo_refs} onChange={handleImagesChange} variant="drawing" />
          </Section>
          <Section checkKey="drawing" title="Teknik Çizim — Ön">
            <ImageUploader sheetId={sheetId} section="technical_drawing_front" images={form.photo_refs} onChange={handleImagesChange} variant="drawing" />
          </Section>
          <Section title="Teknik Çizim — Arka">
            <ImageUploader sheetId={sheetId} section="technical_drawing_back" images={form.photo_refs} onChange={handleImagesChange} variant="drawing" />
          </Section>
        </div>
      </div>

        {/* RENK VARYANTLARI — aynı modelin diğer renkleri. Zedonk'ta ürün
            kimliği model × kumaş × renktir; bizde her renk ayrı föy olduğu için
            ölçüler, talimatlar ve reçete üç kez yazılıyordu. Tam genişlik:
            yukarıdaki iki sütunlu ızgaranın DIŞINDA durur. */}
        <Section title="Renk Varyantları">
          <SheetVariants
            sheetId={sheet?.id ?? null}
            colorway={form.colorway ?? null}
            siblings={siblings}
            canEdit={isAdmin}
          />
        </Section>
      </>)}

      {tab === "olcu" && (<>
        {/* ÖLÇÜLER — Excel gibi çizgili ızgara, numaralar OTOMATİK.
            Aslı Hanım (2026-08-19): "Bunların Excel gibi çizgi çizgi kare kare
            olması… hiçbir boş hücre kalmaması. Mesela üç numara niye boş?"
            Sıra numarası artık elle yazılmıyor → hiçbir numara boş kalamaz. */}
        <Section checkKey="measurements" title="Ölçüler (cm)">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] table-fixed border-collapse text-[13px]">
              <colgroup>
                <col className="w-10" />
                <col />
                <col className="w-24" />
                <col className="w-9" />
              </colgroup>
              <thead>
                <tr className="bg-surface-muted">
                  <th className={cn(TH_CLS, "px-1 text-center")}>No</th>
                  <th className={cn(TH_CLS, "text-left")}>Ölçü</th>
                  <th className={cn(TH_CLS, "px-1 text-center")}>cm</th>
                  <th className="w-9" />
                </tr>
              </thead>
              <tbody>
                {form.measurements.map((row, i) => (
                  <tr key={i}>
                    <td className="border border-line bg-surface-muted/60 px-1 py-1.5 text-center text-[12px] font-semibold tabular-nums text-muted">
                      {i + 1}
                    </td>
                    <td className="border border-line p-0">
                      <CellInput aria-label={`${i + 1}. ölçü adı`} value={row.label} onChange={(e) => updateMeasurement(i, { label: e.target.value })} placeholder="Ölçü adı" />
                    </td>
                    <td className="border border-line p-0">
                      <CellInput aria-label={`${i + 1}. ölçü (cm)`} className="px-1 text-right tabular-nums" value={row.value} onChange={(e) => updateMeasurement(i, { value: e.target.value })} inputMode="decimal" />
                    </td>
                    <td className="text-center align-middle">
                      <RowDelete onClick={() => removeMeasurement(i)} label={`${i + 1}. ölçü satırını sil`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="ghost" size="sm" onClick={addMeasurement} className="mt-2 -ml-2 text-brand hover:bg-brand-soft hover:text-brand-strong">
            <Plus size={13} aria-hidden /> Satır ekle
          </Button>
        </Section>

        {/* BEDEN DAĞILIMI — sabit standart beden kolonları; hangisine istersen gir */}
        <Section checkKey="sizes" title="Beden Dağılımı">
          <p className="mb-2.5 text-[12px] text-subtle">
            Tüm bedenler her zaman burada; yalnızca ürünün olan bedenlerine adet girin.
            <br />
            <b className="font-semibold text-muted">Grup</b> satırı ikili bedenleri
            eşler: XS-S <b>1</b>, M-L <b>2</b>, XL-XXL <b>3</b>, tek beden <b>OS</b>.
            Hücreye yazarak değiştirebilirsiniz.
          </p>
          {/* Hizalı, çizgili ızgara — sabit başlıklar + eşit genişlikte kutucuklar */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] table-fixed border-collapse text-[13px]">
              <colgroup>
                <col className="w-36" />
                {sd.sizes.map((_, i) => <col key={i} />)}
                <col className="w-16" />
                <col className="w-9" />
              </colgroup>
              <thead>
                <tr className="bg-surface-muted">
                  <th className={cn(TH_CLS, "text-left")}>Satır</th>
                  {sd.sizes.map((s, i) => (
                    <th key={i} className="border border-line-strong px-1 py-1.5 text-center text-[12.5px] font-semibold text-ink">
                      {s}
                    </th>
                  ))}
                  <th className={cn(TH_CLS, "px-1 text-center")}>Toplam</th>
                  <th className="w-9" />
                </tr>
                {/* BEDEN GRUBU — Aslı Hanım (2026-08-19): "Bedenlerin altına
                    o ürünün gibi bir sıra daha açacaksın. XSmall'la small'a 1,
                    medium'le large'a 2, XXlarge'a 3 diyeceksin. Bir de
                    hepsinin işaretli olduğu one size." Hücreler düzenlenebilir:
                    grubu değiştirmek tek tık. */}
                <tr className="bg-surface-sunken">
                  <th className={cn(TH_CLS, "py-1 text-left")}>
                    Grup
                  </th>
                  {sd.sizes.map((size, i) => (
                    <th key={i} className="border border-line-strong p-0">
                      <CellInput
                        className="px-1 text-center font-semibold tabular-nums text-brand-strong"
                        value={sd.groups?.[size] ?? ""}
                        onChange={(e) => setSizeGroup(size, e.target.value)}
                        placeholder="—"
                        maxLength={8}
                        title={`${size} bedeninin grubu`}
                        aria-label={`${size} bedeninin grubu`}
                      />
                    </th>
                  ))}
                  <th className="border border-line-strong" />
                  <th className="w-9" />
                </tr>
              </thead>
              <tbody>
                {sd.rows.map((row, ri) => (
                  <tr key={ri}>
                    <td className="border border-line p-0">
                      <CellInput className="font-medium" aria-label={`${ri + 1}. satır adı`} value={row.label} onChange={(e) => setDistLabel(ri, e.target.value)} placeholder="Satır adı" />
                    </td>
                    {sd.sizes.map((size, ci) => (
                      <td key={ci} className="border border-line p-0">
                        <CellInput className="px-1 text-center tabular-nums" aria-label={`${row.label || `${ri + 1}. satır`} — ${size}`} value={row.values[ci] ?? ""} onChange={(e) => setDistCell(ri, ci, e.target.value)} inputMode="numeric" />
                      </td>
                    ))}
                    <td className="border border-line p-0">
                      <CellInput className="px-1 text-center font-semibold tabular-nums" aria-label={`${row.label || `${ri + 1}. satır`} — toplam`} value={row.total} onChange={(e) => setDistTotal(ri, e.target.value)} placeholder="—" inputMode="numeric" />
                    </td>
                    <td className="text-center align-middle">
                      <RowDelete onClick={() => removeDistRow(ri)} label={`${row.label || `${ri + 1}. satır`} satırını sil`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="ghost" size="sm" onClick={addDistRow} className="mt-2 -ml-2 text-brand hover:bg-brand-soft hover:text-brand-strong">
            <Plus size={13} aria-hidden /> Satır ekle
          </Button>
        </Section>

        {/* TESLİM EDİLEN ÜRÜNLER — siparişin ALTINDA.
            Aslı Hanım (2026-08-19): "Teslim edilen ürünler yukarıda olmaz.
            Önce siparişi görmemiz lazım." Numaralar otomatik: boş hücre yok. */}
        <Section title="Teslim Edilen Ürünler">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] table-fixed border-collapse text-[13px]">
              <colgroup>
                <col className="w-10" />
                <col />
                <col className="w-24" />
                <col className="w-9" />
              </colgroup>
              <thead>
                <tr className="bg-surface-muted">
                  <th className={cn(TH_CLS, "px-1 text-center")}>No</th>
                  <th className={cn(TH_CLS, "text-left")}>Ürün</th>
                  <th className={cn(TH_CLS, "px-1 text-right")}>Adet</th>
                  <th className="w-9" />
                </tr>
              </thead>
              <tbody>
                {form.delivered_items.map((row, i) => (
                  <tr key={i}>
                    <td className="border border-line bg-surface-muted/60 px-1 py-1.5 text-center text-[12px] font-semibold tabular-nums text-muted">
                      {i + 1}
                    </td>
                    <td className="border border-line p-0">
                      <CellInput aria-label={`${i + 1}. teslim edilen ürün`} value={row.label} onChange={(e) => updateDelivered(i, { label: e.target.value })} placeholder="Ürün (ör. Karton Etiket)" />
                    </td>
                    <td className="border border-line p-0">
                      <CellInput className="px-1 text-right tabular-nums" aria-label={`${i + 1}. teslim edilen ürün — adet`} value={row.qty} onChange={(e) => updateDelivered(i, { qty: e.target.value })} inputMode="numeric" />
                    </td>
                    <td className="text-center align-middle">
                      <RowDelete onClick={() => removeDelivered(i)} label={`${i + 1}. teslim satırını sil`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="ghost" size="sm" onClick={addDelivered} className="mt-2 -ml-2 text-brand hover:bg-brand-soft hover:text-brand-strong">
            <Plus size={13} aria-hidden /> Satır ekle
          </Button>
        </Section>
      </>)}

      {tab === "maliyet" && (<>
        {/* REÇETE (BOM) — maliyetin KAYNAĞI, o yüzden maliyet tablosunun
            ÜSTÜNDE. Nedensel sıra: reçete → maliyet. */}
        <Section title="Reçete — Bu üründe ne kadar malzeme gidiyor">
          <SheetBom sheetId={sheet?.id ?? null} rows={bom} materials={materials} canEdit={isAdmin} />
        </Section>

        {/* MALİYET — kalem kalem. Aslı Hanım (2026-08-19):
            "Maliyet şöyle hesaplanıyor: kumaşın fiyatına ayrı giriyorsun,
             dikim fiyatına ayrı, fermuar fiyatına ayrı, ütü paketi ayrı,
             kalıba ayrı, genel giderleri ayrı. Maliyetin bir sürü kategorisi
             var. Öyle birim fiyat diye maliyet hesaplanmıyor." */}
        <Section title="Maliyet (kalem kalem)">
          {(() => {
            const p = form.pricing;
            const qty = totalQuantity(form.size_distribution);
            const items = p.cost_items?.length ? p.cost_items : emptyCostItems();
            // Reçeteden gelen kalemler ELLE GİRİLEMEZ: tutar hesaplanır ve
            // elle girilenin YERİNE geçer. İkisi toplanırsa maliyet iki katına
            // çıkardı. Reçetede olmayan kalemler (dikim, ütü/paket, kalıp,
            // genel gider) elle kalır — onlar malzeme değil.
            const fromBom = bom.length ? bomCostByKey(bom) : {};
            const amountOf = (it: CostItem) =>
              fromBom[it.key] != null ? fromBom[it.key]! : parseMoney(it.amount);
            const unitCost = items.reduce((a, it) => a + amountOf(it), 0);
            const setP = (patch: Partial<typeof p>) => set("pricing", { ...p, ...patch });
            const setItem = (i: number, patch: Partial<CostItem>) =>
              setP({ cost_items: items.map((it, ix) => (ix === i ? { ...it, ...patch } : it)) });
            const sale = parseMoney(p.web_sale_price);
            const margin = sale > 0 && unitCost > 0 ? ((sale - unitCost) / sale) * 100 : null;
            return (
              <div className="space-y-3">
                {/* Kalem ızgarası — Excel gibi çizgili, boş hücre bırakmaz. */}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[380px] table-fixed border-collapse text-[13px]">
                    <colgroup><col /><col className="w-36" /></colgroup>
                    <thead>
                      <tr className="bg-surface-muted">
                        <th className={cn(TH_CLS, "text-left")}>Maliyet kalemi</th>
                        <th className={cn(TH_CLS, "text-right")}>Birim (₺)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, i) => (
                        <tr key={`${it.key}-${i}`}>
                          <td className={cn("border border-line", it.key === "diger" ? "p-0" : "px-2 py-1.5")}>
                            {it.key === "diger" ? (
                              <CellInput
                                aria-label="Diğer gider adı"
                                value={it.label ?? ""}
                                onChange={(e) => setItem(i, { label: e.target.value })}
                                placeholder="Diğer gider adı"
                              />
                            ) : (
                              <span className="font-medium text-ink">{costItemLabel(it)}</span>
                            )}
                          </td>
                          <td className="border border-line p-0">
                            {fromBom[it.key] != null ? (
                              <span
                                className="flex h-8 items-center justify-end gap-1.5 px-2 text-right tabular-nums text-ink"
                                title="Reçeteden hesaplanıyor — elle değiştirilemez"
                              >
                                <Badge size="xs" className="bg-brand-soft text-brand-strong">reçete</Badge>
                                {formatMoney(fromBom[it.key]!)}
                              </span>
                            ) : (
                              <CellInput
                                className="text-right tabular-nums"
                                aria-label={`${costItemLabel(it)} — birim tutar`}
                                value={it.amount}
                                onChange={(e) => setItem(i, { amount: e.target.value })}
                                inputMode="decimal"
                                placeholder="—"
                              />
                            )}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-surface-muted">
                        <td className={cn("border border-line-strong px-2 py-1.5 text-ink", LABEL_CLS)}>
                          Birim maliyet
                        </td>
                        <td className="border border-line-strong px-2 py-1.5 text-right text-[13.5px] font-semibold tabular-nums text-ink">
                          {formatMoney(unitCost)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Satış fiyatı + ustaya ödeme — maliyetten AYRI iki kalem. */}
                <div className="grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">
                  <LabeledField label="Web satış fiyatı (₺)" value={p.web_sale_price ?? ""} onChange={(v) => setP({ web_sale_price: v })} placeholder="sitedeki satış fiyatı" />
                  <LabeledField label="Ustaya birim ödeme (₺)" value={p.usta_unit_payment ?? ""} onChange={(v) => setP({ usta_unit_payment: v })} placeholder="Ödeme Tablosu’na girer" />
                  <LabeledField label="Not" value={p.notes ?? ""} onChange={(v) => setP({ notes: v })} placeholder="KDV hariç, kargo vb." />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line bg-surface-muted px-3 py-2 text-[13.5px]">
                  <span className="text-muted">
                    Toplam adet: <span className="font-semibold tabular-nums text-ink">{qty || "—"}</span>
                    <span className="mx-1.5 text-subtle">×</span>
                    Birim maliyet: <span className="font-semibold tabular-nums text-ink">{formatMoney(unitCost)}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    {/* Yeşil yalnız "tamamlandı" içindir; artı marj nötr,
                        eksi marj kırmızı. */}
                    {margin !== null && (
                      <span className={cn("font-semibold tabular-nums", margin >= 0 ? "text-ink" : "text-danger")}>
                        Kâr marjı: %{margin.toFixed(0)}
                      </span>
                    )}
                    <span className="font-semibold tabular-nums text-ink">
                      Toplam maliyet: {formatMoney(qty * unitCost)}
                    </span>
                  </span>
                </div>
                <p className="text-[12px] text-subtle">
                  Maliyet ile <b className="font-semibold text-muted">ödeme</b> ayrı şeylerdir: buradaki kalemler ürünün
                  maliyetini verir; ustaya ödenen tutar Collection → <b className="font-semibold text-muted">Payment Table</b>’da
                  usta bazında toplanır.
                </p>
              </div>
            );
          })()}
        </Section>
      </>)}

      {tab === "malzeme" && (<>
        {/* YIKAMA TALİMATI */}
        <Section title="Yıkama Talimatı">
          <TextArea value={form.wash_instruction ?? ""} onChange={(v) => set("wash_instruction", v)} rows={2} placeholder="% 100 Polyester Dry Clean Only…" />
        </Section>

        {/* KUMAŞ / ASTAR — metin + foto */}
        <Section title="Kumaş / Astar">
          <TextArea value={form.fabric_lining ?? ""} onChange={(v) => set("fabric_lining", v)} rows={2} />
          <div className="mt-3">
            <ImageUploader sheetId={sheetId} section="fabric" images={form.photo_refs} onChange={handleImagesChange} label="Kumaş / astar fotoğrafları" />
          </div>
        </Section>

        {/* KUMAŞ BİLGİSİ + AKSESUAR BİLGİSİ */}
        <Section title="Kumaş & Aksesuar Bilgisi">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:gap-x-5">
            <label className="block">
              <span className={cn(LABEL_CLS, "mb-1 block text-muted")}>Kumaş bilgisi (cinsi, desen yönü, pantone, gramaj…)</span>
              <TextArea value={form.fabric_info ?? ""} onChange={(v) => set("fabric_info", v)} rows={2} />
            </label>
            <label className="block">
              <span className={cn(LABEL_CLS, "mb-1 block text-muted")}>Aksesuarlar bilgisi (çıtçıt, düğme, kopça, taş, boncuk, etiket…)</span>
              <TextArea value={form.accessories_info ?? ""} onChange={(v) => set("accessories_info", v)} rows={2} />
            </label>
          </div>
          <div className="mt-3">
            <ImageUploader sheetId={sheetId} section="accessories" images={form.photo_refs} onChange={handleImagesChange} label="Aksesuar fotoğrafları" />
          </div>
        </Section>

        {/* SÜSLEMELER */}
        <Section title="Süslemeler ve Aksesuar Açıklaması">
          <TextArea value={form.embellishments ?? ""} onChange={(v) => set("embellishments", v)} rows={2} />
          <div className="mt-3">
            <ImageUploader sheetId={sheetId} section="embellishments" images={form.photo_refs} onChange={handleImagesChange} label="Süsleme / etiket fotoğrafları" />
          </div>
        </Section>

        {/* DİKİŞ TALİMATI */}
        <Section title="Dikiş Talimatı">
          <TextArea value={form.sewing_instruction ?? ""} onChange={(v) => set("sewing_instruction", v)} rows={4} />
          <div className="mt-3">
            <ImageUploader sheetId={sheetId} section="sewing" images={form.photo_refs} onChange={handleImagesChange} label="Dikiş / numune fotoğrafları" />
          </div>
        </Section>

        {/* ÖZEL İŞÇİLİK & KALİTE KONTROL */}
        <Section title="Özel İşçilik ve Kalite Kontrol">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:gap-x-5">
            <label className="block">
              <span className={cn(LABEL_CLS, "mb-1 block text-muted")}>Özel işçilik notları</span>
              <TextArea value={form.workmanship_notes ?? ""} onChange={(v) => set("workmanship_notes", v)} rows={2} />
            </label>
            <label className="block">
              <span className={cn(LABEL_CLS, "mb-1 block text-muted")}>Kalite kontrol revizyon tarihi</span>
              <TextArea value={form.qc_revision ?? ""} onChange={(v) => set("qc_revision", v)} rows={2} />
            </label>
            <label className="block">
              <span className={cn(LABEL_CLS, "mb-1 block text-muted")}>Revizyon notları</span>
              <TextArea value={form.revision_notes ?? ""} onChange={(v) => set("revision_notes", v)} rows={2} />
            </label>
            <label className="block">
              <span className={cn(LABEL_CLS, "mb-1 block text-muted")}>Üretim fire payı</span>
              <TextArea value={form.production_waste ?? ""} onChange={(v) => set("production_waste", v)} rows={2} />
            </label>
          </div>
        </Section>

        {/* DİĞER GÖRSELLER — bölümlere atanmamış (genel) görseller için güvenlik ağı */}
        {form.photo_refs.some((p) => p.section === "general") && (
          <Section title="Diğer Görseller">
            <ImageUploader sheetId={sheetId} section="general" images={form.photo_refs} onChange={handleImagesChange} label="Genel fotoğraflar" />
          </Section>
        )}
      </>)}

      </div>
    </div>
  );
}
