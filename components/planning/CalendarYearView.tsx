"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarToolbar } from "./CalendarToolbar";
import {
  startOfYear, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isToday,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

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

  const months = useMemo(() => {
    const jan = startOfYear(new Date(year, 0, 1));
    return Array.from({ length: 12 }, (_, i) => {
      const monthStart = startOfMonth(new Date(jan.getFullYear(), i, 1));
      const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
      const gridEnd = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 1 });
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
        <div className="inline-flex h-9 items-stretch overflow-hidden rounded-lg border border-line bg-surface">
          <button
            onClick={() => setYear((y) => y - 1)}
            className="inline-flex w-9 items-center justify-center text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
            aria-label="Önceki yıl"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="grid min-w-16 place-items-center border-x border-line px-3 text-[13px] font-semibold tabular-nums text-ink">
            {year}
          </span>
          <button
            onClick={() => setYear((y) => y + 1)}
            className="inline-flex w-9 items-center justify-center text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
            aria-label="Sonraki yıl"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <button
          onClick={() => setYear(new Date().getFullYear())}
          className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-muted transition-colors duration-150 hover:border-line-strong hover:text-ink"
        >
          Bu yıl
        </button>
        <span className="hidden text-[12.5px] tabular-nums text-subtle sm:inline">
          <b className="font-semibold text-ink">{yearTotals.meetings}</b> toplantı ·{" "}
          <b className="font-semibold text-ink">{yearTotals.tasks}</b> görev
        </span>
      </CalendarToolbar>

      {/* 12 mini ay — telefonda 1, tablette 2-3, masaüstünde 4 sütun */}
      <div className="grid min-h-0 flex-1 gap-3 overflow-auto p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3 xl:grid-cols-4">
        {months.map(({ monthStart, days }, mi) => (
          <div key={mi} className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            <button
              onClick={() => router.push(`/planning?v=ay&d=${format(monthStart, "yyyy-MM-dd")}`)}
              className="flex w-full items-center justify-between border-b border-hairline bg-surface-muted px-3 py-2 text-left transition-colors duration-150 hover:bg-surface-hover"
            >
              <span className="text-[13px] font-semibold tracking-tight text-ink">{TR_MONTHS[mi]}</span>
              <span className="text-[11px] font-medium text-subtle">aç →</span>
            </button>

            <div className="grid grid-cols-7 px-2 pb-2 pt-1.5">
              {DOW.map((d, i) => (
                <span key={i} className="py-1 text-center text-[9.5px] font-semibold uppercase text-subtle">
                  {d}
                </span>
              ))}
              {days.map((day) => {
                const iso = format(day, "yyyy-MM-dd");
                const inMonth = isSameMonth(day, monthStart);
                const load = loadByDay[iso];
                const total = (load?.tasks ?? 0) + (load?.meetings ?? 0);
                return (
                  <button
                    key={iso}
                    onClick={() => goDay(iso)}
                    disabled={!inMonth}
                    title={
                      inMonth && total
                        ? `${format(day, "d MMMM")} — ${load!.meetings} toplantı, ${load!.tasks} görev`
                        : undefined
                    }
                    className={cn(
                      "m-px grid aspect-square place-items-center rounded text-[10.5px] tabular-nums transition-colors duration-150",
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
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[12px] text-subtle">
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
