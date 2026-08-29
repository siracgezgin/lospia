"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { SelectInput } from "@/components/ui/Field";
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
    /* ETİKET GÖRÜNÜR. Kutu yalnız "2026 RESORT ·" yazıyordu; ne olduğu
       anlaşılmıyor, sondaki nokta da bozukmuş gibi duruyordu (2026-08-29:
       "onun mantığını anlamadım, kafa karıştırıcı geliyor"). */
    /* Bileşik kontrol: ikon + görünür etiket + seçim. Çerçeve, boy ve odak
       halkası ortak alanlarla AYNI (h-9, rounded-control); select'in kendi
       çerçevesi sıfırlanır, halka sarmalayıcıda (focus-within) yaşar. */
    <label
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-control border border-line bg-surface pl-2.5 text-[13.5px] transition-[border-color,box-shadow] duration-150 hover:border-line-strong focus-within:border-brand-ring focus-within:ring-2 focus-within:ring-brand-ring/40"
      title="Koleksiyon, Maliyet ve Ödeme Tablosu seçili sezonu gösterir"
    >
      <CalendarClock size={14} className="shrink-0 text-muted" aria-hidden />
      <span className="shrink-0 text-[12px] font-medium text-subtle">Sezon</span>
      <SelectInput
        value={current}
        onChange={(e) => go(e.target.value)}
        aria-label="Sezon seç"
        className={cn(
          "h-full w-auto border-0 bg-transparent pl-0 font-medium shadow-none hover:border-0 focus:border-0 focus:ring-0",
          current === ALL_SEASONS ? "text-muted" : "text-ink",
        )}
      >
        {seasons.map((s) => (
          /* Sezon adı DÜZ yazılır. Önce "·", sonra "(aktif)" ekliydi; ikisi
             de kutuyu kalabalıklaştırdı ve soruyu cevaplamadı. Hangi sezonun
             aktif olduğu Product Data > Sezonlar'da yıldızla duruyor. */
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
        <option value={ALL_SEASONS}>Tüm sezonlar</option>
      </SelectInput>
    </label>
  );
}
