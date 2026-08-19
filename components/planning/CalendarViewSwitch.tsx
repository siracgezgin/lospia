"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, CalendarDays, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils/cn";
// Ölçek sözlüğü sunucu-güvenli modülde: `?v=` çözümlemesini sayfa orada yapar.
import type { CalendarScale } from "@/lib/planning/calendar-scale";

export const CALENDAR_SCALES: { id: CalendarScale; label: string; icon: typeof CalendarRange }[] = [
  { id: "hafta", label: "Hafta", icon: CalendarRange },
  { id: "ay",    label: "Ay",    icon: CalendarDays  },
  { id: "yil",   label: "Yıl",   icon: CalendarClock },
];

/**
 * Hafta / Ay / Yıl anahtarı.
 *
 * Aslı Hanım (2026-08-19): "Aslında şey, bu takvimi ben buraya entegre edeyim
 * bence. Bence tek takvim yap." — Planlama ve Görev Takvimi tek ekranda
 * birleşti; bu anahtar aynı takvimin ölçeğini değiştirir, ayrı bir sayfaya
 * gitmez. Hafta seçimi (`?week=`) ölçek değişirken korunur.
 */
export function CalendarViewSwitch({ scale }: { scale: CalendarScale }) {
  const router = useRouter();
  const params = useSearchParams();

  function go(next: CalendarScale) {
    if (next === scale) return;
    const q = new URLSearchParams(params.toString());
    if (next === "hafta") q.delete("v");
    else q.set("v", next);
    const qs = q.toString();
    router.push(qs ? `/planning?${qs}` : "/planning");
  }

  return (
    <div
      role="tablist"
      aria-label="Takvim ölçeği"
      className="inline-flex h-9 shrink-0 items-stretch overflow-hidden rounded-lg border border-line bg-surface"
    >
      {CALENDAR_SCALES.map(({ id, label, icon: Icon }, i) => {
        const active = id === scale;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={active}
            onClick={() => go(id)}
            className={cn(
              "inline-flex items-center gap-1.5 border-line px-2.5 text-[13px] font-medium transition-colors duration-150 sm:px-3",
              i > 0 && "border-l",
              active
                ? "bg-brand text-white"
                : "text-muted hover:bg-surface-muted hover:text-ink",
            )}
          >
            <Icon size={14} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
