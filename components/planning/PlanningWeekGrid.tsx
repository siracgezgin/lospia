"use client";

import { format, parseISO } from "date-fns";
import { tr } from "date-fns/locale";
import { CheckCircle2, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { categoryMeta } from "@/lib/planning/categories";
import { PLANNING_BANDS, WEEKDAY_SHORT_EN, WEEKDAY_LONG_TR } from "@/lib/planning/bands";
import { KimBadges } from "./KimBadges";
import type { PlanningMeetingWithTopics, PlanningTopic } from "@/types";

interface Props {
  weekDays: string[];
  byCell: Map<string, PlanningMeetingWithTopics[]>;
  topicRows: Map<string, (PlanningTopic | null)[]>;
  rowCountOfSlot: Map<string, number>;
  extraSlots: string[];
  memberNames: Record<string, string>;
  /** Kişi rengi (profiles.id → hex) — baş harf rozetleri kendi renginde. */
  personHex?: Record<string, string>;
  isAdmin: boolean;
  todayIso: string;
  onOpen: (_iso: string, _slot: string, _dayIndex: number) => void;
}

/**
 * Aslı Hanım'ın Excel düzeni — masaüstü (lg ve üzeri).
 *
 * Satır iskeleti Excel'in aynısı: GÜN/TARİH → departman şeridi → saat satırı
 * (gün başlıkları) → Konu 1..N. Excel'deki ayrı "Kim" sütunu ekranda 336px
 * yiyip haftanın tamamının sığmasını engellediği için rozetler metnin akışına
 * alındı (bkz. KimBadges).
 */
export function PlanningWeekGrid({
  weekDays, byCell, topicRows, rowCountOfSlot, extraSlots, memberNames, personHex = {},
  isAdmin, todayIso, onOpen,
}: Props) {
  const allSlots = [...PLANNING_BANDS.map((b) => b.slot), ...extraSlots];

  // Excel mantığı: içeriği olmayan gün (çoğu hafta Pazar) sütunu daraltılır,
  // kazanılan genişlik dolu günlere gider — boş bir sütun 1fr yiyip metinleri
  // sıkıştırmasın. Yönetici o güne yine tıklayıp içerik ekleyebilir.
  const dayFilled = weekDays.map((iso) =>
    allSlots.some((slot) => {
      const cell = byCell.get(`${iso}|${slot}`) ?? [];
      if (cell.some((m) => m.title || m.content)) return true;
      return (topicRows.get(`${iso}|${slot}`) ?? []).some(Boolean);
    }),
  );
  const SLIM = 78;   // yalnız gün adı + tarih sığar
  const WIDE_MIN = 132;
  const cols =
    "64px " + weekDays.map((_, i) => (dayFilled[i] ? `minmax(${WIDE_MIN}px, 1fr)` : `${SLIM}px`)).join(" ");
  const minWidth = 64 + dayFilled.reduce((n, f) => n + (f ? WIDE_MIN : SLIM), 0);

  return (
    <div className="hidden overflow-auto overscroll-x-contain rounded-2xl border border-line-strong bg-surface shadow-card lg:block lg:max-h-[calc(100dvh-13rem)]">
      <div style={{ minWidth }}>
        {/* GÜN + TARİH — dikey kaydırmada üstte kalır */}
        <div className="sticky top-0 z-20 bg-surface-muted">
          <div className="grid border-b border-hairline" style={{ gridTemplateColumns: cols }}>
            <HeadCell>Gün</HeadCell>
            {weekDays.map((iso, i) => (
              <div
                key={iso}
                className={cn(
                  "border-r border-hairline px-2 py-1.5 text-center text-[12px] font-bold uppercase tracking-wide last:border-r-0",
                  iso === todayIso ? "bg-brand-soft text-brand-strong" : "text-ink",
                )}
              >
                {WEEKDAY_SHORT_EN[i]}
              </div>
            ))}
          </div>
          <div className="grid border-b border-line-strong" style={{ gridTemplateColumns: cols }}>
            <HeadCell>Tarih</HeadCell>
            {weekDays.map((iso, i) => (
              <div
                key={iso}
                title={WEEKDAY_LONG_TR[i]}
                className={cn(
                  "whitespace-nowrap border-r border-hairline px-1 py-1.5 text-center text-[12px] font-semibold tabular-nums last:border-r-0",
                  iso === todayIso ? "bg-brand-soft text-brand" : "text-muted",
                )}
              >
                {/* Daraltılmış (boş) sütunda uzun ay adı satır kırıyordu. */}
                {format(parseISO(iso), dayFilled[i] ? "d MMMM" : "d MMM", { locale: tr })}
              </div>
            ))}
          </div>
        </div>

        {PLANNING_BANDS.map((band) => {
          const meta = categoryMeta(band.category);
          const rowCount = rowCountOfSlot.get(band.slot) ?? 3;
          return (
            <div key={band.slot}>
              {/* Departman şeridi — yatay kaydırmada da okunur kalsın diye
                  etiket sola sabitlenir (ortalanmış metin ekrandan kaçıyordu). */}
              <div className={cn("border-y border-hairline", meta.chip)}>
                <span className="sticky left-0 inline-block px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-[0.14em]">
                  {band.label}
                </span>
              </div>

              {/* Saat satırı — gün başlıkları */}
              <div className="grid border-b border-hairline" style={{ gridTemplateColumns: cols }}>
                <SlotLabel>{band.slot}</SlotLabel>
                {weekDays.map((iso, i) => {
                  const cell = byCell.get(`${iso}|${band.slot}`) ?? [];
                  const title = cell.map((m) => m.title).filter(Boolean).join(" · ");
                  const content = cell.map((m) => m.content).filter(Boolean).join(" · ");
                  const ids = [...new Set(cell.flatMap((m) => m.participant_ids ?? []))];
                  const kim = cell.map((m) => m.kim).filter(Boolean).join(", ");
                  const collabIds = [...new Set(cell.flatMap((m) => m.collaborator_ids ?? []))];
                  return (
                    <div
                      key={iso}
                      onClick={isAdmin ? () => onOpen(iso, band.slot, i) : undefined}
                      className={cn(
                        // Başlıklar dikeyde ORTALANIR: bir gün iki satıra taşınca
                        // (One of a kind / Upcycle) tek satırlık komşuları
                        // yukarıda asılı kalmasın — satır boyu hizalı görünür.
                        "group/cell flex min-h-[38px] items-center border-r border-hairline px-2 py-1.5 last:border-r-0",
                        meta.cell,
                        isAdmin && "cursor-pointer transition-colors duration-150 hover:brightness-[0.97]",
                      )}
                    >
                      <span className="min-w-0">
                        <span className={cn("text-[12.5px] font-bold leading-[1.25] tracking-tight", meta.title)}>
                          {title}
                        </span>
                        <KimBadges ids={ids} kim={kim} collaboratorIds={collabIds} memberNames={memberNames} personHex={personHex} />
                        {content && (
                          <span className="mt-0.5 block whitespace-pre-line text-[11.5px] leading-snug text-ink/70">
                            {content}
                          </span>
                        )}
                        {isAdmin && !title && !content && (
                          <span className="inline-flex items-center gap-0.5 text-[11.5px] text-ink/35 opacity-0 transition-opacity group-hover/cell:opacity-100">
                            <Plus size={11} /> başlık
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Konu satırları */}
              {Array.from({ length: rowCount }, (_, ti) => (
                <div key={ti} className="grid border-b border-hairline" style={{ gridTemplateColumns: cols }}>
                  <RowLabel>Konu {ti + 1}</RowLabel>
                  {weekDays.map((iso, i) => {
                    const t = topicRows.get(`${iso}|${band.slot}`)?.[ti] ?? null;
                    return (
                      <div
                        key={iso}
                        onClick={isAdmin ? () => onOpen(iso, band.slot, i) : undefined}
                        className={cn(
                          "min-h-[30px] border-r border-hairline px-2 py-1.5 text-[12px] leading-snug text-ink/90 last:border-r-0",
                          iso === todayIso && "bg-brand-soft/25",
                          isAdmin && "cursor-pointer transition-colors duration-150 hover:bg-brand-soft/50",
                        )}
                      >
                        {t?.text}
                        {t?.task_id && (
                          <CheckCircle2 size={11} className="ml-1 inline shrink-0 text-emerald-600" aria-label="Göreve atandı" />
                        )}
                        {t && <KimBadges ids={t.participant_ids} kim={t.kim} collaboratorIds={t.collaborator_ids} memberNames={memberNames} personHex={personHex} />}
                        {t?.due_date && (
                          <span className="ml-1 whitespace-nowrap text-[10.5px] tabular-nums text-subtle">
                            {format(parseISO(t.due_date), "d MMM", { locale: tr })}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}

        {/* Şerit dışı saatler (elle eklenmiş) — kaybolmasınlar */}
        {extraSlots.map((slot) => (
          <div key={slot} className="grid border-b border-hairline" style={{ gridTemplateColumns: cols }}>
            <SlotLabel>{slot}</SlotLabel>
            {weekDays.map((iso, i) => (
              <div
                key={iso}
                onClick={isAdmin ? () => onOpen(iso, slot, i) : undefined}
                className={cn(
                  "min-h-[34px] border-r border-hairline px-2 py-1.5 text-[12px] leading-snug text-ink/90 last:border-r-0",
                  isAdmin && "cursor-pointer hover:bg-brand-soft/50",
                )}
              >
                {(byCell.get(`${iso}|${slot}`) ?? []).map((m) => (
                  <span key={m.id} className="block">{[m.title, m.content].filter(Boolean).join(" — ")}</span>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function HeadCell({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky left-0 z-10 border-r border-hairline bg-surface-muted px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">
      {children}
    </div>
  );
}

function SlotLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky left-0 z-10 border-r border-hairline bg-surface px-2.5 py-1.5 text-[12px] font-bold tabular-nums text-ink">
      {children}
    </div>
  );
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky left-0 z-10 border-r border-hairline bg-surface px-2.5 py-1.5 text-[11.5px] font-medium text-subtle">
      {children}
    </div>
  );
}
