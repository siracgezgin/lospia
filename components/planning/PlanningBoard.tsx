"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO, addDays, subDays } from "date-fns";
import { tr } from "date-fns/locale";
import {
  CalendarRange, ChevronLeft, ChevronRight, CalendarPlus, CopyPlus, Settings2, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { PLANNING_BANDS, TOPIC_ROWS, WEEKDAY_LONG_TR } from "@/lib/planning/bands";
import { applyTemplatesToWeek, copyPreviousWeek } from "@/lib/actions/planning";
import { MeetingEditor } from "./MeetingEditor";
import { TemplateManager } from "./TemplateManager";
import { OpenItemsBoard } from "./OpenItemsBoard";
import { WeekMatrix } from "./WeekMatrix";
import { ProcessSteps } from "./ProcessSteps";
import { PlanningWeekGrid } from "./PlanningWeekGrid";
import { PlanningDayList } from "./PlanningDayList";
import type { Member } from "./MemberMultiSelect";
import type {
  PlanningMeetingWithTopics, PlanningTemplate, PlanningOpenItem,
  PlanningWeekMatrixRow, PlanningProcessStep, PlanningTopic,
} from "@/types";

interface Props {
  meetings: PlanningMeetingWithTopics[];
  weekDays: string[];   // 7 × yyyy-MM-dd (Pzt→Paz)
  weekStart: string;    // Pazartesi yyyy-MM-dd
  members: Member[];
  memberNames: Record<string, string>;
  templates: PlanningTemplate[];
  isAdmin: boolean;
  currentUserId: string;
  openItems: PlanningOpenItem[];
  openItemsAvailable: boolean;
  matrix: PlanningWeekMatrixRow[];
  matrixAvailable: boolean;
  processSteps: PlanningProcessStep[];
  processStepsAvailable: boolean;
}

/** Hiç konusu olmayan şeritte bile çizilen taban "Konu" satırı sayısı. */
const MIN_TOPIC_ROWS = 3;

export function PlanningBoard({
  meetings, weekDays, weekStart, members, memberNames, templates, isAdmin,
  currentUserId, openItems, openItemsAvailable, matrix, matrixAvailable,
  processSteps, processStepsAvailable,
}: Props) {
  const router = useRouter();
  const [editor, setEditor] = useState<
    { meeting: PlanningMeetingWithTopics | null; day: string; slot: string; dayLabel: string } | null
  >(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [isWorking, startWork] = useTransition();

  function run(
    fn: () => Promise<{ ok: true; created: number } | { error: string }>,
    okText: (_n: number) => string,
  ) {
    setNotice(null);
    startWork(async () => {
      const res = await fn();
      if ("error" in res) { setNotice({ kind: "error", text: res.error }); return; }
      setNotice({ kind: "ok", text: okText(res.created) });
      router.refresh();
    });
  }

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

  const btn =
    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[13px] font-medium text-muted transition-all duration-150 hover:border-line-strong hover:bg-surface-muted hover:text-ink active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 sm:px-3";

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <ModulePageHeader
        title="Planlama"
        description={
          isAdmin
            ? "Haftalık Toplantı Takvimi — departman şeritleri, saatler, gün başlıkları ve konular."
            : "Haftalık Toplantı Takvimi — planlamayı yöneticiler düzenler; size atanan işler Pano'da görünür."
        }
        icon={CalendarRange}
        secondaryBackHref="/board"
        rightSlot={
          <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            {isAdmin && (
              <>
                <button
                  onClick={() => run(
                    () => applyTemplatesToWeek(weekStart),
                    (n) => n > 0 ? `${n} toplantı şablondan kuruldu.` : "Hafta zaten kurulu — yeni eklenen olmadı.",
                  )}
                  disabled={isWorking}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-brand px-2.5 text-[13px] font-medium text-white transition-all duration-150 hover:bg-brand-strong active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 sm:px-3"
                  title="Aktif şablonlardan bu haftanın toplantılarını kur"
                >
                  {isWorking ? <Loader2 size={14} className="animate-spin" /> : <CalendarPlus size={14} />}
                  <span className="hidden sm:inline">Haftayı kur</span>
                </button>
                <button
                  onClick={() => run(
                    () => copyPreviousWeek(weekStart),
                    (n) => n > 0 ? `${n} toplantı geçen haftadan kopyalandı.` : "Kopyalanacak yeni toplantı yok — hafta zaten dolu.",
                  )}
                  disabled={isWorking}
                  className={btn}
                  title="Geçen haftanın toplantılarını (konular hariç) bu haftaya kopyala"
                >
                  <CopyPlus size={14} /> <span className="hidden md:inline">Geçen haftadan</span>
                </button>
                <button onClick={() => setShowTemplates(true)} className={btn} title="Haftanın tekrar eden ritmini tanımla">
                  <Settings2 size={14} /> <span className="hidden md:inline">Şablonlar</span>
                </button>
              </>
            )}
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
          </div>
        }
      />

      {notice && (
        <div
          className={cn(
            "anim-fade-down mb-3 rounded-lg border px-3 py-2 text-[13px] font-medium shadow-card",
            notice.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700",
          )}
        >
          {notice.text}
        </div>
      )}

      {/* Blok 1 — takvim. Geniş ekranda Excel ızgarası, dar ekranda gün gün liste. */}
      <PlanningWeekGrid
        weekDays={weekDays}
        byCell={byCell}
        topicRows={topicRows}
        rowCountOfSlot={rowCountOfSlot}
        extraSlots={extraSlots}
        memberNames={memberNames}
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
        isAdmin={isAdmin}
        todayIso={todayIso}
        onOpen={openEditor}
      />

      <p className="mt-2 hidden px-1 text-[12.5px] text-subtle lg:block">
        {isAdmin
          ? "Bir hücreye tıklayınca o gün-saatin toplantısı ve konuları açılır. Baş harf rozetleri Excel'deki “Kim” sütunudur."
          : "Takvim salt görüntüleme — konular ve sorumlular hücrelerin içinde listelenir."}
      </p>

      {/* Blok 2 — Tarih/Saat × departman matrisi */}
      <WeekMatrix rows={matrix} memberNames={memberNames} available={matrixAvailable} />

      {/* Blok 3 — Kişi sütunları */}
      <OpenItemsBoard
        items={openItems}
        members={members}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        available={openItemsAvailable}
      />

      {/* Blok 4 — Adımlar / Operasyon Kurgusu */}
      <ProcessSteps steps={processSteps} memberNames={memberNames} available={processStepsAvailable} />

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

      {showTemplates && (
        <TemplateManager
          templates={templates}
          members={members}
          memberNames={memberNames}
          onClose={() => setShowTemplates(false)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}
