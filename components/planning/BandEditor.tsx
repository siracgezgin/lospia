"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useConfirm } from "@/components/ui/useConfirm";
import { PLANNING_CATEGORIES } from "@/lib/planning/categories";
import { savePlanningBand, deletePlanningBand } from "@/lib/actions/planning-bands";
import { istanbulLabel, AWAY_LABEL, HOME_LABEL, normalizeSlot } from "@/lib/planning/timezones";
import type { PlanningCategory, } from "@/types";
import type { RuntimeBand } from "@/lib/planning/bands";

/**
 * Şerit düzenleyici — takvimin SOL SÜTUNU.
 *
 * Aslı Hanım (2026-08-28), sol sütunu göstererek: "Buraya neden müdahale
 * edemiyorum?" ÜRETİM/MARKETING/SALES adları, saatleri ve altlarındaki
 * "Konu 1..N" satır sayısı kodda sabitti.
 *
 * Küçük ve yerinde: şeridin üstüne tıklayınca aynı satırda açılır — ÜÇ alan
 * (ad · saat · renk), hepsi de ızgarada gözle görülür bir şeyi değiştirir.
 * Ayrı bir ayarlar ekranı açmak bu iş için fazla.
 */
export function BandEditor({
  band, refDay, onClose,
}: {
  band: RuntimeBand;
  /** Saat çevirimi için haftanın ilk günü. */
  refDay: string;
  onClose: () => void;
}) {
  const { ask, dialog } = useConfirm();
  const router = useRouter();
  const [label, setLabel] = useState(band.label);
  const [slot, setSlot] = useState(normalizeSlot(band.slot));
  const [category, setCategory] = useState<PlanningCategory>(band.category);
  /* Konu satırı sayısı ARTIK AYAR DEĞİL: ızgara dolu satırları çizer, altına
     bir boş satır ekler. Sabit 3–4 boş satır çizdiren eski ayar kaldırıldı —
     ekranda hiçbir şeyi değiştirmeyen ikinci bir kontrol olmasın (kategori
     seçicisinin başına gelen buydu). Kolon veritabanında duruyor. */
  const topicRows = band.topicRows;
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const ist = istanbulLabel(refDay, slot);

  function save() {
    setError(null);
    start(async () => {
      const res = await savePlanningBand(band.id, { label, slot, category, topicRows });
      if ("error" in res) { setError(res.error); return; }
      onClose();
      router.refresh();
    });
  }

  async function remove() {
    if (!band.id) { onClose(); return; }
    if (!(await ask({
        title: "Şerit kaldırılsın mı?",
        message: `"${band.label || slot}" ızgaradan kalkar.\n\nBu saatteki toplantılar SİLİNMEZ — "Ek saat" satırında görünmeye devam eder.`,
        confirmLabel: "Kaldır",
      }))) return;
    setError(null);
    start(async () => {
      const res = await deletePlanningBand(band.id!);
      if ("error" in res) { setError(res.error); return; }
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="anim-fade-down sticky left-0 z-[1] flex w-full max-w-[min(100%,640px)] flex-wrap items-center gap-2 px-3 py-2">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Şerit adı"
        autoFocus
        className="h-8 min-w-32 flex-1 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] font-semibold uppercase tracking-wide text-ink focus:border-brand-ring focus:outline-none focus:ring-2 focus:ring-brand-ring/40"
      />

      <label className="inline-flex items-center gap-1.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-subtle">{HOME_LABEL}</span>
        <input
          type="time"
          value={slot}
          onChange={(e) => setSlot(e.target.value)}
          className="h-8 rounded-lg border border-line bg-surface px-2 text-[12.5px] font-semibold tabular-nums text-ink focus:border-brand-ring focus:outline-none focus:ring-2 focus:ring-brand-ring/40"
          aria-label="Şerit saati (New York)"
        />
      </label>
      {ist && (
        <span className="text-[11.5px] tabular-nums text-subtle" title="İstanbul saati — hesaplanır">
          {AWAY_LABEL} {ist}
        </span>
      )}

      {/* Renk — dokuz kategori noktası, tek satır. */}
      <span className="inline-flex items-center gap-1">
        {PLANNING_CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategory(c.key)}
            title={c.label}
            aria-label={c.label}
            aria-pressed={category === c.key}
            className={cn(
              "h-4 w-4 rounded-full ring-1 ring-inset ring-black/10 transition-transform duration-150",
              c.dot,
              category === c.key ? "scale-125 ring-2 ring-ink/40" : "opacity-60 hover:opacity-100",
            )}
          />
        ))}
      </span>

      <span className="ml-auto inline-flex items-center gap-1">
        {band.id && (
          <button
            onClick={remove}
            disabled={busy}
            title="Şeridi kaldır"
            className="tap-target rounded-md p-1.5 text-subtle transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
          >
            <Trash2 size={14} />
          </button>
        )}
        <button
          onClick={onClose}
          disabled={busy}
          title="Vazgeç"
          className="tap-target rounded-md p-1.5 text-subtle transition-colors hover:bg-surface-muted hover:text-ink"
        >
          <X size={14} />
        </button>
        <button
          onClick={save}
          disabled={busy}
          title="Kaydet"
          className="inline-flex h-8 items-center gap-1 rounded-lg bg-brand px-2.5 text-[12.5px] font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Kaydet
        </button>
      </span>

      {error && (
        <p role="alert" className="basis-full rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-[12px] font-medium text-danger">
          {error}
        </p>
      )}
      {dialog}
    </div>
  );
}
