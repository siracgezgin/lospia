"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import {
  ClipboardList, ArrowLeft, Plus, Trash2, Save, User, Clock, Loader2,
} from "lucide-react";
import {
  createProductionSheet, updateProductionSheet,
  type ProductionSheetInput,
} from "@/lib/actions/production";
import { cn } from "@/lib/utils/cn";
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
    measurements: [{ no: "1", label: "", value: "" }],
    delivered_items: [{ no: "1", label: "", qty: "" }],
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

// ── Shared field primitives ──────────────────────────────────────────────────
const inputCls =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-brand-ring focus:border-brand-ring";

function Field({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (_v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-medium uppercase tracking-wide text-subtle">{label}</span>
      <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function TextArea({
  label, value, onChange, placeholder, rows = 3,
}: { label: string; value: string; onChange: (_v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-medium uppercase tracking-wide text-subtle">{label}</span>
      <textarea
        className={cn(inputCls, "resize-y leading-relaxed")}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-wide text-brand-strong">{title}</h2>
      {children}
    </section>
  );
}

export function ProductionSheetEditor({ sheet, memberNames, isAdmin }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<ProductionSheetInput>(() => (sheet ? fromSheet(sheet) : emptyState()));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();

  const isNew = sheet === null;
  const set = <K extends keyof ProductionSheetInput>(key: K, value: ProductionSheetInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const nameOf = (id: string | null) => (id && memberNames[id]) || "—";
  const relTime = (iso: string) => {
    try { return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: tr }); } catch { return ""; }
  };

  // ── Ölçüler ──
  function updateMeasurement(i: number, patch: Partial<MeasurementRow>) {
    set("measurements", form.measurements.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addMeasurement() {
    set("measurements", [...form.measurements, { no: String(form.measurements.length + 1), label: "", value: "" }]);
  }
  function removeMeasurement(i: number) {
    set("measurements", form.measurements.filter((_, idx) => idx !== i));
  }

  // ── Teslim edilen ürünler ──
  function updateDelivered(i: number, patch: Partial<DeliveredItemRow>) {
    set("delivered_items", form.delivered_items.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addDelivered() {
    set("delivered_items", [...form.delivered_items, { no: String(form.delivered_items.length + 1), label: "", qty: "" }]);
  }
  function removeDelivered(i: number) {
    set("delivered_items", form.delivered_items.filter((_, idx) => idx !== i));
  }

  // ── Beden dağılımı ──
  const sd = form.size_distribution;
  function setSizeHeader(i: number, v: string) {
    set("size_distribution", { ...sd, sizes: sd.sizes.map((s, idx) => (idx === i ? v : s)) });
  }
  function setDistCell(rowIdx: number, colIdx: number, v: string) {
    set("size_distribution", {
      ...sd,
      rows: sd.rows.map((r, ri) =>
        ri === rowIdx ? { ...r, values: r.values.map((val, ci) => (ci === colIdx ? v : val)) } : r,
      ),
    });
  }
  function setDistLabel(rowIdx: number, v: string) {
    set("size_distribution", { ...sd, rows: sd.rows.map((r, ri) => (ri === rowIdx ? { ...r, label: v } : r)) });
  }
  function setDistTotal(rowIdx: number, v: string) {
    set("size_distribution", { ...sd, rows: sd.rows.map((r, ri) => (ri === rowIdx ? { ...r, total: v } : r)) });
  }
  function addDistRow() {
    set("size_distribution", {
      ...sd,
      rows: [...sd.rows, { label: "", values: sd.sizes.map(() => ""), total: "" }],
    });
  }
  function removeDistRow(rowIdx: number) {
    set("size_distribution", { ...sd, rows: sd.rows.filter((_, ri) => ri !== rowIdx) });
  }

  function handleSave() {
    setError(null);
    if (!form.title.trim()) {
      setError("Föy başlığı (ürün adı) gerekli.");
      return;
    }
    startSave(async () => {
      const res = isNew
        ? await createProductionSheet(form)
        : await updateProductionSheet(sheet!.id, form);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      if (isNew && "id" in res) {
        router.replace(`/production/${res.id}`);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/production" className="mb-2 inline-flex items-center gap-1 text-[12.5px] text-subtle hover:text-ink">
            <ArrowLeft size={13} /> Üretim Föyleri
          </Link>
          <div className="flex items-center gap-2">
            <ClipboardList size={20} className="shrink-0 text-brand" />
            <h1 className="text-lg font-semibold text-ink">
              {isNew ? "Yeni Üretim Föyü" : form.title || "Üretim Föyü"}
            </h1>
          </div>
          {!isNew && sheet && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-subtle">
              <span className="flex items-center gap-1">
                <User size={11} /> Oluşturan: <span className="font-medium text-muted">{nameOf(sheet.created_by)}</span>
              </span>
              <span className="flex items-center gap-1">
                <Clock size={11} /> Son giren: <span className="font-medium text-muted">{nameOf(sheet.updated_by)}</span> · {relTime(sheet.updated_at)}
              </span>
            </div>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
        >
          {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {isNew ? "Föyü oluştur" : "Kaydet"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Ürün bilgileri */}
        <SectionCard title="Ürün Bilgileri">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Föy başlığı (ürün adı) *" value={form.title} onChange={(v) => set("title", v)} placeholder="Beyaz Dantel Etek" />
            <Field label="Ürün kodu" value={form.product_code ?? ""} onChange={(v) => set("product_code", v)} />
            <Field label="Ürün cinsi" value={form.product_kind ?? ""} onChange={(v) => set("product_kind", v)} placeholder="Etek / Şalvar / Yelek" />
            <Field label="Üretici" value={form.producer ?? ""} onChange={(v) => set("producer", v)} />
            <Field label="Sezon" value={form.season ?? ""} onChange={(v) => set("season", v)} placeholder="2026 RESORT" />
            <Field label="1 ürüne giden metraj" value={form.meterage ?? ""} onChange={(v) => set("meterage", v)} placeholder="1.60 CM" />
            <Field label="Üretim tarihi" value={form.production_date ?? ""} onChange={(v) => set("production_date", v)} />
            <Field label="Teslim tarihi" value={form.delivery_date ?? ""} onChange={(v) => set("delivery_date", v)} placeholder="21.07.2026" />
          </div>
          <div className="mt-3">
            <TextArea label="Ürünün açıklaması" value={form.description ?? ""} onChange={(v) => set("description", v)} rows={2} />
          </div>
        </SectionCard>

        {/* Ölçüler */}
        <SectionCard title="Ölçüler (cm)">
          <div className="space-y-2">
            {form.measurements.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className={cn(inputCls, "w-12 text-center")} value={row.no} onChange={(e) => updateMeasurement(i, { no: e.target.value })} placeholder="No" />
                <input className={cn(inputCls, "flex-1")} value={row.label} onChange={(e) => updateMeasurement(i, { label: e.target.value })} placeholder="Ölçü adı (ör. Medium Bel)" />
                <input className={cn(inputCls, "w-28")} value={row.value} onChange={(e) => updateMeasurement(i, { value: e.target.value })} placeholder="74 cm" />
                <button onClick={() => removeMeasurement(i)} className="shrink-0 rounded-md p-1.5 text-subtle hover:bg-surface-muted hover:text-red-600" title="Satırı sil">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={addMeasurement} className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand hover:text-brand-strong">
            <Plus size={13} /> Satır ekle
          </button>
        </SectionCard>

        {/* Teslim edilen ürünler */}
        <SectionCard title="Teslim Edilen Ürünler">
          <div className="space-y-2">
            {form.delivered_items.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className={cn(inputCls, "w-12 text-center")} value={row.no} onChange={(e) => updateDelivered(i, { no: e.target.value })} placeholder="No" />
                <input className={cn(inputCls, "flex-1")} value={row.label} onChange={(e) => updateDelivered(i, { label: e.target.value })} placeholder="Ürün (ör. Karton Etiket)" />
                <input className={cn(inputCls, "w-28")} value={row.qty} onChange={(e) => updateDelivered(i, { qty: e.target.value })} placeholder="Adet" />
                <button onClick={() => removeDelivered(i)} className="shrink-0 rounded-md p-1.5 text-subtle hover:bg-surface-muted hover:text-red-600" title="Satırı sil">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={addDelivered} className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand hover:text-brand-strong">
            <Plus size={13} /> Satır ekle
          </button>
        </SectionCard>

        {/* Beden dağılımı */}
        <SectionCard title="Beden Dağılımı">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr>
                  <th className="min-w-[140px] p-1 text-left" />
                  {sd.sizes.map((s, i) => (
                    <th key={i} className="p-1">
                      <input
                        className={cn(inputCls, "w-14 px-1 text-center font-semibold")}
                        value={s}
                        onChange={(e) => setSizeHeader(i, e.target.value)}
                      />
                    </th>
                  ))}
                  <th className="p-1">
                    <span className="block w-16 text-center text-[11px] font-semibold uppercase text-subtle">Toplam</span>
                  </th>
                  <th className="w-8 p-1" />
                </tr>
              </thead>
              <tbody>
                {sd.rows.map((row, ri) => (
                  <tr key={ri}>
                    <td className="p-1">
                      <input className={cn(inputCls, "px-2")} value={row.label} onChange={(e) => setDistLabel(ri, e.target.value)} placeholder="Satır adı" />
                    </td>
                    {sd.sizes.map((_, ci) => (
                      <td key={ci} className="p-1">
                        <input
                          className={cn(inputCls, "w-14 px-1 text-center")}
                          value={row.values[ci] ?? ""}
                          onChange={(e) => setDistCell(ri, ci, e.target.value)}
                        />
                      </td>
                    ))}
                    <td className="p-1">
                      <input className={cn(inputCls, "w-16 px-1 text-center font-medium")} value={row.total} onChange={(e) => setDistTotal(ri, e.target.value)} />
                    </td>
                    <td className="p-1">
                      <button onClick={() => removeDistRow(ri)} className="rounded-md p-1.5 text-subtle hover:bg-surface-muted hover:text-red-600" title="Satırı sil">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={addDistRow} className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand hover:text-brand-strong">
            <Plus size={13} /> Satır ekle
          </button>
        </SectionCard>

        {/* Kumaş & talimatlar */}
        <SectionCard title="Kumaş, Astar ve Talimatlar">
          <div className="space-y-3">
            <TextArea label="Yıkama talimatı" value={form.wash_instruction ?? ""} onChange={(v) => set("wash_instruction", v)} rows={2} />
            <TextArea label="Kumaş / Astar" value={form.fabric_lining ?? ""} onChange={(v) => set("fabric_lining", v)} rows={2} />
            <TextArea label="Kumaş bilgisi (cinsi, desen yönü, pantone, gramaj…)" value={form.fabric_info ?? ""} onChange={(v) => set("fabric_info", v)} rows={2} />
            <TextArea label="Aksesuarlar bilgisi (çıtçıt, düğme, kopça, taş…)" value={form.accessories_info ?? ""} onChange={(v) => set("accessories_info", v)} rows={2} />
            <TextArea label="Süslemeler ve aksesuar açıklaması" value={form.embellishments ?? ""} onChange={(v) => set("embellishments", v)} rows={2} />
            <TextArea label="Dikiş talimatı" value={form.sewing_instruction ?? ""} onChange={(v) => set("sewing_instruction", v)} rows={4} />
            <TextArea label="Özel işçilik notları" value={form.workmanship_notes ?? ""} onChange={(v) => set("workmanship_notes", v)} rows={3} />
          </div>
        </SectionCard>

        {/* Kalite kontrol & üretim */}
        <SectionCard title="Kalite Kontrol ve Üretim Notları">
          <div className="space-y-3">
            <TextArea label="Kalite kontrol revizyon tarihi" value={form.qc_revision ?? ""} onChange={(v) => set("qc_revision", v)} rows={2} />
            <TextArea label="Revizyon notları" value={form.revision_notes ?? ""} onChange={(v) => set("revision_notes", v)} rows={2} />
            <TextArea label="Üretim fire payı" value={form.production_waste ?? ""} onChange={(v) => set("production_waste", v)} rows={2} />
          </div>
        </SectionCard>

        {isAdmin && !isNew && (
          <SectionCard title="Durum">
            <label className="block max-w-xs">
              <span className="mb-1 block text-[11.5px] font-medium uppercase tracking-wide text-subtle">Föy durumu</span>
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
          </SectionCard>
        )}
      </div>

      <div className="mt-5 flex justify-end">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
        >
          {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {isNew ? "Föyü oluştur" : "Kaydet"}
        </button>
      </div>
    </div>
  );
}
