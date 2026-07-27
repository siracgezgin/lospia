"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO, addDays, subDays } from "date-fns";
import { tr } from "date-fns/locale";
import {
  CalendarRange, ChevronLeft, ChevronRight, Plus, Pencil, CheckCircle2,
  CalendarPlus, CopyPlus, Settings2, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ModulePageHeader } from "@/components/modules/ModulePageHeader";
import { PLANNING_CATEGORIES, categoryMeta } from "@/lib/planning/categories";
import { applyTemplatesToWeek, copyPreviousWeek } from "@/lib/actions/planning";
import { MeetingEditor } from "./MeetingEditor";
import { TemplateManager } from "./TemplateManager";
import { MemberInitials, type Member } from "./MemberMultiSelect";
import type { PlanningMeetingWithTopics, PlanningTemplate } from "@/types";

interface Props {
  meetings: PlanningMeetingWithTopics[];
  weekDays: string[];   // 7 × yyyy-MM-dd (Pzt→Paz)
  weekStart: string;    // Pazartesi yyyy-MM-dd
  members: Member[];
  memberNames: Record<string, string>;
  templates: PlanningTemplate[];
  isAdmin: boolean;
}

const DAY_LABELS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const DEFAULT_SLOTS = ["09:00", "10:00", "11:00", "12:00"];
const TOPIC_LIMIT = 5; // Aslı Hanım'ın sınırı: bir toplantıda en çok 5 konu

export function PlanningBoard({
  meetings, weekDays, weekStart, members, memberNames, templates, isAdmin,
}: Props) {
  const router = useRouter();
  const [editor, setEditor] = useState<
    { meeting: PlanningMeetingWithTopics | null; day: string; slot: string; dayLabel: string } | null
  >(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [isWorking, startWork] = useTransition();

  function handleApplyTemplates() {
    setNotice(null);
    startWork(async () => {
      const res = await applyTemplatesToWeek(weekStart);
      if ("error" in res) { setNotice({ kind: "error", text: res.error }); return; }
      setNotice({
        kind: "ok",
        text: res.created > 0
          ? `${res.created} toplantı şablondan kuruldu.`
          : "Hafta zaten kurulu — yeni eklenen olmadı.",
      });
      router.refresh();
    });
  }

  function handleCopyPrevious() {
    setNotice(null);
    startWork(async () => {
      const res = await copyPreviousWeek(weekStart);
      if ("error" in res) { setNotice({ kind: "error", text: res.error }); return; }
      setNotice({
        kind: "ok",
        text: res.created > 0
          ? `${res.created} toplantı geçen haftadan kopyalandı.`
          : "Kopyalanacak yeni toplantı yok — hafta zaten dolu.",
      });
      router.refresh();
    });
  }

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
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <ModulePageHeader
        title="Planlama"
        description={
          isAdmin
            ? "Haftalık toplantı takvimi — her gün ve saat için toplantılar, altında konular. Renkler kategoriyi gösterir."
            : "Haftalık toplantı takvimi — planlamayı yöneticiler düzenler; size atanan işler Pano'da görünür."
        }
        icon={CalendarRange}
        secondaryBackHref="/board"
        rightSlot={
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {isAdmin && (
              <>
                <button
                  onClick={handleApplyTemplates}
                  disabled={isWorking}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13px] font-medium text-white transition-all duration-150 hover:bg-brand-strong active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
                  title="Aktif şablonlardan bu haftanın toplantılarını kur"
                >
                  {isWorking ? <Loader2 size={14} className="animate-spin" /> : <CalendarPlus size={14} />}
                  Haftayı kur
                </button>
                <button
                  onClick={handleCopyPrevious}
                  disabled={isWorking}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-muted transition-all duration-150 hover:border-line-strong hover:bg-surface-muted hover:text-ink active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
                  title="Geçen haftanın toplantılarını (konular hariç) bu haftaya kopyala"
                >
                  <CopyPlus size={14} /> Geçen haftadan
                </button>
              </>
            )}
            {isAdmin && (
              <button
                onClick={() => setShowTemplates(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-muted transition-all duration-150 hover:border-line-strong hover:bg-surface-muted hover:text-ink active:scale-[0.98]"
                title="Haftanın tekrar eden ritmini tanımla"
              >
                <Settings2 size={14} /> Şablonlar
              </button>
            )}
            <span className="mx-0.5 hidden h-6 w-px bg-line sm:block" />
            <div className="inline-flex h-9 items-stretch overflow-hidden rounded-lg border border-line bg-surface">
              <button onClick={() => gotoWeek(format(subDays(parseISO(weekStart), 7), "yyyy-MM-dd"))} className="inline-flex w-9 items-center justify-center text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink" title="Önceki hafta">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => gotoWeek(format(new Date(), "yyyy-MM-dd"))} className="border-x border-line px-3 text-[13px] font-medium text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink">
                Bu hafta
              </button>
              <button onClick={() => gotoWeek(format(addDays(parseISO(weekStart), 7), "yyyy-MM-dd"))} className="inline-flex w-9 items-center justify-center text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink" title="Sonraki hafta">
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

      {/* Kategori açıklaması (legend) */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {PLANNING_CATEGORIES.filter((c) => c.key !== "other").map((c) => (
          <span key={c.key} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted">
            <span className={cn("h-2.5 w-2.5 rounded-sm ring-1 ring-inset ring-black/10", c.dot)} /> {c.label}
          </span>
        ))}
      </div>

      {/* Izgara — geniş ekranda tüm genişliği kullanır; <lg yatay, uzun haftalarda
          dikey kaydırma kendi kutusunda kalır (gün başlığı + saat kolonu sabit). */}
      <div className="max-h-[max(30rem,calc(100dvh_-_16rem))] overflow-auto overscroll-x-contain rounded-2xl border border-line-strong bg-surface shadow-card">
        <div className="min-w-[1160px]">
          {/* Başlık satırı — dikey kaydırmada üstte sabit */}
          <div className="sticky top-0 z-20 grid border-b border-line-strong bg-surface-muted" style={{ gridTemplateColumns: "84px repeat(7, minmax(0, 1fr))" }}>
            <div className="sticky left-0 z-10 flex items-end border-r border-hairline bg-surface-muted px-2.5 py-2.5 text-[12px] font-semibold uppercase tracking-wider text-subtle">Saat</div>
            {weekDays.map((iso, i) => (
              <div key={iso} className={cn("relative border-r border-hairline px-2 py-2.5 text-center last:border-r-0", iso === todayIso && "bg-brand-soft")}>
                {iso === todayIso && <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-brand" />}
                <div className={cn("text-[13px] font-semibold tracking-tight", iso === todayIso ? "text-brand-strong" : "text-ink")}>{DAY_LABELS[i]}</div>
                <div className={cn("text-[12px] tabular-nums", iso === todayIso ? "text-brand" : "text-subtle")}>{format(parseISO(iso), "d MMM", { locale: tr })}</div>
              </div>
            ))}
          </div>

          {/* Saat satırları */}
          {slots.map((slot) => (
            <div key={slot} className="grid border-b border-hairline last:border-b-0" style={{ gridTemplateColumns: "84px repeat(7, minmax(0, 1fr))" }}>
              <div className="sticky left-0 z-10 border-r border-hairline bg-surface px-2.5 py-2.5 text-[13px] font-semibold tabular-nums text-muted">{slot}</div>
              {weekDays.map((iso, i) => {
                const cell = byCell.get(`${iso}|${slot}`) ?? [];
                return (
                  <div key={iso} className={cn("group/cell min-h-[96px] border-r border-hairline p-2 last:border-r-0 xl:min-h-[104px]", iso === todayIso && "bg-brand-soft/40")}>
                    <div className="space-y-1.5">
                      {cell.length > 0 && (
                        <div className="stagger-children space-y-1.5">
                          {cell.map((m) => {
                            const meta = categoryMeta(m.category);
                            return (
                              <div
                                key={m.id}
                                onClick={isAdmin ? () => setEditor({ meeting: m, day: iso, slot, dayLabel: dayLabelOf(iso, i) }) : undefined}
                                className={cn(
                                  "group relative overflow-hidden rounded-lg border p-2.5 pl-3.5 text-left shadow-card transition-[transform,box-shadow] duration-200 ease-standard",
                                  isAdmin && "cursor-pointer hover:-translate-y-px hover:shadow-card-hover active:translate-y-0 active:shadow-card",
                                  meta.cell,
                                )}
                              >
                                {/* Kategori rayı — 3px, cn() dışında (tailwind-merge border-l/renk yutma hatasına karşı) */}
                                <span aria-hidden className={"absolute inset-y-0 left-0 w-[3px] " + meta.dot} />
                                <div className="flex items-start justify-between gap-1">
                                  <div className="min-w-0 flex-1">
                                    <div className={cn("text-[13px] font-bold leading-snug tracking-tight", meta.title)}>
                                      {meta.label}{m.title ? ` / ${m.title}` : ""}
                                    </div>
                                    {m.content && <p className="mt-0.5 whitespace-pre-line text-[12px] leading-snug text-ink/80">{m.content}</p>}
                                  </div>
                                  <span className="flex shrink-0 items-center gap-1">
                                    {/* Konu doluluk göstergesi — 5 sınırı görselleşir */}
                                    <span
                                      className={cn(
                                        "rounded-md px-1.5 py-px text-[10.5px] font-semibold tabular-nums",
                                        m.topics.length >= TOPIC_LIMIT ? "bg-ink/15 text-ink/70" : "bg-black/5 text-ink/50",
                                      )}
                                      title={`Konu: ${m.topics.length}/${TOPIC_LIMIT}`}
                                    >
                                      {m.topics.length}/{TOPIC_LIMIT}
                                    </span>
                                    {isAdmin && (
                                      <Pencil size={12} className="text-ink/40 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                                    )}
                                  </span>
                                </div>
                                {m.participant_ids?.length > 0 && (
                                  <div className="mt-1">
                                    <span className="inline-flex items-center gap-1 rounded-md bg-black/5 px-1.5 py-0.5">
                                      <MemberInitials ids={m.participant_ids} memberNames={memberNames} />
                                    </span>
                                  </div>
                                )}
                                {/* Konular — Excel gibi hep görünür, satır satır */}
                                {m.topics.length > 0 && (
                                  <ul className="mt-1.5 space-y-1 border-t border-black/10 pt-1.5">
                                    {m.topics.map((t, ti) => (
                                      <li key={t.id} className="flex items-start gap-1.5 text-[12px] leading-snug text-ink/85">
                                        <span className="mt-px shrink-0 font-semibold tabular-nums text-ink/50">{ti + 1}.</span>
                                        <span className="min-w-0 flex-1">
                                          {t.text}
                                          {t.task_id && <CheckCircle2 size={11} className="ml-1 inline text-emerald-600" aria-label="Göreve atandı" />}
                                        </span>
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
                        </div>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => setEditor({ meeting: null, day: iso, slot, dayLabel: dayLabelOf(iso, i) })}
                          className={cn(
                            "flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-line py-1.5 text-[12px] font-medium text-subtle transition-all duration-150 hover:border-brand-ring hover:bg-brand-soft/40 hover:text-brand active:scale-[0.99]",
                            cell.length === 0 ? "opacity-100" : "opacity-0 focus-visible:opacity-100 group-hover/cell:opacity-100",
                          )}
                          title="Toplantı ekle"
                        >
                          <Plus size={12} /> Ekle
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 px-1 text-[12.5px] text-subtle">
        {isAdmin
          ? "Bir kutuya tıklayınca konular açılır · kalem simgesiyle düzenle · boş hücrede “Ekle”."
          : "Takvim salt görüntüleme — konular ve kişiler kutuların içinde listelenir."}
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
