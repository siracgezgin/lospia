"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO, addDays, subDays } from "date-fns";
import { tr } from "date-fns/locale";
import {
  CalendarRange, ChevronLeft, ChevronRight, Plus, Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { PLANNING_CATEGORIES, categoryMeta } from "@/lib/planning/categories";
import { MeetingEditor } from "./MeetingEditor";
import { MemberInitials, type Member } from "./MemberMultiSelect";
import type { PlanningMeetingWithTopics } from "@/types";

interface Props {
  meetings: PlanningMeetingWithTopics[];
  weekDays: string[];   // 7 × yyyy-MM-dd (Pzt→Paz)
  weekStart: string;    // Pazartesi yyyy-MM-dd
  members: Member[];
  memberNames: Record<string, string>;
}

const DAY_LABELS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const DEFAULT_SLOTS = ["09:00", "10:00", "11:00", "12:00"];

export function PlanningBoard({ meetings, weekDays, weekStart, members, memberNames }: Props) {
  const router = useRouter();
  const [editor, setEditor] = useState<
    { meeting: PlanningMeetingWithTopics | null; day: string; slot: string; dayLabel: string } | null
  >(null);

  // Saat blokları: varsayılan + veride olanlar.
  const slots = useMemo(() => {
    const set = new Set<string>(DEFAULT_SLOTS);
    meetings.forEach((m) => set.add(m.time_slot));
    return [...set].sort();
  }, [meetings]);

  // (gün|saat) → toplantılar
  const byCell = useMemo(() => {
    const map = new Map<string, PlanningMeetingWithTopics[]>();
    for (const m of meetings) {
      const key = `${m.meeting_date}|${m.time_slot}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return map;
  }, [meetings]);

  const gotoWeek = (isoMonday: string) => router.push(`/planning?week=${isoMonday}`);
  const dayLabelOf = (iso: string, i: number) => `${DAY_LABELS[i]} ${format(parseISO(iso), "d MMM", { locale: tr })}`;

  const todayIso = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
      <ModulePageHeader
        title="Planlama"
        description="Haftalık toplantı takvimi — her gün ve saat için toplantılar, altında konular. Renkler kategoriyi gösterir."
        icon={CalendarRange}
        secondaryBackHref="/board"
        rightSlot={
          <div className="flex shrink-0 items-center gap-1.5">
            <button onClick={() => gotoWeek(format(subDays(parseISO(weekStart), 7), "yyyy-MM-dd"))} className="rounded-lg border border-line bg-surface p-2 text-muted hover:bg-surface-muted hover:text-ink" title="Önceki hafta">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => gotoWeek(format(new Date(), "yyyy-MM-dd"))} className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium text-muted hover:bg-surface-muted hover:text-ink">
              Bu hafta
            </button>
            <button onClick={() => gotoWeek(format(addDays(parseISO(weekStart), 7), "yyyy-MM-dd"))} className="rounded-lg border border-line bg-surface p-2 text-muted hover:bg-surface-muted hover:text-ink" title="Sonraki hafta">
              <ChevronRight size={16} />
            </button>
          </div>
        }
      />

      {/* Kategori açıklaması (legend) */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {PLANNING_CATEGORIES.filter((c) => c.key !== "other").map((c) => (
          <span key={c.key} className="inline-flex items-center gap-1.5 text-[11.5px] text-muted">
            <span className={cn("h-2.5 w-2.5 rounded-sm", c.dot)} /> {c.label}
          </span>
        ))}
      </div>

      {/* Izgara */}
      <div className="overflow-x-auto rounded-2xl border border-line-strong bg-surface shadow-card">
        <div className="min-w-[1100px]">
          {/* Başlık satırı */}
          <div className="grid border-b border-line-strong bg-surface-muted" style={{ gridTemplateColumns: "72px repeat(7, minmax(0, 1fr))" }}>
            <div className="border-r border-line px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">Saat</div>
            {weekDays.map((iso, i) => (
              <div key={iso} className={cn("border-r border-line px-2 py-2 text-center last:border-r-0", iso === todayIso && "bg-brand-soft")}>
                <div className="text-[12px] font-semibold text-ink">{DAY_LABELS[i]}</div>
                <div className="text-[11px] text-subtle">{format(parseISO(iso), "d MMM", { locale: tr })}</div>
              </div>
            ))}
          </div>

          {/* Saat satırları */}
          {slots.map((slot) => (
            <div key={slot} className="grid border-b border-line last:border-b-0" style={{ gridTemplateColumns: "72px repeat(7, minmax(0, 1fr))" }}>
              <div className="border-r border-line px-2 py-2 text-[12px] font-semibold text-muted">{slot}</div>
              {weekDays.map((iso, i) => {
                const cell = byCell.get(`${iso}|${slot}`) ?? [];
                return (
                  <div key={iso} className="group/cell min-h-[84px] border-r border-line p-1.5 last:border-r-0">
                    <div className="space-y-1.5">
                      {cell.map((m) => {
                        const meta = categoryMeta(m.category);
                        return (
                          <div
                            key={m.id}
                            onClick={() => setEditor({ meeting: m, day: iso, slot, dayLabel: dayLabelOf(iso, i) })}
                            className={cn("group cursor-pointer rounded-lg border p-2 text-left transition-shadow hover:shadow-sm", meta.cell)}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <div className="min-w-0 flex-1">
                                <div className={cn("text-[12px] font-bold leading-snug", meta.title)}>
                                  {meta.label}{m.title ? ` / ${m.title}` : ""}
                                </div>
                                {m.content && <p className="mt-0.5 whitespace-pre-line text-[11px] leading-snug text-ink/80">{m.content}</p>}
                              </div>
                              <Pencil size={12} className="shrink-0 text-ink/40 opacity-0 transition-opacity group-hover:opacity-100" />
                            </div>
                            {m.participant_ids?.length > 0 && (
                              <div className="mt-1">
                                <span className="inline-flex items-center gap-1 rounded bg-black/5 px-1.5 py-0.5">
                                  <MemberInitials ids={m.participant_ids} memberNames={memberNames} />
                                </span>
                              </div>
                            )}
                            {/* Konular — Excel gibi hep görünür, satır satır */}
                            {m.topics.length > 0 && (
                              <ul className="mt-1.5 space-y-1 border-t border-black/10 pt-1.5">
                                {m.topics.map((t, ti) => (
                                  <li key={t.id} className="flex items-start gap-1.5 text-[11px] text-ink/85">
                                    <span className="mt-px shrink-0 font-semibold text-ink/50">{ti + 1}.</span>
                                    <span className="min-w-0 flex-1">{t.text}</span>
                                    {t.participant_ids?.length > 0 && (
                                      <MemberInitials ids={t.participant_ids} memberNames={memberNames} className="shrink-0" />
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                      <button
                        onClick={() => setEditor({ meeting: null, day: iso, slot, dayLabel: dayLabelOf(iso, i) })}
                        className={cn(
                          "flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-line py-1 text-[11px] text-subtle transition-opacity hover:border-brand hover:text-brand",
                          cell.length === 0 ? "opacity-100" : "opacity-0 group-hover/cell:opacity-100",
                        )}
                        title="Toplantı ekle"
                      >
                        <Plus size={12} /> Ekle
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 px-1 text-[12px] text-subtle">
        Bir kutuya tıklayınca konular açılır · kalem simgesiyle düzenle · boş hücrede “Ekle”.
      </p>

      {editor && (
        <MeetingEditor
          meeting={editor.meeting}
          day={editor.day}
          slot={editor.slot}
          dayLabel={editor.dayLabel}
          members={members}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); router.refresh(); }}
        />
      )}
    </div>
  );
}
