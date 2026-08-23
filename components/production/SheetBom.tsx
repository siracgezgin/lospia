"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Info } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { addSheetMaterial, updateSheetMaterial, removeSheetMaterial } from "@/lib/actions/materials";
import { bomLineCost, bomTotal, formatMoney } from "@/lib/collection/cost";
import type { Material, SheetMaterialWithMaterial } from "@/types";

export type PickableMaterial = Pick<
  Material, "id" | "name" | "code" | "category" | "unit" | "unit_price" | "currency"
>;

interface Props {
  sheetId: string | null;
  rows: SheetMaterialWithMaterial[];
  materials: PickableMaterial[];
  canEdit: boolean;
}

const CATEGORY_LABEL: Record<string, string> = {
  kumas: "Kumaş", aksesuar: "Aksesuar", fermuar: "Fermuar",
  tela: "Tela", iplik: "İplik", etiket: "Etiket", diger: "Diğer",
};

const cellInput =
  "w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-right text-[13px] tabular-nums text-ink " +
  "transition-[border-color,background-color] duration-150 hover:border-line " +
  "focus:border-brand-ring focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-ring";

/**
 * Reçete (BOM) — bir üründe hangi malzemeden ne kadar gidiyor.
 *
 * Aslı Hanım (2026-08-19): "Kumaşın fiyatına ayrı giriyorsun, fermuar fiyatına
 * ayrı giriyorsun…" Kalemleri kalem kalem yaptık ama ELLE giriliyordu: aynı
 * kumaş 40 föye 40 kez yazılıyor, fiyatı değişince 40 föy tek tek
 * güncelleniyordu.
 *
 * Artık malzeme kütüphaneden seçiliyor; maliyet HESAPLANIYOR:
 *   tüketim × malzeme birim fiyatı × (1 + fire)
 * Malzemenin fiyatı Ayarlar'da değişince tüm föylerin maliyeti kendiliğinden
 * güncellenir. Desen Zedonk'un "Raw Materials" sekmesinden.
 */
export function SheetBom({ sheetId, rows, materials, canEdit }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  const [, startWork] = useTransition();

  // Zaten reçetede olan malzeme tekrar eklenemesin (DB'de de unique).
  const used = useMemo(() => new Set(rows.map((r) => r.material_id)), [rows]);
  const available = materials.filter((m) => !used.has(m.id));
  const total = bomTotal(rows);

  function run(id: string, fn: () => Promise<{ error?: string } | unknown>) {
    setError(null);
    setBusyId(id);
    startWork(async () => {
      const res = (await fn()) as { error?: string };
      setBusyId(null);
      if (res && "error" in res && res.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  if (!sheetId) {
    return (
      <p className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-[12.5px] text-muted">
        Reçete, föy kaydedildikten sonra eklenebilir.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="anim-fade-down rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">
          {error}
        </p>
      )}

      <p className="flex items-start gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2 text-[12.5px] text-muted">
        <Info size={14} className="mt-px shrink-0 text-subtle" />
        <span>
          Buraya girilen malzemelerin tutarı maliyet tablosuna <b className="font-semibold text-ink">otomatik</b> yazılır
          (tüketim × birim fiyat × fire). Malzeme fiyatı Ayarlar’da değişince tüm föyler güncellenir.
        </span>
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] table-fixed border-collapse text-[13px]">
          <colgroup>
            <col /><col className="w-24" /><col className="w-24" /><col className="w-20" />
            <col className="w-28" /><col className="w-9" />
          </colgroup>
          <thead>
            <tr className="bg-surface-muted">
              <th className="border border-line-strong px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-subtle">Malzeme</th>
              <th className="border border-line-strong px-1 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-subtle">Birim fiyat</th>
              <th className="border border-line-strong px-1 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-subtle">Tüketim</th>
              <th className="border border-line-strong px-1 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-subtle">Fire %</th>
              <th className="border border-line-strong px-1 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-subtle">Tutar</th>
              <th className="w-9" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="border border-line px-3 py-4 text-center text-[12.5px] text-subtle">
                  Reçete boş. Aşağıdan malzeme ekleyin — maliyet kendiliğinden hesaplanır.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="border border-line px-2 py-1.5">
                    <span className="block truncate font-medium text-ink">
                      {r.material?.name ?? "—"}
                      {r.material?.code && <span className="ml-1.5 text-[11.5px] text-subtle">{r.material.code}</span>}
                    </span>
                    <span className="text-[11.5px] text-subtle">
                      {CATEGORY_LABEL[r.material?.category ?? "diger"]} · {r.material?.unit}
                    </span>
                  </td>
                  <td className="border border-line px-2 py-1.5 text-right tabular-nums text-muted">
                    {r.material?.unit_price != null ? formatMoney(Number(r.material.unit_price)) : "—"}
                  </td>
                  <td className="border border-line p-0">
                    <input
                      className={cellInput}
                      defaultValue={String(r.consumption ?? "")}
                      onBlur={(e) => run(r.id, () => updateSheetMaterial(r.id, { consumption: e.target.value }))}
                      disabled={!canEdit}
                      inputMode="decimal"
                    />
                  </td>
                  <td className="border border-line p-0">
                    <input
                      className={cellInput}
                      defaultValue={String(r.waste_pct ?? "")}
                      onBlur={(e) => run(r.id, () => updateSheetMaterial(r.id, { waste_pct: e.target.value }))}
                      disabled={!canEdit}
                      inputMode="decimal"
                    />
                  </td>
                  <td className="border border-line px-2 py-1.5 text-right font-semibold tabular-nums text-ink">
                    {bomLineCost(r) ? formatMoney(bomLineCost(r)) : "—"}
                  </td>
                  <td className="border border-line text-center align-middle">
                    {canEdit && (
                      <button
                        onClick={() => run(r.id, () => removeSheetMaterial(r.id))}
                        disabled={busyId === r.id}
                        className="rounded-md p-1 text-subtle transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                        title="Reçeteden çıkar"
                      >
                        {busyId === r.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
            <tr className="bg-surface-muted">
              <td colSpan={4} className="border border-line-strong px-2 py-1.5 text-[12px] font-bold uppercase tracking-wide text-ink">
                Reçete toplamı (birim)
              </td>
              <td className="border border-line-strong px-2 py-1.5 text-right text-[13px] font-bold tabular-nums text-ink">
                {formatMoney(total)}
              </td>
              <td className="border border-line-strong" />
            </tr>
          </tbody>
        </table>
      </div>

      {canEdit && (
        available.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className="h-9 min-w-56 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink focus:border-brand-ring focus:outline-none focus:ring-2 focus:ring-brand-ring/40"
              aria-label="Reçeteye malzeme ekle"
            >
              <option value="">Malzeme seç…</option>
              {available.map((m) => (
                <option key={m.id} value={m.id}>
                  {CATEGORY_LABEL[m.category]} · {m.name}
                  {m.unit_price != null ? ` — ${formatMoney(Number(m.unit_price))}/${m.unit}` : ""}
                </option>
              ))}
            </select>
            <button
              onClick={() => { if (pick) { run("add", () => addSheetMaterial(sheetId, pick)); setPick(""); } }}
              disabled={!pick || busyId === "add"}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-muted transition-all duration-150",
                "hover:border-line-strong hover:bg-surface-muted hover:text-ink active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              {busyId === "add" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Reçeteye ekle
            </button>
          </div>
        ) : (
          <p className="text-[12.5px] text-subtle">
            {materials.length === 0
              ? "Henüz malzeme tanımlanmadı. Ayarlar → Hammadde’den ekleyin."
              : "Tüm malzemeler reçetede."}
          </p>
        )
      )}
    </div>
  );
}
