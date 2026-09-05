"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarToolbar } from "./CalendarToolbar";
import {
  startOfMonth, startOfWeek, addDays,
  eachDayOfInterval, format, isSameMonth, isToday,
} from "date-fns";
/* Ay adı yazan HER format çağrısı locale ALMALI — locale'siz `format(day,
   "d MMMM")` üstüne gelme metnini İngilizce yazıyordu ("5 September").
   `yyyy-MM-dd` gibi MAKİNE anahtarları locale almaz, öyle kalır. */
import { tr } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/Button";

/** Bir günün yoğunluğu — görev + toplantı sayısı. */
export type YearDayLoad = { tasks: number; meetings: number };

interface Props {
  /** yyyy-MM-dd → o günün yükü. */
  loadByDay: Record<string, YearDayLoad>;
  /** Açılışta gösterilecek yıl. */
  initialYear: number;
  /** Hafta/Ay/Yıl seçici — araç çubuğunun sağ ucuna konur. */
  viewSwitch?: React.ReactNode;
}

const TR_MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const DOW = ["P", "S", "Ç", "P", "C", "C", "P"];

/**
 * Yıl görünümü — 12 mini ay, günler yoğunluğuna göre boyalı.
 *
 * Aslı Hanım (2026-08-19): "Bütün yıllık takvimi… Yıllık olarak." Amaç geçmişe
 * bakabilmek ("geçen ay hangi gün ne yaptık"): bir güne tıklayınca o gün Ay
 * görünümünde açılır, bir aya tıklayınca o ay açılır.
 */
export function CalendarYearView({ loadByDay, initialYear, viewSwitch }: Props) {
  const router = useRouter();
  const [year, setYear] = useState(initialYear);

  /* HER AY SABİT 6 HAFTA (42 gün).
     Ayın kendi hafta sayısı 5 ya da 6 olabiliyor; ızgara satırındaki kartlar
     en uzun karta göre gerildiği için kimi ay kutucukları diğerlerinden
     büyük/boşluklu görünüyordu. 42 güne tamamlanan ızgarada 12 kart da birebir
     aynı yükseklikte ve gün kutuları birebir aynı boyutta olur. */
  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const monthStart = startOfMonth(new Date(year, i, 1));
      const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
      const gridEnd = addDays(gridStart, 41);
      return { monthStart, days: eachDayOfInterval({ start: gridStart, end: gridEnd }) };
    });
  }, [year]);

  const yearTotals = useMemo(() => {
    let tasks = 0, meetings = 0;
    const prefix = `${year}-`;
    for (const [iso, load] of Object.entries(loadByDay)) {
      if (!iso.startsWith(prefix)) continue;
      tasks += load.tasks;
      meetings += load.meetings;
    }
    return { tasks, meetings };
  }, [loadByDay, year]);

  /** Yoğunluk → dolgu. Toplantı olan gün her zaman marka rengiyle işaretlenir. */
  function dayTone(load: YearDayLoad | undefined) {
    if (!load) return "";
    if (load.meetings > 0) return "bg-brand text-white font-semibold";
    if (load.tasks >= 4) return "bg-brand-soft text-brand-strong font-semibold";
    if (load.tasks >= 2) return "bg-brand-soft/70 text-brand-strong";
    if (load.tasks >= 1) return "bg-brand-soft/40 text-ink";
    return "";
  }

  const goDay = (iso: string) => router.push(`/planning?v=ay&d=${iso}`);

  return (
    <section className="anim-fade flex h-full min-h-0 flex-col">
      {/* Yıl gezgini — hafta ve ay görünümleriyle AYNI çubuk gövdesi
          (2026-08-29: "hepsi aynı yerde olsun"). */}
      <CalendarToolbar viewSwitch={viewSwitch}>
        <div className="inline-flex h-9 items-stretch overflow-hidden rounded-control border border-line bg-surface pointer-coarse:h-11">
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            className="tap-target inline-flex w-9 items-center justify-center text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
            aria-label="Önceki yıl"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="grid min-w-16 place-items-center border-x border-line px-3 text-[13px] font-semibold tabular-nums text-ink">
            {year}
          </span>
          <button
            type="button"
            onClick={() => setYear((y) => y + 1)}
            className="tap-target inline-flex w-9 items-center justify-center text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
            aria-label="Sonraki yıl"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        {/* İkincil kontrol — ızgara ana yüzey; "Bu yıl" onunla yarışmaz. */}
        <Button
          variant="secondary"
          onClick={() => setYear(new Date().getFullYear())}
          aria-pressed={year === new Date().getFullYear()}
          className={cn(year === new Date().getFullYear() && "border-line-strong bg-surface-muted")}
        >
          Bu yıl
        </Button>
        <span className="hidden text-[12.5px] tabular-nums text-subtle sm:inline">
          <b className="font-semibold text-ink">{yearTotals.meetings}</b> toplantı ·{" "}
          <b className="font-semibold text-ink">{yearTotals.tasks}</b> görev
        </span>
      </CalendarToolbar>

      {/* 12 mini ay — telefonda 1, tablette 2-3, masaüstünde 4 sütun.

          `auto-rows-max` ŞART: bu kap `flex-1` ile KESİN bir yüksekliğe oturuyor
          ve ay kartlarının `overflow-hidden`'ı (yuvarlak köşeler için gerekli)
          onların otomatik asgari boyutunu 0 yapıyor. Varsayılan `auto` satırlar
          bu yüzden kabın boyuna sığacak kadar SIKIŞIYOR, kartlar da içeriğini
          kırpıyordu: her ay yalnız ilk 3-4 haftasını gösteriyordu (ölçüldü:
          kart 211px, içerik 299px; ızgaranın kaydırması hiç oluşmuyordu).
          Satırlar `max-content` olunca kartlar TAM boyunda çizilir, taşma
          ızgaranın kendi dikey kaydırmasına gider. `content-start` de satırları
          artan boşlukta germemesi için açıkça söyler. */}
      <div className="grid min-h-0 flex-1 auto-rows-max content-start grid-cols-1 gap-3 overflow-auto p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3 xl:grid-cols-4">
        {months.map(({ monthStart, days }, mi) => (
          <div key={mi} className="min-w-0 overflow-hidden rounded-card border border-line bg-surface">
            <button
              type="button"
              onClick={() => router.push(`/planning?v=ay&d=${format(monthStart, "yyyy-MM-dd")}`)}
              aria-label={`${TR_MONTHS[mi]} ${year} — ay görünümünde aç`}
              className="flex min-h-[40px] w-full items-center justify-between gap-2 border-b border-hairline bg-surface-muted px-3 py-2 text-left transition-colors duration-150 hover:bg-surface-hover"
            >
              <span className="truncate text-[13.5px] font-semibold tracking-tight text-ink">{TR_MONTHS[mi]}</span>
              <span className="shrink-0 text-[12px] font-medium text-subtle" aria-hidden>aç →</span>
            </button>

            <div className="grid grid-cols-7 px-2 pb-2 pt-1.5">
              {DOW.map((d, i) => (
                <span key={i} className="py-1 text-center text-[12px] font-semibold uppercase text-subtle">
                  {d}
                </span>
              ))}
              {days.map((day) => {
                const iso = format(day, "yyyy-MM-dd");
                // Ay dışı günler görünmez dolgudur (ızgara 6 haftaya tamamlanır):
                // tıklanmaz, ekran okuyucuya da okunmaz.
                const inMonth = isSameMonth(day, monthStart);
                const load = loadByDay[iso];
                const total = (load?.tasks ?? 0) + (load?.meetings ?? 0);
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => goDay(iso)}
                    disabled={!inMonth}
                    aria-hidden={!inMonth || undefined}
                    aria-label={inMonth ? `${format(day, "d")} ${TR_MONTHS[mi]}${total ? ` — ${load!.meetings} toplantı, ${load!.tasks} görev` : ""}` : undefined}
                    title={
                      inMonth && total
                        ? `${format(day, "d MMMM", { locale: tr })} — ${load!.meetings} toplantı, ${load!.tasks} görev`
                        : undefined
                    }
                    className={cn(
                      "m-px grid aspect-square place-items-center rounded text-[12px] tabular-nums transition-colors duration-150",
                      inMonth
                        ? "text-muted hover:bg-surface-hover hover:text-ink"
                        : "pointer-events-none text-transparent",
                      inMonth && dayTone(load),
                      inMonth && isToday(day) && "ring-1 ring-inset ring-brand",
                    )}
                  >
                    {format(day, "d")}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Gösterge */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline px-3 py-2 text-[12px] text-subtle sm:px-4">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-brand" /> toplantı var
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-brand-soft" /> görev yoğunluğu
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm ring-1 ring-inset ring-brand" /> bugün
        </span>
        <span>Bir güne tıklayınca o gün Ay görünümünde açılır.</span>
      </div>
    </section>
  );
}
