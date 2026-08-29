"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, Package } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { saveMaterial, deleteMaterial, type MaterialInput } from "@/lib/actions/materials";
import { formatMoney } from "@/lib/collection/cost";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Field, TextInput, SelectInput } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { useConfirm } from "@/components/ui/useConfirm";
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
 *
 * Yüzey: satırlar ince çizgiyle ayrılır (kart içinde kart yok); satırda tek
 * rozet (pasif), kategori ve kod düz metin. Form Field primitifleri; silme
 * artık onay sorar.
 */
export function MaterialsManager({ materials, suppliers, usageCounts, canManage }: Props) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
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

  async function remove(m: ManagerMaterial) {
    const ok = await ask({
      title: "Malzemeyi silmek istiyor musunuz?",
      message: `${m.name} silinecek. Reçetelerde kullanılıyorsa silinmez; onun yerine pasif yapın.`,
      confirmLabel: "Sil",
    });
    if (!ok) return;
    run(() => deleteMaterial(m.id));
  }

  const form = (
    <div className="space-y-4 rounded-card bg-surface-sunken/60 p-4">
      <div className="grid grid-cols-1 gap-x-3 gap-y-3.5 sm:grid-cols-3">
        <Field label="Malzeme adı" required className="sm:col-span-2">
          <TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Organik Pamuk" autoFocus />
        </Field>
        <Field label="Kod">
          <TextInput value={draft.code ?? ""} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="7685" className="tabular-nums" />
        </Field>
        <Field label="Kategori">
          <SelectInput value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as MaterialCategory })}>
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </SelectInput>
        </Field>
        <Field label="Birim">
          <SelectInput value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value as MaterialInput["unit"] })}>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </SelectInput>
        </Field>
        <Field label="Birim fiyat (₺)">
          <TextInput value={String(draft.unit_price ?? "")} onChange={(e) => setDraft({ ...draft, unit_price: e.target.value })} placeholder="180" inputMode="decimal" className="tabular-nums" />
        </Field>
        <Field label="Tedarikçi">
          <SelectInput value={draft.supplier_id ?? ""} onChange={(e) => setDraft({ ...draft, supplier_id: e.target.value || null })}>
            <option value="">—</option>
            {suppliers.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
          </SelectInput>
        </Field>
        <Field label="En (cm)">
          <TextInput value={String(draft.width_cm ?? "")} onChange={(e) => setDraft({ ...draft, width_cm: e.target.value })} placeholder="140" inputMode="decimal" className="tabular-nums" />
        </Field>
        <Field label="Kompozisyon" className="sm:col-span-2">
          <TextInput value={draft.composition ?? ""} onChange={(e) => setDraft({ ...draft, composition: e.target.value })} placeholder="%100 organik pamuk" />
        </Field>
      </div>
      <label className="flex items-start gap-2 text-[13.5px] leading-snug text-ink">
        <input
          type="checkbox"
          checked={draft.is_active}
          onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-[var(--brand)]"
        />
        <span>Aktif <span className="text-muted">— pasif malzeme yeni reçetelerde seçilemez, mevcut reçeteler korunur.</span></span>
      </label>
      <div className="flex items-center justify-end gap-2 border-t border-hairline pt-3">
        <Button variant="ghost" size="sm" onClick={close} disabled={busy}>Vazgeç</Button>
        <Button
          size="sm"
          onClick={() => run(() => saveMaterial(editingId, draft), close)}
          loading={busy}
          disabled={!draft.name.trim()}
        >
          Kaydet
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="anim-fade-down text-[12.5px] text-danger">{error}</p>
      )}

      {adding && form}

      {materials.length === 0 && !adding ? (
        <EmptyState
          title="Henüz malzeme yok"
          description="Kumaş ve aksesuarları burada bir kez tanımlayın; föy reçetelerinde seçilir, maliyet kendiliğinden hesaplanır."
          compact
        />
      ) : (
        <ul className="divide-y divide-hairline border-t border-hairline">
          {materials.map((m) => {
            const used = usageCounts[m.id] ?? 0;
            if (editingId === m.id) return <li key={m.id} className="py-3">{form}</li>;
            return (
              <li key={m.id} className="flex items-center gap-3 py-3">
                <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", m.is_active ? "bg-surface-sunken text-muted" : "bg-surface-muted text-subtle")}>
                  <Package size={16} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={cn("truncate text-[14px] font-semibold tracking-tight", m.is_active ? "text-ink" : "text-muted")}>
                      {m.name}
                    </span>
                    {m.code && <span className="text-[12.5px] tabular-nums text-subtle">{m.code}</span>}
                    {/* Satırdaki tek rozet: durum. Kategori metinde yazar. */}
                    {!m.is_active && <Badge className="bg-surface-sunken text-subtle">Pasif</Badge>}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-muted">
                    <span className="font-medium tabular-nums text-ink">
                      {m.unit_price != null ? `${formatMoney(Number(m.unit_price))}/${m.unit}` : "fiyat girilmedi"}
                    </span>
                    <span>{CAT_LABEL[m.category]}</span>
                    {/* "N föyde" listeyi tarif eder (malzeme kaç reçetede). */}
                    <span className="tabular-nums">{used} föyde</span>
                    {m.width_cm != null && <span className="tabular-nums">en {m.width_cm} cm</span>}
                    {m.composition && <span className="truncate">{m.composition}</span>}
                  </span>
                </span>
                {canManage && (
                  <span className="flex shrink-0 items-center">
                    <IconButton
                      size="sm"
                      onClick={() => { setDraft(draftOf(m)); setEditingId(m.id); setAdding(false); setError(null); }}
                      aria-label={`${m.name} — düzenle`}
                      title="Düzenle"
                    >
                      <Pencil size={14} />
                    </IconButton>
                    <IconButton
                      size="sm"
                      onClick={() => remove(m)}
                      disabled={busy}
                      aria-label={`${m.name} — sil`}
                      title={used > 0 ? "Reçetelerde kullanılıyor — silmek yerine pasif yapın" : "Sil"}
                      className="hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canManage && !adding && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => { setDraft(emptyDraft()); setAdding(true); setEditingId(null); setError(null); }}
        >
          <Plus size={14} aria-hidden /> Malzeme ekle
        </Button>
      )}

      {dialog}
    </div>
  );
}
