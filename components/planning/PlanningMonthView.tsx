"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth,
  parseISO, startOfMonth, startOfWeek,
} from "date-fns";
import { tr } from "date-fns/locale";
import { CalendarCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { categoryMeta } from "@/lib/planning/categories";
import { WEEKDAY_SHORT_TR, type RuntimeBand } from "@/lib/planning/bands";
import { buildCells } from "@/lib/planning/cells";
import { CalendarToolbar } from "./CalendarToolbar";
import { PlanningDayView } from "./PlanningDayView";
import { MeetingEditor } from "./MeetingEditor";
import type { Member } from "./MemberMultiSelect";
import type { PlanningMeetingWithTopics } from "@/types";

/**
 * AY GÖRÜNÜMÜ — TOPLANTI takvimi.
 *
 * Sıraç (2026-09-10): "Ay ızgarası toplantıları göstersin… Bir güne bastıktan
 * sonra direkt haftalık olan açılıyor, yani KENDİ YERİNDE KALMIYOR. Bu
 * istediğimiz bir şey değil."
 *
 * İki sorun vardı ve ikisi de aynı kökten geliyordu: ay ölçeği Calendar
 * modülüne ait olmasına rağmen eski "Görev Takvimi"nden miras GÖREVLERİ
 * çiziyordu, güne tıklamak da kullanıcıyı hafta ekranına atıyordu.
 *
 * Artık hücrelerde o günün TOPLANTILARI yazıyor ve güne tıklamak gün kartını
 * AYNI SAYFANIN ÜSTÜNDE açıyor — kapatınca yine aydasınız. Kart, hafta
 * görünümündekinin birebir aynısı (PlanningDayView), veri de aynı yerden
 * (lib/planning/cells) geliyor: iki ölçek asla ayrışmaz.
 */
export function PlanningMonthView({
  monthIso, meetings, bands, members, memberNames, memberPhotos = {}, personHex = {},
  isAdmin, todayIso, viewSwitch,
}: {
  /** Görüntülenen ayın ilk günü (yyyy-MM-01). */
  monthIso: string;
  meetings: PlanningMeetingWithTopics[];
  bands: RuntimeBand[];
  members: Member[];
  memberNames: Record<string, string>;
  memberPhotos?: Record<string, string | null>;
  personHex?: Record<string, string>;
  isAdmin: boolean;
  todayIso: string;
  viewSwitch?: React.ReactNode;
}) {
  const router = useRouter();
  const month = parseISO(monthIso);

  /* Izgara TAM HAFTALARLA çizilir: ayın ilk günü çarşambaysa satır boşluktan
     başlamaz, önceki günler soluk görünür — takvimin bilinen şekli. */
  const gridDays = useMemo(() => {
    const from = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const to = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: from, end: to }).map((d) => format(d, "yyyy-MM-dd"));
  }, [month]);

  const { byCell, topicRows, extraSlots } = useMemo(
    () => buildCells(meetings, gridDays, bands),
    [meetings, gridDays, bands],
  );

  /** Bir günün toplantıları, saate göre. */
  const dayMeetings = useMemo(() => {
    const out = new Map<string, PlanningMeetingWithTopics[]>();
    for (const m of meetings) {
      const iso = String(m.meeting_date).slice(0, 10);
      if (!out.has(iso)) out.set(iso, []);
      out.get(iso)!.push(m);
    }
    for (const list of out.values()) list.sort((a, b) => a.time_slot.localeCompare(b.time_slot));
    return out;
  }, [meetings]);

  /* GÜN KARTI YERİNDE AÇILIR — adres değişmez, ay kaybolmaz. */
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [editor, setEditor] = useState<
    { meeting: PlanningMeetingWithTopics | null; day: string; slot: string; dayLabel: string;
      bandCategory?: RuntimeBand["category"]; bandLabel?: string; topicIndex?: number | null } | null
  >(null);

  const openEditor = (
    iso: string, slot: string,
    opts: { blank?: boolean; topicIndex?: number | null } = {},
  ) => {
    if (!isAdmin) return;
    const cell = byCell.get(`${iso}|${slot}`) ?? [];
    const band = bands.find((b) => b.slot === slot);
    setEditor({
      meeting: opts.blank ? null : (cell[0] ?? null),
      day: iso,
      slot,
      dayLabel: format(parseISO(iso), "EEEE d MMM", { locale: tr }),
      bandCategory: band?.category,
      bandLabel: band?.label,
      topicIndex: opts.blank || !cell[0] ? null : (opts.topicIndex ?? null),
    });
  };

  const gotoMonth = (delta: number) =>
    router.push(`/planning?v=ay&d=${format(addMonths(month, delta), "yyyy-MM-01")}`);
  const isCurrentMonth = isSameMonth(month, parseISO(todayIso));

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <CalendarToolbar viewSwitch={viewSwitch}>
        <div className="inline-flex h-9 shrink-0 items-stretch overflow-hidden rounded-control border border-line bg-surface">
          <button
            type="button" onClick={() => gotoMonth(-1)} aria-label="Önceki ay"
            className="tap-target inline-flex w-9 items-center justify-center text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="flex items-center whitespace-nowrap border-x border-line px-3 text-[13px] font-semibold text-ink">
            {format(month, "LLLL yyyy", { locale: tr })}
          </span>
          <button
            type="button" onClick={() => gotoMonth(1)} aria-label="Sonraki ay"
            className="tap-target inline-flex w-9 items-center justify-center text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        {!isCurrentMonth && (
          <button
            type="button"
            onClick={() => router.push(`/planning?v=ay&d=${todayIso.slice(0, 8)}01`)}
            className="anim-fade-down tap-target inline-flex h-9 shrink-0 items-center gap-1.5 rounded-control border border-brand-ring bg-brand-soft px-3 text-[13px] font-medium text-brand-strong transition-colors duration-150 hover:bg-brand hover:text-white"
          >
            <CalendarCheck size={14} aria-hidden /> Bu aya dön
          </button>
        )}
      </CalendarToolbar>

      <div className="min-h-0 flex-1 overflow-auto p-2 sm:p-3">
        <div className="overflow-hidden rounded-card border border-line-strong bg-surface">
          <div className="grid grid-cols-7 border-b border-line-strong bg-surface-muted">
            {WEEKDAY_SHORT_TR.map((d) => (
              <div key={d} className="border-r border-hairline px-2 py-1.5 text-center text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle last:border-r-0">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {gridDays.map((iso) => {
              const inMonth = isSameMonth(parseISO(iso), month);
              const list = dayMeetings.get(iso) ?? [];
              const isToday = iso === todayIso;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setOpenDay(iso)}
                  title={`${format(parseISO(iso), "d MMMM EEEE", { locale: tr })} — günü aç`}
                  className={cn(
                    "flex min-h-[92px] flex-col items-stretch gap-0.5 border-b border-r border-hairline p-1.5 text-left transition-colors duration-150 hover:bg-surface-muted",
                    !inMonth && "bg-surface-sunken/40 opacity-55",
                  )}
                >
                  <span className={cn(
                    "mb-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center self-start rounded-full text-[12px] font-semibold tabular-nums",
                    isToday ? "bg-brand text-white" : "text-ink",
                  )}>
                    {format(parseISO(iso), "d")}
                  </span>

                  {/* GÜNÜN TOPLANTILARI — üçten fazlası "+N" olarak toplanır;
                      hücre yükseklik kazanıp ızgarayı bozmasın. */}
                  {list.slice(0, 3).map((m) => {
                    const meta = categoryMeta(m.category);
                    const filled = (m.topics ?? []).filter((t) => (t.text ?? "").trim());
                    const allDone = filled.length > 0 && filled.every((t) => !!t.done_at);
                    return (
                      <span
                        key={m.id}
                        className={cn(
                          "block truncate rounded-[4px] px-1 py-px text-[11.5px] font-medium leading-tight",
                          meta.chip,
                          allDone && "line-through opacity-70",
                        )}
                      >
                        {m.title?.trim() || meta.label}
                      </span>
                    );
                  })}
                  {list.length > 3 && (
                    <span className="px-1 text-[11px] tabular-nums text-subtle">+{list.length - 3}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* GÜN KARTI — ayın ÜSTÜNDE, adres değişmeden. */}
      {openDay && (
        <PlanningDayView
          day={openDay}
          byCell={byCell}
          topicRows={topicRows}
          extraSlots={extraSlots}
          memberNames={memberNames}
          memberPhotos={memberPhotos}
          personHex={personHex}
          isAdmin={isAdmin}
          bands={bands}
          todayIso={todayIso}
          onDayChange={(iso) => setOpenDay(iso)}
          onOpenSlot={(iso, slot, topicIndex) => openEditor(iso, slot, { topicIndex })}
          onAddMeeting={(iso, slot) => openEditor(iso, slot, { blank: true })}
          onClose={() => setOpenDay(null)}
        />
      )}

      {editor && (
        <MeetingEditor
          meeting={editor.meeting}
          day={editor.day}
          slot={editor.slot}
          dayLabel={editor.dayLabel}
          bandCategory={editor.bandCategory}
          bandLabel={editor.bandLabel}
          focusTopicIndex={editor.topicIndex ?? null}
          members={members}
          personHex={personHex}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); router.refresh(); }}
          onDeleted={() => { setEditor(null); router.refresh(); }}
        />
      )}
    </div>
  );
}
