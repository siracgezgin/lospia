"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Save, Pencil, EyeOff, Package } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { saveMaterial, deleteMaterial, type MaterialInput } from "@/lib/actions/materials";
import { formatMoney } from "@/lib/collection/cost";
import type { Material, MaterialCategory } from "@/types";

export type ManagerMaterial = Pick<
  Material,
  "id" | "code" | "name" | "category" | "supplier_id" | "composition"
  | "width_cm" | "unit" | "unit_price" | "currency" | "notes" | "is_active"
>;

interface Props {
  materials: ManagerMaterial[];
  suppliers: { id: string; name: string }[];
  /** Malzeme başına kaç föyün reçetesinde kullanıldığı. */
  usageCounts: Record<string, number>;
  canManage: boolean;
}

const CATEGORIES: { key: MaterialCategory; label: string }[] = [
  { key: "kumas", label: "Kumaş" },
  { key: "aksesuar", label: "Aksesuar" },
  { key: "fermuar", label: "Fermuar" },
  { key: "tela", label: "Tela" },
  { key: "iplik", label: "İplik" },
  { key: "etiket", label: "Etiket" },
  { key: "diger", label: "Diğer" },
];
const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));
const UNITS = ["m", "adet", "kg", "takım", "paket"] as const;

const inputCls =
  "w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-subtle " +
  "transition-[border-color,box-shadow] duration-150 hover:border-line-strong " +
  "focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40";

const emptyDraft = (): MaterialInput => ({
  code: "", name: "", category: "kumas", supplier_id: null, composition: "",
  width_cm: "", unit: "m", unit_price: "", currency: "TL", photo_url: "", notes: "", is_active: true,
});
const draftOf = (m: ManagerMaterial): MaterialInput => ({
  code: m.code ?? "", name: m.name, category: m.category, supplier_id: m.supplier_id,
  composition: m.composition ?? "", width_cm: m.width_cm ?? "", unit: m.unit,
  unit_price: m.unit_price ?? "", currency: m.currency, photo_url: "", notes: m.notes ?? "",
  is_active: m.is_active,
});

/**
 * Hammadde kütüphanesi.
 *
 * Aslı Hanım (2026-08-19): "Kumaşın fiyatına ayrı giriyorsun, fermuar fiyatına
 * ayrı giriyorsun…" Kalemleri kalem kalem yapmıştık ama her föyde ELLE
 * giriliyordu. Artık malzeme burada BİR KEZ tanımlanır; föyün reçetesine
 * eklenince maliyeti hesaplanır ve fiyatı burada değişince TÜM föyler
 * güncellenir. Desen Zedonk'un "Raw Materials" modülünden.
 */
export function MaterialsManager({ materials, suppliers, usageCounts, canManage }: Props) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<MaterialInput>(emptyDraft());
  const [error, setError] = useState<string | null>(null);
  const [busy, startWork] = useTransition();

  function run(fn: () => Promise<{ error?: string } | unknown>, after?: () => void) {
    setError(null);
    startWork(async () => {
      const res = (await fn()) as { error?: string };
      if (res && "error" in res && res.error) { setError(res.error); return; }
      after?.();
      router.refresh();
    });
  }

  const close = () => { setAdding(false); setEditingId(null); setError(null); };

  const form = (
    <div className="space-y-2 rounded-xl border border-brand-ring/50 bg-surface-muted/50 p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Malzeme adı *</span>
          <input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Organik Pamuk" autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Kod</span>
          <input className={inputCls} value={draft.code ?? ""} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="7685" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Kategori</span>
          <select className={inputCls} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as MaterialCategory })}>
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Birim</span>
          <select className={inputCls} value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value as MaterialInput["unit"] })}>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Birim fiyat (₺)</span>
          <input className={inputCls} value={String(draft.unit_price ?? "")} onChange={(e) => setDraft({ ...draft, unit_price: e.target.value })} placeholder="180" inputMode="decimal" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Tedarikçi</span>
          <select className={inputCls} value={draft.supplier_id ?? ""} onChange={(e) => setDraft({ ...draft, supplier_id: e.target.value || null })}>
            <option value="">—</option>
            {suppliers.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">En (cm)</span>
          <input className={inputCls} value={String(draft.width_cm ?? "")} onChange={(e) => setDraft({ ...draft, width_cm: e.target.value })} placeholder="140" inputMode="decimal" />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Kompozisyon</span>
          <input className={inputCls} value={draft.composition ?? ""} onChange={(e) => setDraft({ ...draft, composition: e.target.value })} placeholder="%100 organik pamuk" />
        </label>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-ink">
        <input
          type="checkbox"
          checked={draft.is_active}
          onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
          className="h-4 w-4 rounded border-line-strong accent-[var(--brand)]"
        />
        Aktif — pasif malzeme yeni reçetelerde seçilemez, mevcut reçeteler korunur.
      </label>
      <div className="flex items-center justify-end gap-2 pt-1">
        <button onClick={close} className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-muted hover:text-ink">İptal</button>
        <button
          onClick={() => run(() => saveMaterial(editingId, draft), close)}
          disabled={busy || !draft.name.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-strong disabled:pointer-events-none disabled:opacity-60"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Kaydet
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {error && (
        <p className="anim-fade-down rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p>
      )}

      {adding && form}

      {materials.length === 0 && !adding ? (
        <p className="rounded-xl border border-line bg-surface px-3 py-4 text-center text-[13px] text-subtle">
          Henüz malzeme yok. Kumaş ve aksesuarları burada bir kez tanımlayın — föy reçetelerinde seçilir,
          maliyet kendiliğinden hesaplanır.
        </p>
      ) : (
        <ul className="space-y-2">
          {materials.map((m) => {
            const used = usageCounts[m.id] ?? 0;
            if (editingId === m.id) return <li key={m.id}>{form}</li>;
            return (
              <li
                key={m.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border bg-surface px-3 py-2.5 shadow-card",
                  m.is_active ? "border-line" : "border-line opacity-70",
                )}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-muted text-muted">
                  <Package size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[14px] font-semibold tracking-tight text-ink">{m.name}</span>
                    {m.code && <span className="text-[11.5px] text-subtle">{m.code}</span>}
                    <span className="rounded-md bg-surface-muted px-1.5 py-px text-[11px] font-medium text-muted">
                      {CAT_LABEL[m.category]}
                    </span>
                    {!m.is_active && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-1.5 py-px text-[11px] font-medium text-subtle">
                        <EyeOff size={10} /> pasif
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12px] text-muted tabular-nums">
                    <span className="font-semibold text-ink">
                      {m.unit_price != null ? `${formatMoney(Number(m.unit_price))}/${m.unit}` : "fiyat girilmedi"}
                    </span>
                    <span>{used} föyde</span>
                    {m.width_cm != null && <span>en {m.width_cm} cm</span>}
                    {m.composition && <span className="truncate">{m.composition}</span>}
                  </span>
                </span>
                {canManage && (
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => { setDraft(draftOf(m)); setEditingId(m.id); setAdding(false); setError(null); }}
                      className="rounded-md p-1.5 text-subtle transition-colors hover:bg-surface-muted hover:text-ink"
                      title="Düzenle"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => run(() => deleteMaterial(m.id))}
                      disabled={busy}
                      className="rounded-md p-1.5 text-subtle transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                      title={used > 0 ? "Reçetelerde kullanılıyor — silmek yerine pasif yapın" : "Sil"}
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canManage && !adding && (
        <button
          onClick={() => { setDraft(emptyDraft()); setAdding(true); setEditingId(null); setError(null); }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-muted transition-all duration-150 hover:border-line-strong hover:bg-surface-muted hover:text-ink active:scale-[0.98]"
        >
          <Plus size={14} /> Malzeme ekle
        </button>
      )}
    </div>
  );
}
