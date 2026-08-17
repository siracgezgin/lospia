"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { tr } from "date-fns/locale";
import { CheckCircle2, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { categoryMeta } from "@/lib/planning/categories";
import { PLANNING_BANDS, WEEKDAY_LONG_TR, WEEKDAY_SHORT_TR } from "@/lib/planning/bands";
import { KimBadges } from "./KimBadges";
import type { PlanningMeetingWithTopics, PlanningTopic } from "@/types";

interface Props {
  weekDays: string[];
  byCell: Map<string, PlanningMeetingWithTopics[]>;
  topicRows: Map<string, (PlanningTopic | null)[]>;
  extraSlots: string[];
  memberNames: Record<string, string>;
  isAdmin: boolean;
  todayIso: string;
  onOpen: (_iso: string, _slot: string, _dayIndex: number) => void;
}

/**
 * Aynı takvimin dar ekran görünümü (lg altı).
 *
 * 7 gün × 4 şerit ızgarası telefonda 1500px genişliğinde bir kaydırma
 * labirentine dönüşüyordu. Burada gün SEÇİLİR, o günün şeritleri alt alta
 * okunur — bilgi aynı, gezinme parmakla mümkün.
 */
export function PlanningDayList({
  weekDays, byCell, topicRows, extraSlots, memberNames, isAdmin, todayIso, onOpen,
}: Props) {
  const todayIdx = weekDays.indexOf(todayIso);
  const [dayIdx, setDayIdx] = useState(todayIdx >= 0 ? todayIdx : 0);
  const iso = weekDays[dayIdx] ?? weekDays[0];

  // O günde içeriği olan şeritler önce; boş şeritler de görünür (yönetici ekler).
  const slots = [...PLANNING_BANDS.map((b) => b.slot), ...extraSlots];

  return (
    <div className="lg:hidden">
      {/* Gün seçici — yatayda kayar, seçili gün ortada kalır */}
      <div
        role="tablist"
        aria-label="Haftanın günleri"
        className="-mx-1 mb-3 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1"
      >
        {weekDays.map((d, i) => {
          const active = i === dayIdx;
          const count = slots.reduce(
            (n, s) => n + (byCell.get(`${d}|${s}`)?.length ?? 0), 0,
          );
          return (
            <button
              key={d}
              role="tab"
              aria-selected={active}
              onClick={() => setDayIdx(i)}
              className={cn(
                "flex min-w-[64px] shrink-0 snap-start flex-col items-center rounded-xl border px-2.5 py-1.5 transition-all duration-150 active:scale-[0.97]",
                active
                  ? "border-brand bg-brand text-white shadow-card"
                  : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
              )}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide">
                {WEEKDAY_SHORT_TR[i]}
              </span>
              <span className={cn("text-[13px] font-bold tabular-nums", !active && d === todayIso && "text-brand")}>
                {format(parseISO(d), "d")}
              </span>
              <span
                className={cn(
                  "mt-0.5 h-1 w-1 rounded-full",
                  count > 0 ? (active ? "bg-white/70" : "bg-brand/50") : "bg-transparent",
                )}
                aria-hidden
              />
            </button>
          );
        })}
      </div>

      <p className="mb-2 px-0.5 text-[12.5px] font-medium text-muted">
        {WEEKDAY_LONG_TR[dayIdx]} · {format(parseISO(iso), "d MMMM yyyy", { locale: tr })}
      </p>

      <div className="space-y-2.5">
        {slots.map((slot) => {
          const band = PLANNING_BANDS.find((b) => b.slot === slot);
          const cell = byCell.get(`${iso}|${slot}`) ?? [];
          const meta = categoryMeta(band?.category ?? cell[0]?.category ?? "other");
          const title = cell.map((m) => m.title).filter(Boolean).join(" · ");
          const content = cell.map((m) => m.content).filter(Boolean).join(" · ");
          const ids = [...new Set(cell.flatMap((m) => m.participant_ids ?? []))];
          const kim = cell.map((m) => m.kim).filter(Boolean).join(", ");
          const topics = (topicRows.get(`${iso}|${slot}`) ?? []).filter(Boolean) as PlanningTopic[];

          // Boş şeridi üyeye gösterme — yönetici ekleyebilsin diye ona kalır.
          if (!title && !content && topics.length === 0 && !isAdmin) return null;

          return (
            <section
              key={slot}
              className="overflow-hidden rounded-xl border border-line bg-surface shadow-card"
            >
              <button
                onClick={isAdmin ? () => onOpen(iso, slot, dayIdx) : undefined}
                disabled={!isAdmin}
                className={cn(
                  "flex w-full items-start gap-2 px-3 py-2 text-left",
                  meta.cell,
                  isAdmin && "transition-[filter] duration-150 active:brightness-95",
                )}
              >
                <span className="mt-px shrink-0 rounded bg-ink/[0.07] px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-ink/70">
                  {slot}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[10px] font-bold uppercase tracking-[0.12em] opacity-70", meta.title)}>
                    {band?.label ?? meta.label}
                  </span>
                  <span className={cn("block text-[13.5px] font-bold leading-snug tracking-tight", meta.title)}>
                    {title || (isAdmin ? "— başlık ekle" : "—")}
                  </span>
                  <KimBadges ids={ids} kim={kim} memberNames={memberNames} className="ml-0 mt-1" />
                  {content && (
                    <span className="mt-1 block whitespace-pre-line text-[12px] leading-snug text-ink/70">
                      {content}
                    </span>
                  )}
                </span>
                {isAdmin && <Pencil size={13} className="mt-0.5 shrink-0 text-ink/35" />}
              </button>

              {topics.length > 0 ? (
                <ol className="divide-y divide-hairline">
                  {topics.map((t, i) => (
                    <li key={t.id} className="flex items-start gap-2 px-3 py-2">
                      <span className="mt-px shrink-0 text-[11px] font-semibold tabular-nums text-subtle">
                        {i + 1}.
                      </span>
                      <span className="min-w-0 flex-1 text-[13px] leading-snug text-ink/90">
                        {t.text}
                        {t.task_id && (
                          <CheckCircle2 size={12} className="ml-1 inline shrink-0 text-emerald-600" aria-label="Göreve atandı" />
                        )}
                        <KimBadges ids={t.participant_ids} kim={t.kim} memberNames={memberNames} />
                        {t.due_date && (
                          <span className="ml-1 whitespace-nowrap text-[11px] tabular-nums text-subtle">
                            {format(parseISO(t.due_date), "d MMM", { locale: tr })}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                isAdmin && (
                  <button
                    onClick={() => onOpen(iso, slot, dayIdx)}
                    className="flex w-full items-center justify-center gap-1 border-t border-hairline py-2 text-[12.5px] font-medium text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-brand"
                  >
                    <Plus size={12} /> Konu ekle
                  </button>
                )
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
