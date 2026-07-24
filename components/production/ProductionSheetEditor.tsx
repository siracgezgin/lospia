"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import {
  ClipboardList, ArrowLeft, Plus, Trash2, Save, User, Clock, Loader2, FileDown,
} from "lucide-react";
import {
  createProductionSheet, updateProductionSheet, updateProductionSheetImages,
  type ProductionSheetInput,
} from "@/lib/actions/production";
import { cn } from "@/lib/utils/cn";
import { ImageUploader } from "./ImageUploader";
import type {
  ProductionSheet, MeasurementRow, DeliveredItemRow, SizeDistribution,
} from "@/types";

interface Props {
  sheet: ProductionSheet | null;
  memberNames: Record<string, string>;
  isAdmin: boolean;
}

const DEFAULT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

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
      sizes: [...DEFAULT_SIZES],
      rows: [
        { label: "Beden etiketi", values: DEFAULT_SIZES.map(() => ""), total: "" },
        { label: "Üretim adeti", values: DEFAULT_SIZES.map(() => ""), total: "" },
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
  };
}

function fromSheet(s: ProductionSheet): ProductionSheetInput {
  const sd: SizeDistribution =
    s.size_distribution && Array.isArray(s.size_distribution.sizes) && s.size_distribution.sizes.length
      ? s.size_distribution
      : { sizes: [...DEFAULT_SIZES], rows: [] };
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

export function ProductionSheetEditor({ sheet, memberNames, isAdmin }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<ProductionSheetInput>(() => (sheet ? fromSheet(sheet) : emptyState()));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();

  const isNew = sheet === null;
  const sheetId = sheet?.id ?? "new";
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

  // ── Beden dağılımı ──
  const sd = form.size_distribution;
  const setSizeHeader = (i: number, v: string) =>
    set("size_distribution", { ...sd, sizes: sd.sizes.map((s, idx) => (idx === i ? v : s)) });
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
    if (!form.title.trim()) { setError("Föy başlığı (ürün adı) gerekli."); return; }
    startSave(async () => {
      const res = isNew ? await createProductionSheet(form) : await updateProductionSheet(sheet!.id, form);
      if ("error" in res) { setError(res.error); return; }
      if (isNew && "id" in res) router.replace(`/production/${res.id}`);
      else router.refresh();
    });
  }

  const SaveBtn = (
    <button
      onClick={handleSave}
      disabled={isSaving}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
    >
      {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
      {isNew ? "Föyü oluştur" : "Kaydet"}
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Üst bar */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/production" className="mb-2 inline-flex items-center gap-1 text-[12.5px] text-subtle hover:text-ink">
            <ArrowLeft size={13} /> Üretim Föyleri
          </Link>
          {!isNew && sheet && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-subtle">
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
          {!isNew && sheet && (
            <a
              href={`/production/${sheet.id}/export`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-surface-muted hover:text-ink"
              title="Föyü Excel (.xlsx) olarak indir"
            >
              <FileDown size={15} /> Excel indir
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
      <div className="space-y-3 rounded-xl border border-line-strong bg-surface p-4 shadow-card sm:p-5">
        {/* Başlık şeridi */}
        <div className="flex items-center justify-between gap-3 rounded-lg bg-ink px-4 py-2.5">
          <div className="flex items-center gap-2 text-white">
            <ClipboardList size={18} />
            <span className="text-[15px] font-bold uppercase tracking-[0.18em]">Üretim Föyü</span>
          </div>
          <span className="text-[12px] font-medium text-white/70">aslıfilinta</span>
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
          <label className="md:col-span-2 flex items-start gap-2">
            <span className="w-40 shrink-0 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Ürünün açıklaması</span>
            <TextArea value={form.description ?? ""} onChange={(v) => set("description", v)} rows={2} />
          </label>
        </div>

        {/* ÖLÇÜLER (sol) + TEKNİK ÇİZİM (sağ) */}
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

        {/* BEDEN DAĞILIMI */}
        <Section title="Beden Dağılımı">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr>
                  <th className="min-w-[130px] p-1 text-left" />
                  {sd.sizes.map((s, i) => (
                    <th key={i} className="p-1">
                      <input className={cn(inputCls, "w-12 px-1 text-center font-semibold")} value={s} onChange={(e) => setSizeHeader(i, e.target.value)} />
                    </th>
                  ))}
                  <th className="p-1"><span className="block w-16 text-center text-[10.5px] font-bold uppercase text-subtle">Toplam</span></th>
                  <th className="w-7 p-1" />
                </tr>
              </thead>
              <tbody>
                {sd.rows.map((row, ri) => (
                  <tr key={ri}>
                    <td className="p-1"><input className={cn(inputCls, "px-2")} value={row.label} onChange={(e) => setDistLabel(ri, e.target.value)} placeholder="Satır adı" /></td>
                    {sd.sizes.map((_, ci) => (
                      <td key={ci} className="p-1"><input className={cn(inputCls, "w-12 px-1 text-center")} value={row.values[ci] ?? ""} onChange={(e) => setDistCell(ri, ci, e.target.value)} /></td>
                    ))}
                    <td className="p-1"><input className={cn(inputCls, "w-16 px-1 text-center font-medium")} value={row.total} onChange={(e) => setDistTotal(ri, e.target.value)} /></td>
                    <td className="p-1"><button onClick={() => removeDistRow(ri)} className="rounded p-1 text-subtle hover:text-red-600" title="Sil"><Trash2 size={12} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={addDistRow} className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:text-brand-strong">
            <Plus size={12} /> Satır ekle
          </button>
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

      <div className="mt-4 flex justify-end">{SaveBtn}</div>
    </div>
  );
}
