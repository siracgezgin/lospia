"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { tr } from "date-fns/locale";
import { CheckCircle2, Clock, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { categoryMeta } from "@/lib/planning/categories";
import { WEEKDAY_LONG_TR, WEEKDAY_SHORT_TR, type RuntimeBand } from "@/lib/planning/bands";
import { BandEditor } from "./BandEditor";
import { istanbulLabel, AWAY_LABEL } from "@/lib/planning/timezones";
import { KimBadges } from "./KimBadges";
import type { PlanningMeetingWithTopics, PlanningTopic } from "@/types";

interface Props {
  weekDays: string[];
  byCell: Map<string, PlanningMeetingWithTopics[]>;
  topicRows: Map<string, (PlanningTopic | null)[]>;
  extraSlots: string[];
  memberNames: Record<string, string>;
  /** Kişi rengi (profiles.id → hex) — baş harf rozetleri kendi renginde. */
  personHex?: Record<string, string>;
  isAdmin: boolean;
  todayIso: string;
  onOpen: (_iso: string, _slot: string, _dayIndex: number) => void;
  /** Sol sütun — masaüstündeki ızgarayla AYNI kaynak (20240326). */
  bands: RuntimeBand[];
}

/**
 * Aynı takvimin dar ekran görünümü (lg altı).
 *
 * 7 gün × 4 şerit ızgarası telefonda 1500px genişliğinde bir kaydırma
 * labirentine dönüşüyordu. Burada gün SEÇİLİR, o günün şeritleri alt alta
 * okunur — bilgi aynı, gezinme parmakla mümkün.
 */
export function PlanningDayList({
  weekDays, byCell, topicRows, extraSlots, memberNames, personHex = {}, isAdmin, todayIso,
  onOpen, bands,
}: Props) {
  const todayIdx = weekDays.indexOf(todayIso);
  const [dayIdx, setDayIdx] = useState(todayIdx >= 0 ? todayIdx : 0);
  const iso = weekDays[dayIdx] ?? weekDays[0];

  /* ŞERİT DÜZENLEME dar ekranda hiç yoktu: "Saat ekle" ve şeridin kalemi
     yalnız masaüstü ızgarasındaydı (2026-08-29: "Saat ekle nerede?").
     Telefondan bakan biri yeni bir saat açamıyor, var olanın adını ya da
     saatini değiştiremiyordu — oysa şerit haftanın iskeleti.
     `null` kapalı · `"new"` yeni saat · başka bir değer o şeridin SAATİ.
     Kimlik olarak `band.id` KULLANILMAZ: tablo henüz doldurulmamışken kod
     varsayılanlarının hepsinde id `null`'dır ve tek kaleme basınca bütün
     şeritler açılırdı. Saat listede tekildir (masaüstü ızgarası da satır
     anahtarını böyle kuruyor). */
  const [editingBand, setEditingBand] = useState<string | null>(null);
  /* Saat çevirimi (NY → İstanbul) haftanın ilk gününe göre yapılır —
     masaüstü ızgarasıyla aynı kaynak. */
  const weekRefDay = weekDays[0];

  /* Saatler KRONOLOJİK — masaüstü ızgarasıyla aynı sıra. Şerit dışı saat
     (elle girilmiş 11:11) listenin dibine düşmez, yerine oturur. */
  const slots = [...bands.map((b) => b.slot), ...extraSlots].sort((a, b) => {
    const mins = (v: string) => {
      const m = /^(\d{1,2}):(\d{2})/.exec(v);
      return m ? +m[1] * 60 + +m[2] : 24 * 60 + 1;
    };
    return mins(a) - mins(b);
  });

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
          const band = bands.find((b) => b.slot === slot);
          const cell = byCell.get(`${iso}|${slot}`) ?? [];
          const meta = categoryMeta(band?.category ?? cell[0]?.category ?? "other");
          const title = cell.map((m) => m.title).filter(Boolean).join(" · ");
          const content = cell.map((m) => m.content).filter(Boolean).join(" · ");
          const ids = [...new Set(cell.flatMap((m) => m.participant_ids ?? []))];
          const kim = cell.map((m) => m.kim).filter(Boolean).join(", ");
          const collabIds = [...new Set(cell.flatMap((m) => m.collaborator_ids ?? []))];
          const topics = (topicRows.get(`${iso}|${slot}`) ?? []).filter(Boolean) as PlanningTopic[];

          // Boş şeridi üyeye gösterme — yönetici ekleyebilsin diye ona kalır.
          if (!title && !content && topics.length === 0 && !isAdmin) return null;

          if (isAdmin && band && editingBand === slot) {
            return (
              <div key={slot} className="overflow-hidden rounded-xl border border-brand-ring bg-surface shadow-card">
                <BandEditor band={band} refDay={weekRefDay} onClose={() => setEditingBand(null)} />
              </div>
            );
          }

          return (
            <section
              key={slot}
              className="relative overflow-hidden rounded-xl border border-line bg-surface shadow-card"
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
                {/* Saat çifti — kayıtlı New York saati ve İstanbul karşılığı
                    (Aslı Hanım, 2026-08-28). */}
                <span className="mt-px shrink-0 rounded bg-ink/[0.07] px-1.5 py-0.5 text-center leading-tight">
                  <span className="block text-[11px] font-bold tabular-nums text-ink/70">{slot}</span>
                  {istanbulLabel(iso, slot) && (
                    <span className="block text-[9.5px] font-medium tabular-nums text-ink/45">
                      {AWAY_LABEL} {istanbulLabel(iso, slot)}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[10px] font-bold uppercase tracking-[0.12em] opacity-70", meta.title)}>
                    {band?.label ?? meta.label}
                  </span>
                  <span className={cn("block text-[13.5px] font-bold leading-snug tracking-tight", meta.title)}>
                    {title || "—"}
                  </span>
                  <KimBadges ids={ids} kim={kim} collaboratorIds={collabIds} memberNames={memberNames} className="ml-0 mt-1" personHex={personHex} />
                  {content && (
                    <span className="mt-1 block whitespace-pre-line text-[12px] leading-snug text-ink/70">
                      {content}
                    </span>
                  )}
                </span>
              </button>

              {/* Şeridi düzenle — toplantı açan gövdeden AYRI bir düğme.
                  İç içe <button> geçersiz HTML'dir, bu yüzden kardeş olarak
                  ve mutlak konumda durur. */}
              {isAdmin && band && (
                <button
                  onClick={() => setEditingBand(slot)}
                  title={`${band.label || meta.label} — saati ve adını düzenle`}
                  aria-label="Şeridi düzenle"
                  className="absolute right-1.5 top-1.5 rounded-md p-1.5 text-ink/35 transition-colors duration-150 hover:bg-surface/70 hover:text-ink"
                >
                  <Pencil size={13} />
                </button>
              )}

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
                        <KimBadges ids={t.participant_ids} kim={t.kim} collaboratorIds={t.collaborator_ids} memberNames={memberNames} personHex={personHex} />
                        {/* Yalnız o günden FARKLI teslim tarihi yazılır. */}
                        {t.due_date && t.due_date.slice(0, 10) !== iso && (
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

        {/* SAAT EKLE — listenin sonunda, masaüstü ızgarasındaki düğmenin
            karşılığı. Şerit haftanın iskeletidir; telefondan bakan biri de
            yeni bir saat açabilmeli (2026-08-29: "Saat ekle nerede?"). */}
        {isAdmin && (
          editingBand === "new" ? (
            <div className="overflow-hidden rounded-xl border border-brand-ring bg-surface shadow-card">
              <BandEditor
                band={{ id: null, slot: "13:00", category: "other", label: "", topicRows: 3, columns: [] }}
                refDay={weekRefDay}
                onClose={() => setEditingBand(null)}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingBand("new")}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line bg-surface/60 py-2.5 text-[12.5px] font-medium text-subtle transition-colors duration-150 hover:border-brand-ring hover:bg-brand-soft/30 hover:text-brand"
            >
              <Clock size={13} /> Saat ekle
            </button>
          )
        )}
      </div>
    </div>
  );
}
