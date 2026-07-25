"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import {
  ClipboardList, ArrowLeft, Plus, Trash2, Save, User, Clock, Loader2, FileDown,
  CheckCircle2,
} from "lucide-react";
import {
  createProductionSheet, updateProductionSheet, updateProductionSheetImages,
  deleteProductionSheet,
  type ProductionSheetInput,
} from "@/lib/actions/production";
import { cn } from "@/lib/utils/cn";
import { ImageUploader } from "./ImageUploader";
import { COLLECTION_TAXONOMY, subcategoriesOf } from "@/lib/collection/taxonomy";
import {
  totalQuantity, parseMoney, formatMoney, STANDARD_SIZES, normalizeToStandardSizes,
} from "@/lib/collection/cost";
import type {
  ProductionSheet, MeasurementRow, DeliveredItemRow, SizeDistribution, ProductionCategory,
} from "@/types";

interface Props {
  sheet: ProductionSheet | null;
  memberNames: Record<string, string>;
  isAdmin: boolean;
  currentUserId: string;
}

// Beden kolonları artık her föyde sabit standart set (bkz. STANDARD_SIZES).

function emptyState(): ProductionSheetInput {
  return {
    title: "",
    status: "active",
    product_code: "",
    product_kind: "",
    producer: "",
    description: "",
    season: "",
    production_date: "",
    delivery_date: "",
    meterage: "",
    measurements: Array.from({ length: 4 }, (_, i) => ({ no: String(i + 1), label: "", value: "" })),
    delivered_items: Array.from({ length: 3 }, (_, i) => ({ no: String(i + 1), label: "", qty: "" })),
    size_distribution: {
      sizes: [...STANDARD_SIZES],
      rows: [
        { label: "Üretim adeti", values: STANDARD_SIZES.map(() => ""), total: "" },
      ],
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
    pricing: { unit_price: "", purchase_cost: "", web_sale_price: "", currency: "TL", notes: "" },
  };
}

function fromSheet(s: ProductionSheet): ProductionSheetInput {
  // Mevcut föyleri de sabit standart beden setine getir (değerler ada göre eşlenir).
  const sd: SizeDistribution = normalizeToStandardSizes(s.size_distribution);
  if (!sd.rows.length) sd.rows = [{ label: "Üretim adeti", values: sd.sizes.map(() => ""), total: "" }];
  return {
    title: s.title ?? "",
    status: s.status,
    product_code: s.product_code ?? "",
    product_kind: s.product_kind ?? "",
    producer: s.producer ?? "",
    description: s.description ?? "",
    season: s.season ?? "",
    production_date: s.production_date ?? "",
    delivery_date: s.delivery_date ?? "",
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
    },
  };
}

// ── Field primitives ─────────────────────────────────────────────────────────
const inputCls =
  "w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-brand-ring focus:border-brand-ring";

function LabeledField({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (_v: string) => void; placeholder?: string }) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-40 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
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
    <section className={cn("overflow-hidden rounded-lg border border-line-strong bg-surface", className)}>
      <div className="border-b border-line-strong bg-surface-muted px-3 py-1.5">
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-ink">{title}</h2>
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

export function ProductionSheetEditor({ sheet, memberNames, isAdmin, currentUserId }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<ProductionSheetInput>(() => (sheet ? fromSheet(sheet) : emptyState()));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSaving, startSave] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  const isNew = sheet === null;
  const sheetId = sheet?.id ?? "new";
  // Silme: admin her föyü; üye kendi oluşturduğu föyü siler (RLS de bunu uygular).
  const canDelete = !isNew && !!sheet && (isAdmin || sheet.created_by === currentUserId);
  const set = <K extends keyof ProductionSheetInput>(key: K, value: ProductionSheetInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

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
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
    >
      {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
      {isNew ? "Föyü oluştur" : "Kaydet"}
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
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
      <div className="sticky top-0 z-20 -mx-4 mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-app/85 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="min-w-0">
          <Link href="/collection" className="mb-1 inline-flex items-center gap-1 text-[12.5px] text-subtle transition-colors hover:text-ink">
            <ArrowLeft size={13} /> Koleksiyon
          </Link>
          {!isNew && sheet && (
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11.5px] text-subtle">
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium text-muted transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
              title="Föyü sil"
            >
              {isDeleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              <span className="hidden sm:inline">Sil</span>
            </button>
          )}
          {!isNew && sheet && (
            <a
              href={`/production/${sheet.id}/export`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-muted hover:text-ink"
              title="Föyü Excel (.xlsx) olarak indir"
            >
              <FileDown size={15} /> <span className="hidden sm:inline">Excel indir</span>
            </a>
          )}
          {SaveBtn}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{error}</div>
      )}
      {imgError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">Görsel kaydedilemedi: {imgError}</div>
      )}

      {/* ── Föy belgesi ── */}
      <div className="space-y-3 rounded-2xl border border-line-strong bg-surface p-4 shadow-card sm:p-6">
        {/* Başlık şeridi — solda başlık, sağda AF logosu (koyu band → beyaz logo) */}
        <div className="flex items-center justify-between gap-3 rounded-xl bg-ink px-5 py-3">
          <div className="flex items-center gap-2.5 text-white">
            <ClipboardList size={19} />
            <span className="text-[15px] font-bold uppercase tracking-[0.18em]">Üretim Föyü</span>
          </div>
          <img
            src="/brands/asli-filinta-logo.png"
            alt="Aslı Filinta"
            className="h-9 w-auto select-none object-contain opacity-95 [filter:brightness(0)_invert(1)]"
            draggable={false}
          />
        </div>

        {/* Ürün bilgileri — 2 kolon (Excel'deki gibi) */}
        <div className="grid grid-cols-1 gap-x-5 gap-y-2 rounded-lg border border-line-strong p-3 md:grid-cols-2">
          <div className="space-y-2">
            <LabeledField label="Föy başlığı *" value={form.title} onChange={(v) => set("title", v)} placeholder="Beyaz Dantel Etek" />
            <LabeledField label="Ürün kodu" value={form.product_code ?? ""} onChange={(v) => set("product_code", v)} />
            <LabeledField label="Ürün cinsi" value={form.product_kind ?? ""} onChange={(v) => set("product_kind", v)} placeholder="Etek" />
            <LabeledField label="Üretici" value={form.producer ?? ""} onChange={(v) => set("producer", v)} />
          </div>
          <div className="space-y-2">
            <LabeledField label="Üretim tarihi" value={form.production_date ?? ""} onChange={(v) => set("production_date", v)} />
            <LabeledField label="Teslim tarihi" value={form.delivery_date ?? ""} onChange={(v) => set("delivery_date", v)} placeholder="21.07.2026" />
            <LabeledField label="Sezon" value={form.season ?? ""} onChange={(v) => set("season", v)} placeholder="2026 RESORT" />
            <LabeledField label="1 ürüne giden metraj" value={form.meterage ?? ""} onChange={(v) => set("meterage", v)} placeholder="1.60 CM" />
          </div>
          {/* Koleksiyon kategorisi — web nav yapısı (One-of-a-Kind / Ready to Wear …) */}
          <label className="flex items-center gap-2">
            <span className="w-40 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted">Kategori</span>
            <select
              className={inputCls}
              value={form.category ?? ""}
              onChange={(e) => {
                const next = (e.target.value || null) as ProductionCategory | null;
                // Kategori değişince geçersiz alt kategoriyi temizle.
                const validSubs = subcategoriesOf(next).map((s) => s.key);
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
            <span className="w-40 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted">Alt kategori</span>
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
          <label className="md:col-span-2 flex items-start gap-2">
            <span className="w-40 shrink-0 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Ürünün açıklaması</span>
            <TextArea value={form.description ?? ""} onChange={(v) => set("description", v)} rows={2} />
          </label>
        </div>

        {/* ÖLÇÜLER (sol) + TEKNİK ÇİZİM (sağ) — Excel'deki gibi yan yana */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Section title="Ölçüler (cm)">
            <div className="space-y-1.5">
              {form.measurements.map((row, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input className={cn(inputCls, "w-10 px-1 text-center")} value={row.no} onChange={(e) => updateMeasurement(i, { no: e.target.value })} />
                  <input className={cn(inputCls, "flex-1")} value={row.label} onChange={(e) => updateMeasurement(i, { label: e.target.value })} placeholder="Ölçü adı" />
                  <input className={cn(inputCls, "w-20 text-center")} value={row.value} onChange={(e) => updateMeasurement(i, { value: e.target.value })} placeholder="cm" />
                  <button onClick={() => removeMeasurement(i)} className="shrink-0 rounded p-1 text-subtle hover:text-red-600" title="Sil"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
            <button onClick={addMeasurement} className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:text-brand-strong">
              <Plus size={12} /> Satır ekle
            </button>
          </Section>

          <Section title="Teknik Çizim">
            <ImageUploader sheetId={sheetId} section="technical_drawing" images={form.photo_refs} onChange={handleImagesChange} variant="drawing" />
          </Section>
        </div>

        {/* TESLİM EDİLEN ÜRÜNLER */}
        <Section title="Teslim Edilen Ürünler">
          <div className="space-y-1.5">
            {form.delivered_items.map((row, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input className={cn(inputCls, "w-10 px-1 text-center")} value={row.no} onChange={(e) => updateDelivered(i, { no: e.target.value })} />
                <input className={cn(inputCls, "flex-1")} value={row.label} onChange={(e) => updateDelivered(i, { label: e.target.value })} placeholder="Ürün (ör. Karton Etiket)" />
                <input className={cn(inputCls, "w-24 text-center")} value={row.qty} onChange={(e) => updateDelivered(i, { qty: e.target.value })} placeholder="Adet" />
                <button onClick={() => removeDelivered(i)} className="shrink-0 rounded p-1 text-subtle hover:text-red-600" title="Sil"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
          <button onClick={addDelivered} className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:text-brand-strong">
            <Plus size={12} /> Satır ekle
          </button>
        </Section>

        {/* BEDEN DAĞILIMI — sabit standart beden kolonları; hangisine istersen gir */}
        <Section title="Beden Dağılımı">
          <p className="mb-2.5 text-[11.5px] text-subtle">
            Tüm bedenler her zaman burada; yalnızca ürünün olan bedenlerine adet girin.
          </p>
          {/* Hizalı, çizgili ızgara — sabit başlıklar + eşit genişlikte kutucuklar */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] table-fixed border-collapse overflow-hidden rounded-lg text-[12.5px]">
              <colgroup>
                <col className="w-36" />
                {sd.sizes.map((_, i) => <col key={i} />)}
                <col className="w-16" />
                <col className="w-9" />
              </colgroup>
              <thead>
                <tr className="bg-surface-muted">
                  <th className="border border-line-strong px-2 py-1.5 text-left text-[10.5px] font-bold uppercase tracking-wide text-subtle">Satır</th>
                  {sd.sizes.map((s, i) => (
                    <th key={i} className="border border-line-strong px-1 py-1.5 text-center text-[11.5px] font-bold text-ink">
                      {s}
                    </th>
                  ))}
                  <th className="border border-line-strong px-1 py-1.5 text-center text-[10.5px] font-bold uppercase tracking-wide text-subtle">Toplam</th>
                  <th className="w-9" />
                </tr>
              </thead>
              <tbody>
                {sd.rows.map((row, ri) => (
                  <tr key={ri}>
                    <td className="border border-line p-0">
                      <input className="w-full bg-transparent px-2 py-1.5 text-[12.5px] font-medium text-ink focus:bg-surface focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-ring" value={row.label} onChange={(e) => setDistLabel(ri, e.target.value)} placeholder="Satır adı" />
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
                      <button onClick={() => removeDistRow(ri)} className="rounded p-1 text-subtle hover:text-red-600" title="Satırı sil"><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={addDistRow} className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:text-brand-strong">
            <Plus size={12} /> Satır ekle
          </button>
        </Section>

        {/* MALİYET / FİYAT — her föy tek ürün; toplam adet beden dağılımından gelir */}
        <Section title="Maliyet / Fiyat">
          {(() => {
            const p = form.pricing;
            const qty = totalQuantity(form.size_distribution);
            const lineTotal = qty * parseMoney(p.unit_price);
            const setP = (patch: Partial<typeof p>) => set("pricing", { ...p, ...patch });
            return (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">
                  <LabeledField label="Birim fiyat (₺)" value={p.unit_price ?? ""} onChange={(v) => setP({ unit_price: v })} placeholder="500" />
                  <LabeledField label="Satın alma maliyeti (₺)" value={p.purchase_cost ?? ""} onChange={(v) => setP({ purchase_cost: v })} placeholder="birim malzeme maliyeti" />
                  <LabeledField label="Web satış fiyatı (₺)" value={p.web_sale_price ?? ""} onChange={(v) => setP({ web_sale_price: v })} placeholder="sitedeki satış fiyatı" />
                  <LabeledField label="Not" value={p.notes ?? ""} onChange={(v) => setP({ notes: v })} placeholder="KDV hariç, kargo vb." />
                </div>
                {/* Otomatik toplam üretim maliyeti — beden dağılımı toplam adedi × birim fiyat */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line-strong bg-surface-muted px-3 py-2 text-[12.5px]">
                  <span className="text-muted">
                    Toplam adet: <span className="font-semibold text-ink">{qty || "—"}</span>
                    <span className="mx-1.5 text-subtle">×</span>
                    Birim: <span className="font-semibold text-ink">{formatMoney(parseMoney(p.unit_price))}</span>
                  </span>
                  <span className="font-bold text-ink">
                    Üretim maliyeti: {formatMoney(lineTotal)}
                  </span>
                </div>
                <p className="text-[11px] text-subtle">
                  Bu fiyatlar Koleksiyon → Maliyet bölümünde de görünür; oradan değiştirilirse burada da güncellenir (tek kaynak).
                </p>
              </div>
            );
          })()}
        </Section>

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
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Kumaş bilgisi (cinsi, desen yönü, pantone, gramaj…)</span>
            <TextArea value={form.fabric_info ?? ""} onChange={(v) => set("fabric_info", v)} rows={2} />
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Aksesuarlar bilgisi (çıtçıt, düğme, kopça, taş, boncuk, etiket…)</span>
            <TextArea value={form.accessories_info ?? ""} onChange={(v) => set("accessories_info", v)} rows={2} />
          </label>
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
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Özel işçilik notları</span>
              <TextArea value={form.workmanship_notes ?? ""} onChange={(v) => set("workmanship_notes", v)} rows={2} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Kalite kontrol revizyon tarihi</span>
              <TextArea value={form.qc_revision ?? ""} onChange={(v) => set("qc_revision", v)} rows={2} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Revizyon notları</span>
              <TextArea value={form.revision_notes ?? ""} onChange={(v) => set("revision_notes", v)} rows={2} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Üretim fire payı</span>
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

        {isAdmin && !isNew && (
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
