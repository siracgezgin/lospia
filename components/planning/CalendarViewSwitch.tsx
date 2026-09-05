"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Calendar1, CalendarRange, CalendarDays, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils/cn";
// Ölçek sözlüğü sunucu-güvenli modülde: `?v=` çözümlemesini sayfa orada yapar.
import type { CalendarScale } from "@/lib/planning/calendar-scale";

export const CALENDAR_SCALES: { id: CalendarScale; label: string; icon: typeof CalendarRange }[] = [
  /* GÜN — Aslı Hanım (2026-08-30): "Haftanın yanına gün ekleyelim ve güne
     girelim." Haftalık ızgara yedi günü bir arada gösterir; tek bir günün
     saatlerini okumak ve o güne toplantı eklemek için ölçeğin en dar hâli
     gerekiyordu. Sıra dardan genişe: Gün · Hafta · Ay · Yıl. */
  { id: "gun",   label: "Gün",   icon: Calendar1     },
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
    if (next === "hafta") { q.delete("v"); q.delete("d"); }
    else q.set("v", next);
    /* GÜN ayrı bir sayfa değil, haftanın üstünde açılan karttır: hangi günün
       açılacağını `d` söyler. Değer yoksa bugün. Diğer ölçeklerden geçerken
       `d` boş kalabiliyordu ve kart "bugün"e düşüyordu — açık yazmak, bağlantı
       paylaşıldığında da aynı günü getirir. */
    if (next === "gun" && !q.get("d")) {
      const now = new Date();
      const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      q.set("d", iso);
    }
    const qs = q.toString();
    router.push(qs ? `/planning?${qs}` : "/planning");
  }

  return (
    <div
      role="tablist"
      aria-label="Takvim ölçeği"
      className="inline-flex h-9 shrink-0 items-stretch overflow-hidden rounded-control border border-line bg-surface pointer-coarse:h-11"
    >
      {CALENDAR_SCALES.map(({ id, label, icon: Icon }, i) => {
        const active = id === scale;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={label}
            title={label}
            onClick={() => go(id)}
            className={cn(
              // Telefonda yalnız ikon kalır: w-10 parmak hedefi, ad aria-label'da.
              "inline-flex min-w-10 items-center justify-center gap-1.5 border-line px-2.5 text-[13px] font-medium transition-colors duration-150 sm:px-3",
              i > 0 && "border-l",
              active
                ? "bg-brand text-white"
                : "text-muted hover:bg-surface-muted hover:text-ink",
            )}
          >
            <Icon size={14} aria-hidden />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
