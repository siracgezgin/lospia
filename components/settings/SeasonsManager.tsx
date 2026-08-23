"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Save, Pencil, CalendarClock, Star } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { createSeason, updateSeason, deleteSeason, type SeasonInput } from "@/lib/actions/seasons";
import type { Season } from "@/types";

export type ManagerSeason = Pick<Season, "id" | "name" | "starts_on" | "ends_on" | "is_current">;

interface Props {
  seasons: ManagerSeason[];
  /** Sezon başına föy sayısı. */
  sheetCounts: Record<string, number>;
  canManage: boolean;
}

const inputCls =
  "w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-subtle " +
  "transition-[border-color,box-shadow] duration-150 hover:border-line-strong " +
  "focus:outline-none focus:border-brand-ring focus:ring-2 focus:ring-brand-ring/40";

const emptyDraft = (): SeasonInput => ({ name: "", starts_on: "", ends_on: "", is_current: false });
const draftOf = (s: ManagerSeason): SeasonInput => ({
  name: s.name,
  starts_on: s.starts_on ?? "",
  ends_on: s.ends_on ?? "",
  is_current: s.is_current,
});

/**
 * Sezon yönetimi.
 *
 * Zedonk incelemesinden gelen mimari fikir: sistemin çalıştığı bağlam sezondur
 * (`SS 21 - WW` seçicisi her ekranın sağ üstünde). Bizde sezon yalnız föyün
 * içinde serbest metindi, dolayısıyla "bu sezon ne ürettik, kaça mal oldu"
 * sorulamıyordu.
 *
 * AKTİF sezon tektir: üst çubukta ilk seçili gelen ve yeni föyün varsayılanı.
 */
export function SeasonsManager({ seasons, sheetCounts, canManage }: Props) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<SeasonInput>(emptyDraft());
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
        <label className="block sm:col-span-3">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Sezon adı *</span>
          <input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="2026 RESORT" autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Başlangıç</span>
          <input type="date" className={inputCls} value={draft.starts_on ?? ""} onChange={(e) => setDraft({ ...draft, starts_on: e.target.value })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Bitiş</span>
          <input type="date" className={inputCls} value={draft.ends_on ?? ""} onChange={(e) => setDraft({ ...draft, ends_on: e.target.value })} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-ink">
        <input
          type="checkbox"
          checked={draft.is_current}
          onChange={(e) => setDraft({ ...draft, is_current: e.target.checked })}
          className="h-4 w-4 rounded border-line-strong accent-[var(--brand)]"
        />
        Aktif sezon — üst çubukta ilk bu seçili gelir, yeni föy bununla açılır. Tek olabilir.
      </label>
      <div className="flex items-center justify-end gap-2 pt-1">
        <button onClick={close} className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-muted hover:text-ink">İptal</button>
        <button
          onClick={() => run(() => (editingId ? updateSeason(editingId, draft) : createSeason(draft)), close)}
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
        <p className="anim-fade-down rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">
          {error}
        </p>
      )}

      {adding && form}

      {seasons.length === 0 && !adding ? (
        <p className="rounded-xl border border-line bg-surface px-3 py-4 text-center text-[13px] text-subtle">
          Henüz sezon yok. Föylerdeki sezon adları kayda dönüşünce burada görünür.
        </p>
      ) : (
        <ul className="space-y-2">
          {seasons.map((s) => {
            const count = sheetCounts[s.id] ?? 0;
            if (editingId === s.id) return <li key={s.id}>{form}</li>;
            return (
              <li
                key={s.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border bg-surface px-3 py-2.5 shadow-card",
                  s.is_current ? "border-brand-ring" : "border-line",
                )}
              >
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", s.is_current ? "bg-brand text-white" : "bg-surface-muted text-muted")}>
                  <CalendarClock size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[14px] font-semibold tracking-tight text-ink">{s.name}</span>
                    {s.is_current && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-brand-soft px-1.5 py-px text-[11px] font-semibold text-brand-strong">
                        <Star size={10} /> aktif
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12px] text-muted tabular-nums">
                    <span>{count} föy</span>
                    {s.starts_on && <span>{s.starts_on}{s.ends_on ? ` → ${s.ends_on}` : ""}</span>}
                  </span>
                </span>
                {canManage && (
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => { setDraft(draftOf(s)); setEditingId(s.id); setAdding(false); setError(null); }}
                      className="rounded-md p-1.5 text-subtle transition-colors hover:bg-surface-muted hover:text-ink"
                      title="Düzenle"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => run(() => deleteSeason(s.id))}
                      disabled={busy}
                      className="rounded-md p-1.5 text-subtle transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                      title={count > 0 ? "Föye bağlı — silinemez" : "Sil"}
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
          <Plus size={14} /> Sezon ekle
        </button>
      )}
    </div>
  );
}
