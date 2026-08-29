"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { tr } from "date-fns/locale";
import { CheckCircle2, Clock, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { IconButton } from "@/components/ui/Button";
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
      {/* Gün seçici — HAFTANIN TAMAMI tek bakışta, yedi sütun.
          Önce yatay kayan bir şeritti (7 × 64px = 484px, 390px'lik telefonu
          aşıyordu): hafta sonu ekranın dışında kalıyor, üstelik SEÇİLİ gün
          kenarda yarım görünüyordu — kullanıcı hangi günde olduğunu görmek
          için kaydırmak zorundaydı. Izgara hem kaydırmayı bitiriyor hem de
          "bu hafta" sorusuna bakışta cevap veriyor. Hücre dar ekranda ~46px,
          dokunma hedefi yüksekliğiyle (52px) rahat kalır. */}
      <div
        role="tablist"
        aria-label="Haftanın günleri"
        className="mb-3 grid grid-cols-7 gap-1"
      >
        {weekDays.map((d, i) => {
          const active = i === dayIdx;
          const isToday = d === todayIso;
          const hasItems = slots.some((s) => (byCell.get(`${d}|${s}`) ?? []).some((m) => m.title || m.content)
            || (topicRows.get(`${d}|${s}`) ?? []).some(Boolean));
          return (
            <button
              key={d}
              role="tab"
              aria-selected={active}
              aria-current={isToday ? "date" : undefined}
              onClick={() => setDayIdx(i)}
              className={cn(
                "flex min-h-[52px] min-w-0 flex-col items-center justify-center rounded-card border px-0.5 py-1.5 transition-colors duration-150 active:scale-[0.97]",
                active
                  ? "border-brand bg-brand text-white"
                  : isToday
                    ? "border-brand-ring bg-brand-soft/60 text-brand-strong hover:border-brand"
                    : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
              )}
            >
              <span className="text-[12px] font-semibold uppercase tracking-[0.06em]">
                {WEEKDAY_SHORT_TR[i]}
              </span>
              <span className="text-[13.5px] font-semibold tabular-nums">
                {format(parseISO(d), "d")}
              </span>
              {/* Dolu gün noktası — sayı değil, "burada bir şey var" işareti. */}
              <span
                className={cn("mt-0.5 h-1 w-1 rounded-full", hasItems ? (active ? "bg-white/70" : "bg-brand/60") : "bg-transparent")}
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
          const ist = istanbulLabel(iso, slot);

          // Boş şeridi üyeye gösterme — yönetici ekleyebilsin diye ona kalır.
          if (!title && !content && topics.length === 0 && !isAdmin) return null;

          if (isAdmin && band && editingBand === slot) {
            return (
              <div key={slot} className="overflow-hidden rounded-card border border-brand-ring bg-surface">
                <BandEditor band={band} refDay={weekRefDay} onClose={() => setEditingBand(null)} />
              </div>
            );
          }

          /* Başlık gövdesi — yöneticide düğme (toplantıyı açar), üyede düz
             kutu. Salt-okur tarafta devre dışı bir düğme çizmek "tıklanabilir
             ama çalışmıyor" hissi veriyordu. */
          const head = (
            <>
              {/* Saat çifti — kayıtlı New York saati ve İstanbul karşılığı
                  (Aslı Hanım, 2026-08-28). */}
              <span className="mt-px shrink-0 rounded-md bg-ink/[0.07] px-1.5 py-0.5 text-center leading-tight">
                <span className="block text-[12px] font-semibold tabular-nums text-ink/75">{slot}</span>
                {ist && (
                  <span className="block text-[12px] font-medium tabular-nums text-ink/50">
                    {AWAY_LABEL} {ist}
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-[12px] font-semibold uppercase tracking-[0.08em] opacity-70", meta.title)}>
                  {band?.label ?? meta.label}
                </span>
                <span className={cn("block text-[13.5px] font-semibold leading-snug tracking-tight", meta.title)}>
                  {title || "—"}
                </span>
                <KimBadges ids={ids} kim={kim} collaboratorIds={collabIds} memberNames={memberNames} className="ml-0 mt-1" personHex={personHex} />
                {content && (
                  <span className="mt-1 block whitespace-pre-line text-[12.5px] leading-snug text-ink/70">
                    {content}
                  </span>
                )}
              </span>
            </>
          );
          const headCls = cn("flex w-full items-start gap-2 px-3 py-2 text-left", meta.cell, isAdmin && band && "pr-12");

          return (
            <section
              key={slot}
              className="relative overflow-hidden rounded-card border border-line bg-surface"
            >
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => onOpen(iso, slot, dayIdx)}
                  className={cn(headCls, "transition-colors duration-150 active:bg-ink/[0.04]")}
                >
                  {head}
                </button>
              ) : (
                <div className={headCls}>{head}</div>
              )}

              {/* Şeridi düzenle — toplantı açan gövdeden AYRI bir düğme.
                  İç içe <button> geçersiz HTML'dir, bu yüzden kardeş olarak
                  ve mutlak konumda durur. Yalnız yöneticide çizilir. */}
              {isAdmin && band && (
                <IconButton
                  size="sm"
                  aria-label={`${band.label || meta.label} şeridini düzenle`}
                  title="Şeridi düzenle — ad, saat, renk"
                  onClick={() => setEditingBand(slot)}
                  className="absolute right-1.5 top-1.5 text-ink/50 hover:bg-surface/70"
                >
                  <Pencil size={14} />
                </IconButton>
              )}

              {topics.length > 0 ? (
                <ol className="divide-y divide-hairline">
                  {topics.map((t, i) => (
                    <li key={t.id} className="flex items-start gap-2 px-3 py-2">
                      <span className="mt-px shrink-0 text-[12px] font-semibold tabular-nums text-subtle">
                        {i + 1}.
                      </span>
                      <span className="min-w-0 flex-1 text-[13.5px] leading-snug text-ink/90">
                        {t.text}
                        {t.task_id && (
                          <CheckCircle2 size={12} className="ml-1 inline shrink-0 text-success" aria-label="Göreve atandı" />
                        )}
                        <KimBadges ids={t.participant_ids} kim={t.kim} collaboratorIds={t.collaborator_ids} memberNames={memberNames} personHex={personHex} />
                        {/* Yalnız o günden FARKLI teslim tarihi yazılır. */}
                        {t.due_date && t.due_date.slice(0, 10) !== iso && (
                          <span className="ml-1 whitespace-nowrap text-[12px] tabular-nums text-subtle">
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
                    type="button"
                    onClick={() => onOpen(iso, slot, dayIdx)}
                    className="flex min-h-[40px] w-full items-center justify-center gap-1 border-t border-hairline py-2 text-[12.5px] font-medium text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-brand"
                  >
                    <Plus size={13} aria-hidden /> Konu ekle
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
            <div className="overflow-hidden rounded-card border border-brand-ring bg-surface">
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
              className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-card border border-dashed border-line bg-surface/60 py-2.5 text-[13px] font-medium text-subtle transition-colors duration-150 hover:border-brand-ring hover:bg-brand-soft/30 hover:text-brand"
            >
              <Clock size={14} aria-hidden /> Saat ekle
            </button>
          )
        )}
      </div>
    </div>
  );
}
