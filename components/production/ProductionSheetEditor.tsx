"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import {
  ClipboardList, ArrowLeft, Plus, Trash2, Save, User, Clock, Loader2, FileDown,
  CheckCircle2, Ruler, Wallet, Layers,
} from "lucide-react";
import {
  createProductionSheet, updateProductionSheet, updateProductionSheetImages,
  deleteProductionSheet,
  type ProductionSheetInput,
} from "@/lib/actions/production";
import { cn } from "@/lib/utils/cn";
import { ImageUploader } from "./ImageUploader";
import { SheetReadiness } from "./SheetReadiness";
import { checkSheet } from "@/lib/production/completeness";
import { COLLECTION_TAXONOMY, subcategoriesOf } from "@/lib/collection/taxonomy";
import {
  totalQuantity, parseMoney, formatMoney, STANDARD_SIZES, normalizeToStandardSizes,
  DEFAULT_SIZE_GROUPS, emptyCostItems, costItemLabel,
} from "@/lib/collection/cost";
import type {
  ProductionSheet, MeasurementRow, DeliveredItemRow, SizeDistribution, ProductionCategory,
  CostItem, Manufacturer,
} from "@/types";

/** Föydeki "Üretici" seçicisini besleyen sade usta kaydı. */
export type SheetManufacturer = Pick<
  Manufacturer, "id" | "name" | "is_active" | "lead_time_days" | "min_order_qty" | "currency" | "city"
>;

interface Props {
  sheet: ProductionSheet | null;
  memberNames: Record<string, string>;
  /** Usta listesi. Boşsa alan serbest metne düşer (tablo migrate edilmemiş). */
  manufacturers?: SheetManufacturer[];
  isAdmin: boolean;
  currentUserId: string;
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
    description: "",
    season: "",
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
    description: s.description ?? "",
    season: s.season ?? "",
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
const inputCls =
  "w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-subtle " +
  "transition-[color,background-color,border-color,box-shadow] duration-150 ease-standard " +
  "hover:border-line-strong focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40";

function LabeledField({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (_v: string) => void; placeholder?: string }) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-40 shrink-0 text-[11.5px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function TextArea({
  value, onChange, placeholder, rows = 3,
}: { value: string; onChange: (_v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      className={cn(inputCls, "resize-y leading-relaxed")}
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

/** Föy bölümü — çerçeveli, üstte başlık şeridi (Excel föyü hissi). */
function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("overflow-hidden rounded-lg border border-line bg-surface shadow-card transition-shadow duration-200 ease-standard", className)}>
      <div className="flex items-center gap-2 border-b border-line bg-surface-muted px-3 py-2">
        <span aria-hidden className="h-3.5 w-[3px] shrink-0 rounded-full bg-brand" />
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">{title}</h2>
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

export function ProductionSheetEditor({ sheet, memberNames, manufacturers = [], isAdmin, currentUserId }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<ProductionSheetInput>(() => (sheet ? fromSheet(sheet) : emptyState()));
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

  function handleDelete() {
    if (!sheet) return;
    if (!confirm(`"${sheet.title}" föyünü kalıcı olarak silmek istiyor musunuz? Bu işlem geri alınamaz.`)) return;
    setError(null);
    startDelete(async () => {
      const res = await deleteProductionSheet(sheet.id);
      if ("error" in res) { setError(res.error); return; }
      router.push("/production");
      router.refresh();
    });
  }

  const SaveBtn = (
    <button
      onClick={handleSave}
      disabled={isSaving || isDeleting}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white shadow-xs transition-all duration-150 hover:bg-brand-strong active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 disabled:shadow-none"
    >
      {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
      {isNew ? "Föyü oluştur" : "Kaydet"}
    </button>
  );

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      {/* Kaydedildi bildirimi (toast) */}
      <div
        aria-live="polite"
        className={cn(
          "pointer-events-none fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-[13px] font-medium text-white shadow-drawer transition-all duration-300",
          saved ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
      >
        <CheckCircle2 size={16} className="text-emerald-400" /> Değişiklikler kaydedildi
      </div>

      {/* Üst bar — eylemler sabit kalır (sticky) ki uzun föyde her zaman erişilebilir */}
      <div className="sticky top-0 z-20 -mx-4 mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-app/85 px-4 py-3 shadow-pop backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="min-w-0">
          <Link href="/collection" className="mb-1 inline-flex items-center gap-1 rounded-md text-[13px] text-subtle transition-colors duration-150 hover:text-ink">
            <ArrowLeft size={13} /> Koleksiyon
          </Link>
          {!isNew && sheet && (
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-subtle">
              <span className="flex items-center gap-1">
                <User size={11} /> Oluşturan: <span className="font-medium text-muted">{nameOf(sheet.created_by)}</span>
              </span>
              <span className="flex items-center gap-1">
                <Clock size={11} /> Son giren: <span className="font-medium text-muted">{nameOf(sheet.updated_by)}</span> · {relTime(sheet.updated_at)}
              </span>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={isDeleting || isSaving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium text-muted shadow-xs transition-all duration-150 hover:border-danger/40 hover:bg-danger/10 hover:text-danger active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
              title="Föyü sil"
            >
              {isDeleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              <span className="hidden sm:inline">Sil</span>
            </button>
          )}
          {!isNew && sheet && (
            <a
              href={`/production/${sheet.id}/export`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2 text-[13px] font-medium text-muted shadow-xs transition-all duration-150 hover:border-line-strong hover:bg-surface-muted hover:text-ink active:scale-[0.98]"
              title="Föyü Excel (.xlsx) olarak indir"
            >
              <FileDown size={15} /> <span className="hidden sm:inline">Excel indir</span>
            </a>
          )}
          {SaveBtn}
        </div>
      </div>

      {error && (
        <div className="anim-fade-down mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] font-medium text-danger">{error}</div>
      )}
      {imgError && (
        <div className="anim-fade-down mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] font-medium text-danger">Görsel kaydedilemedi: {imgError}</div>
      )}

      {/* ── Hazır mı? — eksiksizlik + Nisa konfirmasyonu ──────────────────
          Aslı Hanım (2026-08-21): üç kez eksik föy aldı. "Üreticiye gidecek
          dosyanın eksiksiz olmasını istiyorum" + "Nisa'yla konfirme ederek bana
          göstermenizi istiyorum." Şerit föyün EN ÜSTÜNDE durur; eksiksiz
          olmayan föy konfirme edilemez. */}
      <SheetReadiness
        sheetId={sheet?.id ?? null}
        checks={checks}
        onJump={(key) => setTab(CHECK_TAB[key] ?? "urun")}
        confirmedAt={sheet?.confirmed_at ?? null}
        confirmedByName={sheet?.confirmed_by ? nameOf(sheet.confirmed_by) : null}
        dirty={dirty}
      />

      {/* ── Föy belgesi ── */}
      <div className="stagger-children space-y-3 rounded-2xl border border-line-strong bg-surface p-4 shadow-card sm:p-6">
        {/* Başlık şeridi. Aslı Hanım (2026-08-19): "Şu Aslı Filinta'yı yazma
            böyle… Logoya gerek yok kendi iç üretimimizde güzelim." — marka
            kimliği çıkarıldı; şerit yalnız belgenin adını taşır. Sağda ürün
            kodu, çıktıda sayfayı tanımlayan tek işaret olarak durur. */}
        <div className="flex items-center justify-between gap-3 rounded-xl bg-ink px-5 py-3">
          <div className="flex items-center gap-2.5 text-white">
            <ClipboardList size={19} />
            <span className="text-[15px] font-bold uppercase tracking-[0.18em]">Üretim Föyü</span>
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
                  "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] transition-colors duration-150",
                  on
                    ? "border-brand font-semibold text-ink"
                    : "border-transparent font-medium text-muted hover:border-line-strong hover:text-ink",
                )}
              >
                <t.icon size={14} />
                {t.label}
                {eksik > 0 && (
                  <span
                    className="grid h-4 min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[10px] font-bold tabular-nums text-white"
                    title={`${eksik} zorunlu alan eksik`}
                  >
                    {eksik}
                  </span>
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
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Ürün bilgileri — 2 kolon (Excel'deki gibi) */}
        {/* TEK ızgara, iki kolon: alanlar satır satır akar, sütunların boyu
            farklı olduğu için altta BOŞLUK oluşmaz. Aslı Hanım (2026-08-19):
            "Hiçbir şey boş kalmasın… hiçbir yerde boşluk istemiyorum." */}
        <div className="grid grid-cols-1 gap-x-5 gap-y-2 rounded-lg border border-line p-3 md:grid-cols-2">
          <LabeledField label="Föy başlığı *" value={form.title} onChange={(v) => set("title", v)} placeholder="Beyaz Dantel Etek" />
          <LabeledField label="Üretim tarihi" value={form.production_date ?? ""} onChange={(v) => set("production_date", v)} />
          <LabeledField label="Ürün kodu" value={form.product_code ?? ""} onChange={(v) => set("product_code", v)} />
          <LabeledField label="Teslim tarihi" value={form.delivery_date ?? ""} onChange={(v) => set("delivery_date", v)} placeholder="21.07.2026" />
          <LabeledField label="Ürün cinsi" value={form.product_kind ?? ""} onChange={(v) => set("product_kind", v)} placeholder="Etek" />
          {/* İkinci tarih — "Bir ürünlerin teslim tarihi, bir de dikim teslim
              tarihi lazım." */}
          <LabeledField label="Dikim teslim tarihi" value={form.sewing_delivery_date ?? ""} onChange={(v) => set("sewing_delivery_date", v)} placeholder="14.07.2026" />
          {/* ÜRETİCİ — artık serbest metin değil, gerçek usta kaydı.
              Aslı Hanım (2026-08-19): "Cihan Usta, Hakan Usta… ona gireceksin,
              hangi ürünler orada dikiliyor." Serbest metinken Ödeme Tablosu
              "Hakan Günaydın" ile "Hakan usta"yı iki ayrı usta sayıyordu.
              Liste boşsa (tablo migrate edilmemiş) eski metin alanına düşer —
              föy her hâlükârda açılır. */}
          {manufacturers.length > 0 ? (
            <label className="flex items-center gap-2">
              <span className="w-40 shrink-0 text-[11.5px] font-semibold uppercase tracking-wide text-muted">Üretici</span>
              <select
                className={inputCls}
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
              </select>
            </label>
          ) : (
            <LabeledField label="Üretici" value={form.producer ?? ""} onChange={(v) => set("producer", v)} />
          )}
          <LabeledField label="Sezon" value={form.season ?? ""} onChange={(v) => set("season", v)} placeholder="2026 RESORT" />
          {/* Koleksiyon kategorisi — web nav yapısı (One-of-a-Kind / Ready to Wear …) */}
          <label className="flex items-center gap-2">
            <span className="w-40 shrink-0 text-[11.5px] font-semibold uppercase tracking-wide text-muted">Kategori</span>
            <select
              className={inputCls}
              value={form.category ?? ""}
              onChange={(e) => {
                const next = (e.target.value || null) as ProductionCategory | null;
                // Kategori değişince geçersiz alt kategoriyi temizle.
                const validSubs = subcategoriesOf(next).map((s) => s.key);
                setDirty(true);
                setForm((f) => ({
                  ...f,
                  category: next,
                  subcategory: validSubs.includes(f.subcategory ?? "") ? f.subcategory : "",
                }));
              }}
            >
              <option value="">Seçiniz…</option>
              {COLLECTION_TAXONOMY.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="w-40 shrink-0 text-[11.5px] font-semibold uppercase tracking-wide text-muted">Alt kategori</span>
            <select
              className={cn(inputCls, subcategoriesOf(form.category).length === 0 && "opacity-50")}
              value={form.subcategory ?? ""}
              onChange={(e) => set("subcategory", e.target.value)}
              disabled={subcategoriesOf(form.category).length === 0}
            >
              <option value="">{subcategoriesOf(form.category).length === 0 ? "—" : "Seçiniz…"}</option>
              {subcategoriesOf(form.category).map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </label>
          <LabeledField label="1 ürüne giden metraj" value={form.meterage ?? ""} onChange={(v) => set("meterage", v)} placeholder="1.60 CM" />
          <label className="md:col-span-2 flex items-start gap-2">
            <span className="w-40 shrink-0 pt-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-muted">Ürünün açıklaması</span>
            <TextArea value={form.description ?? ""} onChange={(v) => set("description", v)} rows={2} />
          </label>
        </div>

        {/* TEKNİK ÇİZİM — sağ üst köşe, ÖN ve ARKA yan yana. */}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          <Section title="Teknik Çizim — Ön">
            <ImageUploader sheetId={sheetId} section="technical_drawing_front" images={form.photo_refs} onChange={handleImagesChange} variant="drawing" />
          </Section>
          <Section title="Teknik Çizim — Arka">
            <ImageUploader sheetId={sheetId} section="technical_drawing_back" images={form.photo_refs} onChange={handleImagesChange} variant="drawing" />
          </Section>
        </div>
      </div>
      </>)}

      {tab === "olcu" && (<>
        {/* ÖLÇÜLER — Excel gibi çizgili ızgara, numaralar OTOMATİK.
            Aslı Hanım (2026-08-19): "Bunların Excel gibi çizgi çizgi kare kare
            olması… hiçbir boş hücre kalmaması. Mesela üç numara niye boş?"
            Sıra numarası artık elle yazılmıyor → hiçbir numara boş kalamaz. */}
        <Section title="Ölçüler (cm)">
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
                  <th className="border border-line-strong px-1 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-subtle">No</th>
                  <th className="border border-line-strong px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-subtle">Ölçü</th>
                  <th className="border border-line-strong px-1 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-subtle">cm</th>
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
                      <input className="w-full bg-transparent px-2 py-1.5 text-[13px] text-ink focus:bg-surface focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-ring" value={row.label} onChange={(e) => updateMeasurement(i, { label: e.target.value })} placeholder="Ölçü adı" />
                    </td>
                    <td className="border border-line p-0">
                      <input className="w-full bg-transparent px-1 py-1.5 text-center tabular-nums text-ink focus:bg-surface focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-ring" value={row.value} onChange={(e) => updateMeasurement(i, { value: e.target.value })} />
                    </td>
                    <td className="text-center align-middle">
                      <button onClick={() => removeMeasurement(i)} className="rounded-md p-1 text-subtle transition-colors duration-150 hover:bg-danger/10 hover:text-danger" title="Satırı sil"><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={addMeasurement} className="mt-2 -ml-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-medium text-brand transition-colors duration-150 hover:bg-brand-soft hover:text-brand-strong">
            <Plus size={12} /> Satır ekle
          </button>
        </Section>

        {/* BEDEN DAĞILIMI — sabit standart beden kolonları; hangisine istersen gir */}
        <Section title="Beden Dağılımı">
          <p className="mb-2.5 text-[12px] text-subtle">
            Tüm bedenler her zaman burada; yalnızca ürünün olan bedenlerine adet girin.
            <br />
            <b className="font-semibold text-muted">Grup</b> satırı ikili bedenleri
            eşler: XS-S <b>1</b>, M-L <b>2</b>, XL-XXL <b>3</b>, tek beden <b>OS</b>.
            Hücreye yazarak değiştirebilirsiniz.
          </p>
          {/* Hizalı, çizgili ızgara — sabit başlıklar + eşit genişlikte kutucuklar */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] table-fixed border-collapse overflow-hidden rounded-lg text-[13px]">
              <colgroup>
                <col className="w-36" />
                {sd.sizes.map((_, i) => <col key={i} />)}
                <col className="w-16" />
                <col className="w-9" />
              </colgroup>
              <thead>
                <tr className="bg-surface-muted">
                  <th className="border border-line-strong px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-subtle">Satır</th>
                  {sd.sizes.map((s, i) => (
                    <th key={i} className="border border-line-strong px-1 py-1.5 text-center text-[12px] font-semibold text-ink">
                      {s}
                    </th>
                  ))}
                  <th className="border border-line-strong px-1 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-subtle">Toplam</th>
                  <th className="w-9" />
                </tr>
                {/* BEDEN GRUBU — Aslı Hanım (2026-08-19): "Bedenlerin altına
                    o ürünün gibi bir sıra daha açacaksın. XSmall'la small'a 1,
                    medium'le large'a 2, XXlarge'a 3 diyeceksin. Bir de
                    hepsinin işaretli olduğu one size." Hücreler düzenlenebilir:
                    grubu değiştirmek tek tık. */}
                <tr className="bg-surface-sunken">
                  <th className="border border-line-strong px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-subtle">
                    Grup
                  </th>
                  {sd.sizes.map((size, i) => (
                    <th key={i} className="border border-line-strong p-0">
                      <input
                        className="w-full bg-transparent px-1 py-1 text-center text-[12px] font-bold tabular-nums text-brand-strong focus:bg-surface focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-ring"
                        value={sd.groups?.[size] ?? ""}
                        onChange={(e) => setSizeGroup(size, e.target.value)}
                        placeholder="—"
                        maxLength={8}
                        title={`${size} bedeninin grubu`}
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
                      <input className="w-full bg-transparent px-2 py-1.5 text-[13px] font-medium text-ink focus:bg-surface focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-ring" value={row.label} onChange={(e) => setDistLabel(ri, e.target.value)} placeholder="Satır adı" />
                    </td>
                    {sd.sizes.map((_, ci) => (
                      <td key={ci} className="border border-line p-0">
                        <input className="w-full bg-transparent px-1 py-1.5 text-center tabular-nums text-ink focus:bg-surface focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-ring" value={row.values[ci] ?? ""} onChange={(e) => setDistCell(ri, ci, e.target.value)} inputMode="numeric" />
                      </td>
                    ))}
                    <td className="border border-line p-0">
                      <input className="w-full bg-transparent px-1 py-1.5 text-center font-semibold tabular-nums text-ink focus:bg-surface focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-ring" value={row.total} onChange={(e) => setDistTotal(ri, e.target.value)} placeholder="—" inputMode="numeric" />
                    </td>
                    <td className="text-center align-middle">
                      <button onClick={() => removeDistRow(ri)} className="rounded-md p-1 text-subtle transition-colors duration-150 hover:bg-danger/10 hover:text-danger" title="Satırı sil"><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={addDistRow} className="mt-2 -ml-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-medium text-brand transition-colors duration-150 hover:bg-brand-soft hover:text-brand-strong">
            <Plus size={12} /> Satır ekle
          </button>
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
                  <th className="border border-line-strong px-1 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-subtle">No</th>
                  <th className="border border-line-strong px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-subtle">Ürün</th>
                  <th className="border border-line-strong px-1 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-subtle">Adet</th>
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
                      <input className="w-full bg-transparent px-2 py-1.5 text-[13px] text-ink focus:bg-surface focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-ring" value={row.label} onChange={(e) => updateDelivered(i, { label: e.target.value })} placeholder="Ürün (ör. Karton Etiket)" />
                    </td>
                    <td className="border border-line p-0">
                      <input className="w-full bg-transparent px-1 py-1.5 text-center tabular-nums text-ink focus:bg-surface focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-ring" value={row.qty} onChange={(e) => updateDelivered(i, { qty: e.target.value })} inputMode="numeric" />
                    </td>
                    <td className="text-center align-middle">
                      <button onClick={() => removeDelivered(i)} className="rounded-md p-1 text-subtle transition-colors duration-150 hover:bg-danger/10 hover:text-danger" title="Satırı sil"><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={addDelivered} className="mt-2 -ml-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-medium text-brand transition-colors duration-150 hover:bg-brand-soft hover:text-brand-strong">
            <Plus size={12} /> Satır ekle
          </button>
        </Section>
      </>)}

      {tab === "maliyet" && (<>
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
            const unitCost = items.reduce((a, it) => a + parseMoney(it.amount), 0);
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
                        <th className="border border-line-strong px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-subtle">Maliyet kalemi</th>
                        <th className="border border-line-strong px-2 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-subtle">Birim (₺)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, i) => (
                        <tr key={`${it.key}-${i}`}>
                          <td className="border border-line px-2 py-1.5">
                            {it.key === "diger" ? (
                              <input
                                className="w-full bg-transparent text-[13px] text-ink focus:outline-none"
                                value={it.label ?? ""}
                                onChange={(e) => setItem(i, { label: e.target.value })}
                                placeholder="Diğer gider adı"
                              />
                            ) : (
                              <span className="font-medium text-ink">{costItemLabel(it)}</span>
                            )}
                          </td>
                          <td className="border border-line p-0">
                            <input
                              className="w-full bg-transparent px-2 py-1.5 text-right tabular-nums text-ink focus:bg-surface focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-ring"
                              value={it.amount}
                              onChange={(e) => setItem(i, { amount: e.target.value })}
                              inputMode="decimal"
                              placeholder="—"
                            />
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-surface-muted">
                        <td className="border border-line-strong px-2 py-1.5 text-[12px] font-bold uppercase tracking-wide text-ink">
                          Birim maliyet
                        </td>
                        <td className="border border-line-strong px-2 py-1.5 text-right text-[13px] font-bold tabular-nums text-ink">
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

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2 text-[13px]">
                  <span className="text-muted">
                    Toplam adet: <span className="font-semibold tabular-nums text-ink">{qty || "—"}</span>
                    <span className="mx-1.5 text-subtle">×</span>
                    Birim maliyet: <span className="font-semibold tabular-nums text-ink">{formatMoney(unitCost)}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    {margin !== null && (
                      <span className={cn("font-semibold tabular-nums", margin >= 0 ? "text-success" : "text-danger")}>
                        Kâr marjı: %{margin.toFixed(0)}
                      </span>
                    )}
                    <span className="font-bold tabular-nums text-ink">
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
              <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-muted">Kumaş bilgisi (cinsi, desen yönü, pantone, gramaj…)</span>
              <TextArea value={form.fabric_info ?? ""} onChange={(v) => set("fabric_info", v)} rows={2} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-muted">Aksesuarlar bilgisi (çıtçıt, düğme, kopça, taş, boncuk, etiket…)</span>
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
              <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-muted">Özel işçilik notları</span>
              <TextArea value={form.workmanship_notes ?? ""} onChange={(v) => set("workmanship_notes", v)} rows={2} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-muted">Kalite kontrol revizyon tarihi</span>
              <TextArea value={form.qc_revision ?? ""} onChange={(v) => set("qc_revision", v)} rows={2} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-muted">Revizyon notları</span>
              <TextArea value={form.revision_notes ?? ""} onChange={(v) => set("revision_notes", v)} rows={2} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-muted">Üretim fire payı</span>
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

      {/* Durum — sekmeden bağımsız, föyün kimliğine ait; her sekmede altta durur. */}
      {tab === "urun" && isAdmin && !isNew && (
          <Section title="Durum">
            <label className="block max-w-xs">
              <select
                className={inputCls}
                value={form.status}
                onChange={(e) => set("status", e.target.value as ProductionSheetInput["status"])}
              >
                <option value="draft">Taslak</option>
                <option value="active">Aktif</option>
                <option value="archived">Arşiv</option>
              </select>
            </label>
          </Section>
        )}
      </div>
    </div>
  );
}
