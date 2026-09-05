"use client";

import { format, parseISO, addDays, subDays } from "date-fns";
import { tr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Overlay } from "@/components/ui/Overlay";
import { PlanningDayList } from "./PlanningDayList";
import { WEEKDAY_LONG_TR, type RuntimeBand } from "@/lib/planning/bands";
import type { PlanningMeetingWithTopics, PlanningTopic } from "@/types";

interface Props {
  /** Açık gün — yyyy-MM-dd. */
  day: string;
  /** Haftanın hücre haritası (`gün|saat`) — kart kendi verisini ÇEKMEZ. */
  byCell: Map<string, PlanningMeetingWithTopics[]>;
  topicRows: Map<string, (PlanningTopic | null)[]>;
  extraSlots: string[];
  memberNames: Record<string, string>;
  /** profiles.id → fotoğraf; kişi rozetleri yuvarlak kart. */
  memberPhotos?: Record<string, string | null>;
  personHex?: Record<string, string>;
  isAdmin: boolean;
  bands: RuntimeBand[];
  todayIso: string;
  /** Başka bir güne geç — hafta dışına çıkarsa çağıran rotayı günceller. */
  onDayChange: (_iso: string) => void;
  /** Bir saate tıklandı → toplantı penceresi. */
  onOpenSlot: (_iso: string, _slot: string) => void;
  onClose: () => void;
}

/**
 * GÜN KARTI — haftanın ÜSTÜNDE açılan pencere.
 *
 * Sıraç (2026-08-30): "Gün pop-up'ı hafta kısmında kart olarak açılsın, başka
 * sayfa değil."
 *
 * Gün ölçeği önce ayrı bir SAYFAYDI: "Gün"e basınca hafta ekrandan kayboluyor,
 * geri dönmek için ikinci bir tıklama gerekiyordu. Oysa gün, haftanın yerine
 * geçen bir yer değil, içinden bakılan bir ayrıntı — kart kapanınca kullanıcı
 * bıraktığı haftada kalır.
 *
 * Kart kendi sorgusunu ATMAZ: haftanın zaten yüklü hücre haritasından beslenir.
 * Gün değişince (◀ ▶) çağıran rotayı günceller; hafta dışına çıkıldığında
 * sunucu doğru haftayı yükler ve kart o günde açık kalır.
 *
 * İçerik dar ekrandaki gün listesinin `singleDay` kipidir: aynı şeritler, aynı
 * saat çifti (New York · İstanbul), bir kademe iri ölçü.
 */
export function PlanningDayView({
  day, byCell, topicRows, extraSlots, memberNames, memberPhotos = {}, personHex = {}, isAdmin, bands,
  todayIso, onDayChange, onOpenSlot, onClose,
}: Props) {
  const d = parseISO(day);
  const weekday = WEEKDAY_LONG_TR[(d.getDay() + 6) % 7];

  /** "Toplantı ekle" hangi saatle açılsın: günün İLK BOŞ şeridi. */
  const firstFreeSlot = (): string => {
    const free = bands.find((b) => (byCell.get(`${day}|${b.slot}`) ?? []).length === 0);
    return free?.slot ?? bands[0]?.slot ?? "09:00";
  };

  return (
    <Overlay
      open
      onClose={onClose}
      size="lg"
      titleNode={
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-[16px] font-semibold tracking-tight text-ink">
            {weekday} · {format(d, "d MMMM yyyy", { locale: tr })}
          </span>
          {/* Gün gezinmesi BAŞLIKTA: kart kapanmadan komşu güne geçilir. */}
          <span className="inline-flex h-8 items-stretch overflow-hidden rounded-control border border-line">
            <button
              type="button"
              onClick={() => onDayChange(format(subDays(d, 1), "yyyy-MM-dd"))}
              className="tap-target inline-flex w-8 items-center justify-center text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
              title="Önceki gün" aria-label="Önceki gün"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              onClick={() => onDayChange(todayIso)}
              className="whitespace-nowrap border-x border-line px-2.5 text-[12.5px] font-medium text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
            >
              Bugün
            </button>
            <button
              type="button"
              onClick={() => onDayChange(format(addDays(d, 1), "yyyy-MM-dd"))}
              className="tap-target inline-flex w-8 items-center justify-center text-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
              title="Sonraki gün" aria-label="Sonraki gün"
            >
              <ChevronRight size={15} />
            </button>
          </span>
        </div>
      }
      footer={
        isAdmin ? (
          <Button size="sm" onClick={() => onOpenSlot(day, firstFreeSlot())}>
            <Plus size={14} aria-hidden /> Toplantı ekle
          </Button>
        ) : undefined
      }
    >
      <PlanningDayList
        singleDay
        weekDays={[day]}
        byCell={byCell}
        topicRows={topicRows}
        extraSlots={extraSlots}
        memberNames={memberNames} memberPhotos={memberPhotos}
        personHex={personHex}
        isAdmin={isAdmin}
        todayIso={todayIso}
        onOpen={(iso, slot) => onOpenSlot(iso, slot)}
        bands={bands}
      />
    </Overlay>
  );
}
