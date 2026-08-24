"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO, addDays, subDays } from "date-fns";
import { tr } from "date-fns/locale";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { PLANNING_BANDS, TOPIC_ROWS, WEEKDAY_LONG_TR } from "@/lib/planning/bands";
import { MeetingEditor } from "./MeetingEditor";
import { PlanningWeekGrid } from "./PlanningWeekGrid";
import { PlanningDayList } from "./PlanningDayList";
import { CalendarViewSwitch } from "./CalendarViewSwitch";
import type { Member } from "./MemberMultiSelect";
import type { PlanningMeetingWithTopics, PlanningTopic } from "@/types";

interface Props {
  meetings: PlanningMeetingWithTopics[];
  weekDays: string[];   // 7 × yyyy-MM-dd (Pzt→Paz)
  weekStart: string;    // Pazartesi yyyy-MM-dd
  members: Member[];
  memberNames: Record<string, string>;
  /** Kişi rengi (profiles.id → hex) — baş harf rozetleri kendi renginde. */
  personHex?: Record<string, string>;
  isAdmin: boolean;
}

/** Hiç konusu olmayan şeritte bile çizilen taban "Konu" satırı sayısı. */
const MIN_TOPIC_ROWS = 3;

/**
 * Calendar — SADECE takvim.
 *
 * Sayfa bir zamanlar dört bloktu: takvim + "Tarih/Saat × departman" matrisi +
 * "Kişi sütunları" (açık işler) + "Adımlar / Operasyon Kurgusu". Aslı Hanım
 * (2026-08-24) alttaki üçünü kaldırttı:
 *   "Bunun altında yazılar iş bölümü — mesela bak Gül'ün işlerini oraya
 *    alacaksın, boarduna alacaksın. Buradan çıkacak bunlar."
 * Yani kişinin işi tek yerde yaşar: Pano. Takvim yalnız "ne zaman"ı söyler.
 *
 * NOT: planning_week_matrix / planning_open_items / planning_process_steps
 * satırları veritabanında DURUYOR — yalnız bu sayfadan çizilmiyor. Görev
 * olarak Pano'ya taşınmaları ayrı bir iş.
 */
export function PlanningBoard({
  meetings, weekDays, weekStart, members, memberNames, personHex = {}, isAdmin,
}: Props) {
  const router = useRouter();
  const [editor, setEditor] = useState<
    { meeting: PlanningMeetingWithTopics | null; day: string; slot: string; dayLabel: string } | null
  >(null);

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

  // Şeritlerin dışında kalan saatler (elle eklenmiş 13:00 gibi) kaybolmasın.
  const extraSlots = useMemo(() => {
    const known = new Set(PLANNING_BANDS.map((b) => b.slot));
    return [...new Set(meetings.map((m) => m.time_slot))].filter((s) => !known.has(s)).sort();
  }, [meetings]);

  // Konular "Konu N" satırlarına position'a göre oturur; 5'i aşanlar (elle
  // eklenmiş) alta ek satır olarak düşer. Çizilecek satır sayısı DOLU satıra
  // göre belirlenir — hiçbir günde kullanılmayan Konu 4/5 ekranda yer yemesin.
  const { topicRows, rowCountOfSlot } = useMemo(() => {
    const topicRows = new Map<string, (PlanningTopic | null)[]>();
    const rowCountOfSlot = new Map<string, number>();
    const slots = [...new Set(meetings.map((m) => m.time_slot).concat(PLANNING_BANDS.map((b) => b.slot)))];
    for (const slot of slots) {
      let used = 0;
      for (const iso of weekDays) {
        const key = `${iso}|${slot}`;
        const all = (byCell.get(key) ?? []).flatMap((m) => m.topics).sort((a, b) => a.position - b.position);
        const rows: (PlanningTopic | null)[] = Array.from({ length: TOPIC_ROWS }, () => null);
        for (const t of all) {
          if (t.position >= 0 && t.position < TOPIC_ROWS && rows[t.position] === null) rows[t.position] = t;
          else rows.push(t);
        }
        topicRows.set(key, rows);
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i]) { used = Math.max(used, i + 1); break; }
        }
      }
      rowCountOfSlot.set(slot, Math.max(MIN_TOPIC_ROWS, used));
    }
    return { topicRows, rowCountOfSlot };
  }, [byCell, meetings, weekDays]);

  const gotoWeek = (isoMonday: string) => router.push(`/planning?week=${isoMonday}`);
  const todayIso = format(new Date(), "yyyy-MM-dd");

  const openEditor = (iso: string, slot: string, i: number) => {
    if (!isAdmin) return;
    const cell = byCell.get(`${iso}|${slot}`) ?? [];
    setEditor({
      meeting: cell[0] ?? null,
      day: iso,
      slot,
      dayLabel: `${WEEKDAY_LONG_TR[i]} ${format(parseISO(iso), "d MMM", { locale: tr })}`,
    });
  };

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <ModulePageHeader
        title="Calendar"
        description={
          isAdmin
            ? "Haftalık toplantı ızgarası — gün, saat, konu ve sorumlular."
            : "Haftalık toplantı ızgarası — takvimi yöneticiler düzenler; size atanan işler Board’da görünür."
        }
        icon={CalendarRange}
        secondaryBackHref="/board"
        rightSlot={
          <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            {/* SIRA: hafta gezinme solda, ölçek seçici EN SAĞDA — Aslı Hanım
                (2026-08-24): "Hafta / Ay / Yıl yazısı en köşede olsun."
                "Şablonlar" KALDIRILDI ("olmasına gerek yok, zaten elden
                giriyoruz biz"): haftanın iskeleti artık kodda sabit
                (lib/planning/bands.ts) ve boş hafta açılırken kendiliğinden
                kuruluyor, ayrı bir şablon ekranına gerek kalmadı. */}
            <span className="mx-0.5 hidden h-6 w-px bg-line sm:block" />
            <div className="inline-flex h-9 shrink-0 items-stretch overflow-hidden rounded-lg border border-line bg-surface">
              <button
                onClick={() => gotoWeek(format(subDays(parseISO(weekStart), 7), "yyyy-MM-dd"))}
                className="inline-flex w-9 items-center justify-center text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
                title="Önceki hafta" aria-label="Önceki hafta"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => gotoWeek(format(new Date(), "yyyy-MM-dd"))}
                className="whitespace-nowrap border-x border-line px-2.5 text-[13px] font-medium text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink sm:px-3"
              >
                Bu hafta
              </button>
              <button
                onClick={() => gotoWeek(format(addDays(parseISO(weekStart), 7), "yyyy-MM-dd"))}
                className="inline-flex w-9 items-center justify-center text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
                title="Sonraki hafta" aria-label="Sonraki hafta"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <CalendarViewSwitch scale="hafta" />
          </div>
        }
      />

      {/* Sayfada tek blok var: takvim. Numaralı başlık ("1 — Haftalık Toplantı
          Izgarası") de kalktı; numaralandırma ancak birden fazla blok varken
          anlamlıydı. */}
      <PlanningWeekGrid
        weekDays={weekDays}
        byCell={byCell}
        topicRows={topicRows}
        rowCountOfSlot={rowCountOfSlot}
        extraSlots={extraSlots}
        memberNames={memberNames}
        personHex={personHex}
        isAdmin={isAdmin}
        todayIso={todayIso}
        onOpen={openEditor}
      />
      <PlanningDayList
        weekDays={weekDays}
        byCell={byCell}
        topicRows={topicRows}
        extraSlots={extraSlots}
        memberNames={memberNames}
        personHex={personHex}
        isAdmin={isAdmin}
        todayIso={todayIso}
        onOpen={openEditor}
      />

      <p className="mt-2 hidden px-1 text-[12.5px] text-subtle lg:block">
        {isAdmin
          ? "Bir hücreye tıklayınca o gün-saatin toplantısı ve konuları açılır. Baş harf rozetleri Excel'deki “Kim” sütunudur."
          : "Takvim salt görüntüleme — konular ve sorumlular hücrelerin içinde listelenir."}
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
