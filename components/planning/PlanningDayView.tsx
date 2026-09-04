"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO, addDays, subDays } from "date-fns";
import { tr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CalendarToolbar } from "./CalendarToolbar";
import { CalendarViewSwitch } from "./CalendarViewSwitch";
import { PlanningDayList } from "./PlanningDayList";
import { MeetingEditor } from "./MeetingEditor";
import { MeetingUndoBar, type DeletedMeeting } from "./MeetingUndoBar";
import { WEEKDAY_LONG_TR, type RuntimeBand } from "@/lib/planning/bands";
import type { PlanningMeetingWithTopics, PlanningTopic } from "@/types";

interface Props {
  /** Odaklanılan gün — yyyy-MM-dd. */
  day: string;
  meetings: PlanningMeetingWithTopics[];
  members: { id: string; name: string }[];
  memberNames: Record<string, string>;
  personHex?: Record<string, string>;
  isAdmin: boolean;
  bands: RuntimeBand[];
}

/**
 * GÜN ÖLÇEĞİ — takvimin en dar hâli.
 *
 * Aslı Hanım (2026-08-30): "Hafta, ay, yıl yazıyor ya; haftanın yanına gün
 * ekleyelim ve güne girelim… pop-up açılsın, biz gün saat vs seçelim, kendisi
 * takvime eklensin."
 *
 * Haftalık ızgara yedi günü yan yana gösterir; tek bir günün saatlerini
 * okumak ve o güne toplantı eklemek için ölçeğin bir kademe daha dar olması
 * gerekiyordu. Görünüm YENİ BİR DÜZEN İCAT ETMEZ: dar ekranda zaten kullanılan
 * gün listesinin (PlanningDayList) aynısını çizer — aynı şeritler, aynı saat
 * çifti (New York · İstanbul), aynı konu satırları. Fark yalnız kabuk:
 * haftanın yerine tek gün, ve gününü seçtiren bir gezinme.
 *
 * "Toplantı ekle" o günün İLK BOŞ saatiyle açılır; pencerede gün ve saat
 * ikisi de değiştirilebilir (bkz. MeetingEditor).
 */
export function PlanningDayView({
  day, meetings, members, memberNames, personHex = {}, isAdmin, bands,
}: Props) {
  const router = useRouter();
  const [editor, setEditor] = useState<
    | { meeting: PlanningMeetingWithTopics | null; day: string; slot: string; dayLabel: string;
        bandCategory?: PlanningMeetingWithTopics["category"]; bandLabel?: string }
    | null
  >(null);
  const [deleted, setDeleted] = useState<DeletedMeeting | null>(null);

  /* Hücre haritası ve konu satırları hafta ızgarasıyla AYNI sözleşmede:
     anahtar `gün|saat`. Tek gün olduğu için harita da tek günlük. */
  const byCell = useMemo(() => {
    const m = new Map<string, PlanningMeetingWithTopics[]>();
    for (const mt of meetings) {
      const iso = String(mt.meeting_date).slice(0, 10);
      const key = `${iso}|${String(mt.time_slot).slice(0, 5)}`;
      (m.get(key) ?? m.set(key, []).get(key)!).push(mt);
    }
    return m;
  }, [meetings]);

  const topicRows = useMemo(() => {
    const rows = new Map<string, (PlanningTopic | null)[]>();
    for (const [key, cell] of byCell) {
      const list = cell.flatMap((mt) => mt.topics ?? []);
      rows.set(key, list.length ? list : []);
    }
    return rows;
  }, [byCell]);

  /** Şeritlerde olmayan ama o gün kullanılmış saatler kaybolmasın. */
  const extraSlots = useMemo(() => {
    const known = new Set(bands.map((b) => b.slot));
    return [...new Set(meetings.map((m) => String(m.time_slot).slice(0, 5)))]
      .filter((s) => !known.has(s));
  }, [meetings, bands]);

  /** "Toplantı ekle" hangi saatle açılsın: o günün İLK BOŞ şeridi, hepsi
   *  doluysa ilk şerit (pencerede saat zaten değiştirilebilir). */
  const firstFreeSlot = (): string => {
    const free = bands.find((b) => (byCell.get(`${day}|${b.slot}`) ?? []).length === 0);
    return free?.slot ?? bands[0]?.slot ?? "09:00";
  };

  const todayIso = format(new Date(), "yyyy-MM-dd");
  const goto = (iso: string) => router.push(`/planning?v=gun&d=${iso}`);

  const openEditor = (iso: string, slot: string) => {
    if (!isAdmin) return;
    const cell = byCell.get(`${iso}|${slot}`) ?? [];
    const band = bands.find((b) => b.slot === slot);
    setEditor({
      meeting: cell[0] ?? null,
      day: iso,
      slot,
      dayLabel: `${WEEKDAY_LONG_TR[(parseISO(iso).getDay() + 6) % 7]} ${format(parseISO(iso), "d MMM", { locale: tr })}`,
      bandCategory: band?.category,
      bandLabel: band?.label,
    });
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <CalendarToolbar viewSwitch={<CalendarViewSwitch scale="gun" />}>
        <div className="inline-flex h-9 shrink-0 items-stretch overflow-hidden rounded-control border border-line bg-surface">
          <button
            type="button"
            onClick={() => goto(format(subDays(parseISO(day), 1), "yyyy-MM-dd"))}
            className="tap-target inline-flex w-9 items-center justify-center text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
            title="Önceki gün" aria-label="Önceki gün"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => goto(todayIso)}
            className="whitespace-nowrap border-x border-line px-3 text-[13px] font-medium text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
          >
            Bugün
          </button>
          <button
            type="button"
            onClick={() => goto(format(addDays(parseISO(day), 1), "yyyy-MM-dd"))}
            className="tap-target inline-flex w-9 items-center justify-center text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
            title="Sonraki gün" aria-label="Sonraki gün"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* TEK birincil eylem. Pencere o günün ilk BOŞ saatiyle açılır; gün ve
            saat pencerenin içinde değiştirilebilir. */}
        {isAdmin && (
          <Button size="sm" onClick={() => openEditor(day, firstFreeSlot())}>
            <Plus size={14} aria-hidden /> Toplantı ekle
          </Button>
        )}
      </CalendarToolbar>

      <div className="min-h-0 flex-1 overflow-auto p-2 sm:p-3 lg:p-4">
        <PlanningDayList
          singleDay
          weekDays={[day]}
          byCell={byCell}
          topicRows={topicRows}
          extraSlots={extraSlots}
          memberNames={memberNames}
          personHex={personHex}
          isAdmin={isAdmin}
          todayIso={todayIso}
          onOpen={(iso, slot) => openEditor(iso, slot)}
          bands={bands}
        />
      </div>

      {editor && (
        <MeetingEditor
          meeting={editor.meeting}
          day={editor.day}
          slot={editor.slot}
          dayLabel={editor.dayLabel}
          bandCategory={editor.bandCategory}
          bandLabel={editor.bandLabel}
          members={members}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); router.refresh(); }}
          onDeleted={(snap) => { setEditor(null); setDeleted(snap); router.refresh(); }}
        />
      )}

      <MeetingUndoBar deleted={deleted} onClear={() => setDeleted(null)} />
    </div>
  );
}
