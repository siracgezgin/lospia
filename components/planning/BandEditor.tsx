"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useConfirm } from "@/components/ui/useConfirm";
import { Button, IconButton } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
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
 *
 * Kontroller ortak primitiflerden (TextInput / Button / IconButton): satır
 * içinde olduğu için boy h-8'e çekilir, biçim aynı kalır.
 */
export function BandEditor({
  band, refDay, takenSlots = [], onClose,
}: {
  band: RuntimeBand;
  /** Saat çevirimi için haftanın ilk günü. */
  refDay: string;
  /** DİĞER şeritlerin saatleri — aynı saate ikinci şerit açılırken uyarmak
   *  için. Aynı saatte iki şerit ızgarada birbirinin kopyası gibi iki satır
   *  çizer; kullanıcı hangisine yazdığını kaybeder. */
  takenSlots?: string[];
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
  /** Aynı saatte başka bir şerit var mı? (`takenSlots` düzenlenen şeridi
   *  İÇERMEZ — dışlamayı çağıran yapar.) */
  const duplicateSlot = takenSlots.some((s) => normalizeSlot(s) === normalizeSlot(slot));

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
        message: `"${band.label || slot}" ızgaradan kalkar.\n\nBu saatteki toplantılar SİLİNMEZ — saat satırı olarak görünmeye devam eder.`,
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
    <div
      className="anim-fade-down sticky left-0 z-[1] flex w-full max-w-[min(100%,640px)] flex-wrap items-center gap-2 px-3 py-2"
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <TextInput
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Şerit adı"
        aria-label="Şerit adı"
        autoFocus
        className="h-8 min-w-32 flex-1 px-2.5 text-[12.5px] font-semibold uppercase tracking-wide"
      />

      <label className="inline-flex items-center gap-1.5">
        <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-subtle">{HOME_LABEL}</span>
        <TextInput
          type="time"
          value={slot}
          onChange={(e) => setSlot(e.target.value)}
          className="h-8 w-auto px-2 text-[12.5px] font-semibold tabular-nums"
          aria-label="Şerit saati (New York)"
        />
      </label>
      {ist && (
        <span className="text-[12px] tabular-nums text-subtle" title="İstanbul saati — hesaplanır">
          {AWAY_LABEL} {ist}
        </span>
      )}

      {/* Renk — dokuz kategori noktası, tek satır. Seçili olan büyür ve
          halkalanır (yalnız renkle anlatılmaz); adı title/aria-label'da. */}
      <span className="inline-flex items-center gap-1" role="radiogroup" aria-label="Şerit rengi">
        {PLANNING_CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            role="radio"
            onClick={() => setCategory(c.key)}
            title={c.label}
            aria-label={c.label}
            aria-checked={category === c.key}
            className={cn(
              "tap-target h-4 w-4 rounded-full ring-1 ring-inset ring-black/10 transition-transform duration-150",
              c.dot,
              category === c.key ? "scale-125 ring-2 ring-ink/40" : "opacity-60 hover:opacity-100",
            )}
          />
        ))}
      </span>

      <span className="ml-auto inline-flex items-center gap-1">
        {band.id && (
          <IconButton
            size="sm"
            aria-label="Şeridi kaldır"
            title="Şeridi kaldır"
            onClick={remove}
            disabled={busy}
            className="hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 size={14} />
          </IconButton>
        )}
        <IconButton size="sm" aria-label="Vazgeç" title="Vazgeç" onClick={onClose} disabled={busy}>
          <X size={14} />
        </IconButton>
        <Button size="sm" onClick={save} loading={busy}>
          Kaydet
        </Button>
      </span>

      {error && (
        <p role="alert" className="basis-full rounded-control border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-[12px] font-medium text-danger">
          {error}
        </p>
      )}
      {!error && duplicateSlot && (
        <p className="basis-full rounded-control border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-[12px] font-medium text-ink">
          {normalizeSlot(slot)} saatinde zaten bir şerit var — ızgarada iki ayrı satır olarak görünürler.
        </p>
      )}
      {dialog}
    </div>
  );
}
