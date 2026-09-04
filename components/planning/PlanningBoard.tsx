"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO, addDays, subDays } from "date-fns";
import { tr } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TOPIC_ROWS, WEEKDAY_LONG_TR, type RuntimeBand } from "@/lib/planning/bands";
import { MeetingEditor } from "./MeetingEditor";
import { PlanningWeekGrid } from "./PlanningWeekGrid";
import { PlanningDayList } from "./PlanningDayList";
import { MeetingUndoBar, type DeletedMeeting } from "./MeetingUndoBar";
import { CalendarViewSwitch } from "./CalendarViewSwitch";
import { CalendarToolbar } from "./CalendarToolbar";
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
  /** Sol sütun — veritabanından; boşsa kod varsayılanları (20240326). */
  bands: RuntimeBand[];
}

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
/** Her başlığın altında varsayılan olarak çizilen "Konu" satırı sayısı. */
const DEFAULT_TOPIC_ROWS = 3;

export function PlanningBoard({
  meetings, weekDays, weekStart, members, memberNames, personHex = {}, isAdmin, bands,
}: Props) {
  const router = useRouter();
  const [editor, setEditor] = useState<
    {
      meeting: PlanningMeetingWithTopics | null; day: string; slot: string; dayLabel: string;
      bandCategory?: RuntimeBand["category"]; bandLabel?: string;
    } | null
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
    const known = new Set(bands.map((b) => b.slot));
    return [...new Set(meetings.map((m) => m.time_slot))].filter((s) => !known.has(s)).sort();
  }, [meetings, bands]);

  // Konular "Konu N" satırlarına position'a göre oturur; 5'i aşanlar (elle
  // eklenmiş) alta ek satır olarak düşer. Çizilecek satır sayısı DOLU satıra
  // göre belirlenir — hiçbir günde kullanılmayan Konu 4/5 ekranda yer yemesin.
  const { topicRows, rowCountOfSlot } = useMemo(() => {
    const topicRows = new Map<string, (PlanningTopic | null)[]>();
    const rowCountOfSlot = new Map<string, number>();
    const slots = [...new Set(meetings.map((m) => m.time_slot).concat(bands.map((b) => b.slot)))];
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
      /* HER BAŞLIKTA VARSAYILAN 3 KONU (Aslı Hanım, 2026-08-29: "default
         olarak her başlığa 3 konu olsun"). Dolu satır üçü aşarsa ızgara
         büyür — girilen konu asla gizlenmez. */
      rowCountOfSlot.set(slot, Math.max(used, DEFAULT_TOPIC_ROWS));
    }
    return { topicRows, rowCountOfSlot };
  }, [byCell, meetings, weekDays, bands]);

  /* Silinen toplantı — "Geri al" şeridi ve Ctrl+Z bunun üzerinden çalışır. */
  const [deleted, setDeleted] = useState<DeletedMeeting | null>(null);

  const gotoWeek = (isoMonday: string) => router.push(`/planning?week=${isoMonday}`);
  const todayIso = format(new Date(), "yyyy-MM-dd");

  const openEditor = (iso: string, slot: string, i: number) => {
    if (!isAdmin) return;
    const cell = byCell.get(`${iso}|${slot}`) ?? [];
    // Toplantı, oturduğu ŞERİDİN kimliğini alır — renk seçtirilmiyor.
    const band = bands.find((b) => b.slot === slot);
    setEditor({
      meeting: cell[0] ?? null,
      day: iso,
      slot,
      dayLabel: `${WEEKDAY_LONG_TR[i]} ${format(parseISO(iso), "d MMM", { locale: tr })}`,
      bandCategory: band?.category,
      bandLabel: band?.label,
    });
  };

  return (
    /* TAM EKRAN. Aslı Hanım (2026-08-29): "Buradaki boşluğu kaldır ve calendar
       tam ekran olsun." Sayfada ModulePageHeader vardı: "← Geri" satırı, büyük
       "Calendar" başlığı ve bir açıklama cümlesi — üstte ~110px yiyordu ve
       başlığı zaten uygulama çubuğu yazıyordu. Yerine tek satırlık ince bir
       araç çubuğu geldi; ızgara kalan yüksekliğin TAMAMINI alıyor. */
    <div className="flex h-full min-h-0 w-full flex-col">
      <CalendarToolbar viewSwitch={<CalendarViewSwitch scale="hafta" />}>
        <div className="inline-flex h-9 shrink-0 items-stretch overflow-hidden rounded-control border border-line bg-surface">
          <button
            type="button"
            onClick={() => gotoWeek(format(subDays(parseISO(weekStart), 7), "yyyy-MM-dd"))}
            className="tap-target inline-flex w-9 items-center justify-center text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
            title="Önceki hafta" aria-label="Önceki hafta"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => gotoWeek(format(new Date(), "yyyy-MM-dd"))}
            className="whitespace-nowrap border-x border-line px-3 text-[13px] font-medium text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
          >
            Bu hafta
          </button>
          <button
            type="button"
            onClick={() => gotoWeek(format(addDays(parseISO(weekStart), 7), "yyyy-MM-dd"))}
            className="tap-target inline-flex w-9 items-center justify-center text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
            title="Sonraki hafta" aria-label="Sonraki hafta"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </CalendarToolbar>

      <div className="min-h-0 flex-1 overflow-auto p-2 sm:p-3 lg:overflow-hidden lg:p-3">
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
        bands={bands}
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
