"use client";

import { Grid2X2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { categoryMeta } from "@/lib/planning/categories";
import { MATRIX_COLUMNS, MATRIX_WEEKDAYS, WEEKDAY_SHORT_EN, WEEKDAY_LONG_TR } from "@/lib/planning/bands";
import { KimBadges } from "./KimBadges";
import type { PlanningWeekMatrixRow } from "@/types";

interface Props {
  rows: PlanningWeekMatrixRow[];
  memberNames: Record<string, string>;
  /** Tablo henüz migrate edilmediyse bölüm bilgi notuyla kapanır. */
  available: boolean;
}

/**
 * Takvimin altındaki "Tarih/Saat × departman" bloğu.
 * Geniş ekranda Excel'deki tablo; dar ekranda gün gün kart (6 sütunlu tablo
 * telefonda 1200px'lik bir kaydırma alanına dönüşüyordu).
 */
export function WeekMatrix({ rows, memberNames, available }: Props) {
  if (!available) {
    return (
      <section className="mt-6">
        <Header />
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] font-medium text-amber-900">
          Bu bölüm için veritabanı güncellemesi bekleniyor (planning_week_matrix).
        </p>
      </section>
    );
  }

  const byCell = new Map<string, PlanningWeekMatrixRow>();
  for (const r of rows) byCell.set(`${r.weekday}|${r.category}`, r);

  // Hiç satırı olmayan departman sütununu çizme — boş "AI" sütunu yer yiyordu.
  const cols = MATRIX_COLUMNS.filter((c) =>
    MATRIX_WEEKDAYS.some((wd) => {
      const r = byCell.get(`${wd}|${c.category}`);
      return !!(r?.text || r?.kim || r?.participant_ids?.length);
    }),
  );
  if (cols.length === 0) return null;

  const gridCols = `92px repeat(${cols.length}, minmax(0, 1fr))`;
  const minWidth = 92 + cols.length * 150;

  return (
    <section className="mt-6">
      <Header />

      {/* Geniş ekran — Excel tablosu */}
      <div className="hidden overflow-x-auto overscroll-x-contain rounded-2xl border border-line-strong bg-surface shadow-card lg:block">
        <div style={{ minWidth }}>
          <div className="grid border-b border-line-strong bg-surface-muted" style={{ gridTemplateColumns: gridCols }}>
            <div className="border-r border-hairline px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">
              Tarih / Saat
            </div>
            {cols.map((c) => {
              const meta = categoryMeta(c.category);
              return (
                <div key={c.category} className={cn("border-r border-hairline px-2 py-1.5 text-[12px] font-bold tracking-tight last:border-r-0", meta.title)}>
                  {c.label}
                </div>
              );
            })}
          </div>

          {MATRIX_WEEKDAYS.map((wd) => (
            <div key={wd} className="grid border-b border-hairline last:border-b-0" style={{ gridTemplateColumns: gridCols }}>
              <div className="border-r border-hairline bg-surface px-2.5 py-1.5 text-[12px] font-bold tabular-nums text-ink">
                {WEEKDAY_SHORT_EN[wd]} 09:00
              </div>
              {cols.map((c) => {
                const row = byCell.get(`${wd}|${c.category}`);
                const meta = categoryMeta(c.category);
                return (
                  <div
                    key={c.category}
                    className={cn(
                      "min-h-[34px] border-r border-hairline px-2 py-1.5 text-[12px] leading-snug text-ink/90 last:border-r-0",
                      row?.text && meta.cell,
                    )}
                  >
                    {row?.text}
                    {row && <KimBadges ids={row.participant_ids} kim={row.kim} memberNames={memberNames} />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Dar ekran — gün gün kart */}
      <div className="space-y-2.5 lg:hidden">
        {MATRIX_WEEKDAYS.map((wd) => {
          const filled = cols
            .map((c) => ({ c, row: byCell.get(`${wd}|${c.category}`) }))
            .filter(({ row }) => row?.text || row?.kim || row?.participant_ids?.length);
          if (!filled.length) return null;
          return (
            <div key={wd} className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
              <div className="border-b border-hairline bg-surface-muted px-3 py-1.5 text-[12px] font-bold text-ink">
                {WEEKDAY_LONG_TR[wd]} · 09:00
              </div>
              <ul className="divide-y divide-hairline">
                {filled.map(({ c, row }) => {
                  const meta = categoryMeta(c.category);
                  return (
                    <li key={c.category} className="flex items-start gap-2 px-3 py-2">
                      <span className={cn("mt-px shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide", meta.chip)}>
                        {c.label}
                      </span>
                      <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-ink/90">
                        {row?.text}
                        {row && <KimBadges ids={row.participant_ids} kim={row.kim} memberNames={memberNames} />}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Header() {
  return (
    <h2 className="mb-2 inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink">
      <Grid2X2 size={16} className="text-muted" />
      Tarih / Saat — Departman Dağılımı
    </h2>
  );
}
