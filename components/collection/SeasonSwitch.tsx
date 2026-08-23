"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ALL_SEASONS } from "@/lib/collection/season";
import type { Season } from "@/types";

export type SwitchSeason = Pick<Season, "id" | "name" | "is_current">;

/**
 * Sezon seçici — Zedonk'un sağ üstteki `SS 21 - WW` kutusunun karşılığı.
 *
 * Bu bir filtre kutusu değil, Ürün ekranlarının çalıştığı BAĞLAM: Koleksiyon,
 * Maliyet ve Ödeme Tablosu aynı seçime uyar. URL'de taşınır (`?sezon=`), yani
 * paylaşılabilir ve yenilemede kaybolmaz.
 *
 * "Tüm sezonlar" bilerek duruyor: geçmişe bakmak isteyen tek tıkla açar
 * ("geçen ay/sezon ne yaptık" — Aslı Hanım'ın takvim isteğinin ürün karşılığı).
 */
export function SeasonSwitch({ seasons }: { seasons: SwitchSeason[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  if (seasons.length === 0) return null;

  const current = params.get("sezon") ?? seasons.find((s) => s.is_current)?.id ?? ALL_SEASONS;

  function go(next: string) {
    const q = new URLSearchParams(params.toString());
    if (next === ALL_SEASONS) q.set("sezon", ALL_SEASONS);
    else q.set("sezon", next);
    const qs = q.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <label
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface pl-2.5 pr-1 text-[13px]"
      title="Sezon — Koleksiyon, Maliyet ve Ödeme Tablosu bu seçime uyar"
    >
      <CalendarClock size={14} className="shrink-0 text-muted" />
      <select
        value={current}
        onChange={(e) => go(e.target.value)}
        aria-label="Sezon seç"
        className={cn(
          "cursor-pointer border-0 bg-transparent py-1 pr-1 font-medium focus:outline-none",
          current === ALL_SEASONS ? "text-muted" : "text-ink",
        )}
      >
        {seasons.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}{s.is_current ? " ·" : ""}
          </option>
        ))}
        <option value={ALL_SEASONS}>Tüm sezonlar</option>
      </select>
    </label>
  );
}
