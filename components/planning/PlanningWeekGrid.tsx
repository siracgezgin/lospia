"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { tr } from "date-fns/locale";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { CheckCircle2, Plus, Pencil } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { categoryMeta } from "@/lib/planning/categories";
import { WEEKDAY_SHORT_EN, WEEKDAY_LONG_TR, type RuntimeBand } from "@/lib/planning/bands";
import { BandEditor } from "./BandEditor";
import { istanbulLabel, AWAY_LABEL, HOME_LABEL, normalizeSlot } from "@/lib/planning/timezones";
import { moveMeeting, moveTopic } from "@/lib/actions/planning";
import { KimBadges } from "./KimBadges";
import type { PlanningMeetingWithTopics, PlanningTopic } from "@/types";

interface Props {
  weekDays: string[];
  byCell: Map<string, PlanningMeetingWithTopics[]>;
  topicRows: Map<string, (PlanningTopic | null)[]>;
  rowCountOfSlot: Map<string, number>;
  extraSlots: string[];
  memberNames: Record<string, string>;
  /** Kişi rengi (profiles.id → hex) — baş harf rozetleri kendi renginde. */
  personHex?: Record<string, string>;
  isAdmin: boolean;
  todayIso: string;
  onOpen: (_iso: string, _slot: string, _dayIndex: number) => void;
  /** Sol sütun — düzenlenebilir şeritler (20240326). */
  bands: RuntimeBand[];
}

// ── Mount guard — dnd-kit sunucuda çizilmemeli (proje kuralı) ────────────────
const subscribeMounted = () => () => {};
const getMounted = () => true;
const getServerMounted = () => false;

/** "09:00" → 540. Sıralama için; çözülemeyen saat en sona. */
function slotMinutes(slot: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(normalizeSlot(slot));
  return m ? +m[1] * 60 + +m[2] : 24 * 60 + 1;
}

/** Tıklanabilir hücrenin hover hâli: kategori rengini ezmeyen ince mürekkep
 *  perdesi (`after:`); filtre/brightness kullanılmaz. */
const HOVER_VEIL =
  "cursor-pointer after:pointer-events-none after:absolute after:inset-0 after:bg-ink/[0.04] after:opacity-0 after:transition-opacity after:duration-150 hover:after:opacity-100";

/** Sürüklenemeyen ama tıklanabilen hücre klavyeden de açılsın: Enter/Boşluk.
 *  Sürüklenebilir hücrede rol ve tabIndex'i dnd-kit'in `attributes`ı verir. */
function keyboardOpen(enabled: boolean, onOpen: () => void) {
  if (!enabled) return {};
  return {
    role: "button" as const,
    tabIndex: 0,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); }
    },
  };
}

/**
 * Aslı Hanım'ın Excel düzeni — masaüstü (lg ve üzeri).
 *
 * Satır iskeleti Excel'in aynısı: GÜN/TARİH → şerit → saat satırı (gün
 * başlıkları) → Konu 1..N. Excel'deki ayrı "Kim" sütunu ekranda 336px yiyip
 * haftanın tamamının sığmasını engellediği için rozetler metnin akışına alındı
 * (bkz. KimBadges).
 *
 * Saat sütunu İKİ saat gösterir: kayıtlı New York saati ve ondan hesaplanan
 * İstanbul saati (bkz. lib/planning/timezones.ts).
 *
 * SAATLER KRONOLOJİK. Şerit dışı bir saat (bir toplantının saati elle
 * değiştirilince oluşur) eskiden ızgaranın DİBİNDE "EK SAAT" başlığı altında
 * toplanıyordu — 11:11 toplantısı 12:00'nin altına düşüyordu. Aslı Hanım
 * (2026-08-29): "aşağıda ek saat kısmı saçma olmuş." Artık şeritli ve şeritsiz
 * bütün saatler tek listede, saate göre sıralı.
 *
 * SÜRÜKLE BIRAK: "Bu calendar kısmı biraz Excel tarzında olmalı, esnek olmalı;
 * mesela sürükle bırakla taşıyabilmeli." Hem BAŞLIK hem KONU sürüklenir
 * (2026-08-29: "konulardaki başlıklar da sürükle bırak olmalı") ve tutamaç
 * YOKTUR — hücrenin HER YERİNDEN tutulur ("her yerden tutulup sürükle bırak
 * olsun"). Tıklama ile sürüklemeyi 5px eşiği ayırır: kıpırdamadan bırakılan
 * tıklama düzenleyiciyi açar.
 */
export function PlanningWeekGrid({
  weekDays, byCell, topicRows, rowCountOfSlot, extraSlots, memberNames, personHex = {},
  isAdmin, todayIso, onOpen, bands,
}: Props) {
  const router = useRouter();
  const mounted = useSyncExternalStore(subscribeMounted, getMounted, getServerMounted);
  const weekRefDay = weekDays[0];
  /* Açık şerit düzenleyici. `"new"` = yeni şerit ekleme satırı. */
  const [editingBand, setEditingBand] = useState<string | null>(null);
  /** Sürüklenen şeyin ekranda gösterilecek etiketi (toplantı ya da konu). */
  const [dragging, setDragging] = useState<string | null>(null);
  const [, startMove] = useTransition();

  const sensors = useSensors(
    // 5px eşiği: hücreye TIKLAMAK hâlâ düzenleyiciyi açar, sürükleme ayrı.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  /* Çizilecek satırlar — şeritli ve şeritsiz saatler TEK listede, kronolojik. */
  const rows = useMemo(() => {
    const out: { key: string; slot: string; band: RuntimeBand | null }[] = [
      ...bands.map((b, i) => ({ key: b.id ?? `d${i}`, slot: b.slot, band: b })),
      ...extraSlots.map((s) => ({ key: `x${s}`, slot: s, band: null })),
    ];
    return out.sort((a, b) => slotMinutes(a.slot) - slotMinutes(b.slot));
  }, [bands, extraSlots]);

  const allSlots = rows.map((r) => r.slot);

  // Excel mantığı: içeriği olmayan gün (çoğu hafta Pazar) sütunu daraltılır,
  // kazanılan genişlik dolu günlere gider — boş bir sütun 1fr yiyip metinleri
  // sıkıştırmasın. Yönetici o güne yine tıklayıp içerik ekleyebilir.
  const dayFilled = weekDays.map((iso) =>
    allSlots.some((slot) => {
      const cell = byCell.get(`${iso}|${slot}`) ?? [];
      if (cell.some((m) => m.title || m.content)) return true;
      return (topicRows.get(`${iso}|${slot}`) ?? []).some(Boolean);
    }),
  );
  const SLIM = 78;   // yalnız gün adı + tarih sığar
  const WIDE_MIN = 132;
  const LABEL_W = 84; // iki satırlık saat (NY + IST) 12px'te sığsın diye geniş
  const cols =
    `${LABEL_W}px ` + weekDays.map((_, i) => (dayFilled[i] ? `minmax(${WIDE_MIN}px, 1fr)` : `${SLIM}px`)).join(" ");
  const minWidth = LABEL_W + dayFilled.reduce((n, f) => n + (f ? WIDE_MIN : SLIM), 0);

  /* Bırakma hedefi kimliği: "gün|saat" (başlık hücresi) ya da
     "gün|saat#satır" (konu hücresi). Sürüklenen kimlik ise ya toplantı id'si
     ya da "topic:<id>". */
  function handleDragEnd(e: DragEndEvent) {
    setDragging(null);
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : "";
    const from = String(e.active.data.current?.cell ?? "");
    if (!overId || overId === from) return;

    const [cellPart, rowPart] = overId.split("#");
    const [meeting_date, time_slot] = cellPart.split("|");
    if (!meeting_date || !time_slot) return;

    if (activeId.startsWith("topic:")) {
      const topicId = activeId.slice(6);
      /* Başlık hücresine bırakılan konu listenin SONUNA eklenir. 50 şemanın
         üst sınırı: renumberTopics dizinin sonuna oturtur, taşmaz. */
      const position = rowPart === undefined ? 50 : Math.min(50, Math.max(0, Number(rowPart) || 0));
      startMove(async () => {
        const res = await moveTopic(topicId, { meeting_date, time_slot, position });
        if (!("error" in res)) router.refresh();
      });
      return;
    }

    startMove(async () => {
      const res = await moveMeeting(activeId, { meeting_date, time_slot });
      if (!("error" in res)) router.refresh();
    });
  }

  /** Bir saatin gün başlıkları satırı — şeritte de, şerit dışında da aynı. */
  const titleRow = (slot: string, bandCategory?: string) => (
    <div className="grid border-b border-hairline" style={{ gridTemplateColumns: cols }}>
      <SlotLabel slot={slot} refDay={weekRefDay} />
      {weekDays.map((iso, i) => {
        const cell = byCell.get(`${iso}|${slot}`) ?? [];
        const meta = categoryMeta(bandCategory ?? cell[0]?.category ?? "other");
        return (
          <TitleCell
            key={iso}
            cellId={`${iso}|${slot}`}
            cell={cell}
            meta={meta}
            hasBand={!!bandCategory}
            isAdmin={isAdmin}
            draggable={mounted && isAdmin}
            memberNames={memberNames}
            personHex={personHex}
            onOpen={() => onOpen(iso, slot, i)}
          />
        );
      })}
    </div>
  );

  /** Bir saatin "Konu 1..N" satırları. */
  const topicGrid = (slot: string) =>
    Array.from({ length: rowCountOfSlot.get(slot) ?? 1 }, (_, ti) => (
      <div key={ti} className="grid border-b border-hairline" style={{ gridTemplateColumns: cols }}>
        <RowLabel>Konu {ti + 1}</RowLabel>
        {weekDays.map((iso, i) => (
          <TopicCell
            key={iso}
            cellId={`${iso}|${slot}#${ti}`}
            topic={topicRows.get(`${iso}|${slot}`)?.[ti] ?? null}
            isToday={iso === todayIso}
            isAdmin={isAdmin}
            draggable={mounted && isAdmin}
            memberNames={memberNames}
            personHex={personHex}
            onOpen={() => onOpen(iso, slot, i)}
          />
        ))}
      </div>
    ));

  const grid = (
    /* h-full: sayfa artık tam ekran (bkz. PlanningBoard) — sabit bir
       max-height yerine kalan yüksekliğin tamamı. */
    <div className="hidden h-full overflow-auto overscroll-x-contain rounded-card border border-line-strong bg-surface lg:block">
      <div style={{ minWidth }}>
        {/* GÜN + TARİH TEK SATIRDA — dikey kaydırmada üstte kalır. */}
        <div className="sticky top-0 z-20 border-b border-line-strong bg-surface-muted">
          <div className="grid" style={{ gridTemplateColumns: cols }}>
            <HeadCell>Gün</HeadCell>
            {weekDays.map((iso, i) => (
              <div
                key={iso}
                title={WEEKDAY_LONG_TR[i]}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 border-r border-hairline px-1 py-1.5 leading-none last:border-r-0",
                  iso === todayIso ? "bg-brand-soft" : "",
                )}
              >
                <span className={cn(
                  "text-[12px] font-semibold uppercase tracking-[0.08em]",
                  iso === todayIso ? "text-brand-strong" : "text-subtle",
                )}>
                  {WEEKDAY_SHORT_EN[i]}
                </span>
                <span className={cn(
                  "whitespace-nowrap text-[12.5px] font-semibold tabular-nums",
                  iso === todayIso ? "text-brand-strong" : "text-ink",
                )}>
                  {/* Daraltılmış (boş) sütunda uzun ay adı satır kırıyordu. */}
                  {format(parseISO(iso), dayFilled[i] ? "d MMMM" : "d MMM", { locale: tr })}
                </span>
              </div>
            ))}
          </div>
        </div>

        {rows.map(({ key, slot, band }) => {
          const open = editingBand === key;
          return (
            <div key={key}>
              {/* Şerit — yatay kaydırmada da okunur kalsın diye etiket sola
                  sabitlenir. YÖNETİCİ TIKLAYINCA DÜZENLENİR: ad, saat, renk.
                  Şeritsiz saat (elle girilmiş 11:11 gibi) başlıksız çizilir;
                  saatin kendisi zaten sol sütunda yazıyor. */}
              {band && (
                <div className={cn("border-y border-hairline", categoryMeta(band.category).chip)}>
                  {open ? (
                    <BandEditor band={band} refDay={weekRefDay} onClose={() => setEditingBand(null)} />
                  ) : (
                    isAdmin ? (
                      <button
                        type="button"
                        onClick={() => setEditingBand(key)}
                        title="Şeridi düzenle — ad, saat, renk"
                        className="sticky left-0 inline-flex min-h-[28px] items-center gap-1.5 px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.1em] transition-opacity duration-150 hover:opacity-80"
                      >
                        {band.label || "—"}
                        {/* Kalem HER ZAMAN görünür (soluk) — hover'a saklı işlev
                            dokunmatikte yoktur; salt-okur üyede hiç çizilmez. */}
                        <Pencil size={12} className="opacity-60" aria-hidden />
                      </button>
                    ) : (
                      <span className="sticky left-0 inline-flex min-h-[28px] items-center px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.1em]">
                        {band.label || "—"}
                      </span>
                    )
                  )}
                </div>
              )}
              {titleRow(slot, band?.category)}
              {topicGrid(slot)}
            </div>
          );
        })}

        {/* Yeni saat — ızgaranın sonunda tek satır. */}
        {isAdmin && (
          <div className="border-t border-hairline bg-surface-muted">
            {editingBand === "new" ? (
              <BandEditor
                band={{ id: null, slot: "13:00", category: "other", label: "", topicRows: 3, columns: [] }}
                refDay={weekRefDay}
                onClose={() => setEditingBand(null)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingBand("new")}
                className="sticky left-0 inline-flex min-h-[36px] items-center gap-1 px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle transition-colors duration-150 hover:text-brand"
              >
                <Plus size={13} aria-hidden /> Saat ekle
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // Sunucuda ve ilk boyamada düz ızgara; dnd-kit yalnız istemcide sarar.
  if (!mounted || !isAdmin) return grid;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) =>
        setDragging(String(e.active.data.current?.label ?? "") || null)
      }
      onDragCancel={() => setDragging(null)}
      onDragEnd={handleDragEnd}
    >
      {grid}
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="rounded-control border border-brand-ring bg-surface px-2.5 py-1.5 text-[12.5px] font-semibold tracking-tight text-ink shadow-pop">
            {dragging}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * Gün başlığı hücresi — hem BIRAKMA hedefi hem (toplantı varsa) sürüklenebilir.
 * Tutamaç ayrı bir eleman: hücrenin tamamı hedef, tutamaç sürükler. Böylece
 * hücreye tıklamak düzenleyiciyi açmaya devam eder.
 */
function TitleCell({
  cellId, cell, meta, hasBand, isAdmin, draggable, memberNames, personHex, onOpen,
}: {
  cellId: string;
  cell: PlanningMeetingWithTopics[];
  meta: ReturnType<typeof categoryMeta>;
  hasBand: boolean;
  isAdmin: boolean;
  draggable: boolean;
  memberNames: Record<string, string>;
  personHex: Record<string, string>;
  onOpen: () => void;
}) {
  const meeting = cell[0] ?? null;
  const title = cell.map((m) => m.title).filter(Boolean).join(" · ");
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: cellId, disabled: !draggable });
  const canDrag = draggable && !!meeting;
  const { attributes, listeners, setNodeRef: dragRef, isDragging } = useDraggable({
    id: meeting?.id ?? cellId,
    disabled: !canDrag,
    data: { cell: cellId, label: title || "Toplantı" },
  });
  /* Aynı düğüm hem hedef hem kaynak — Aslı Hanım (2026-08-29): "her yerden
     tutulup sürükle bırak olsun." Ayrı bir tutamaç ikonu vardı; hücrenin
     yalnız 12px'lik köşesinden tutuluyordu. */
  const setRef = (node: HTMLDivElement | null) => { dropRef(node); dragRef(node); };

  const content = cell.map((m) => m.content).filter(Boolean).join(" · ");
  const keyOpen = keyboardOpen(isAdmin && !canDrag, onOpen);
  const ids = [...new Set(cell.flatMap((m) => m.participant_ids ?? []))];
  const kim = cell.map((m) => m.kim).filter(Boolean).join(", ");
  const collabIds = [...new Set(cell.flatMap((m) => m.collaborator_ids ?? []))];

  return (
    <div
      ref={setRef}
      {...(canDrag ? listeners : {})}
      {...(canDrag ? attributes : {})}
      {...keyOpen}
      onClick={isAdmin ? onOpen : undefined}
      className={cn(
        // Başlıklar dikeyde ORTALANIR: bir gün iki satıra taşınca tek satırlık
        // komşuları yukarıda asılı kalmasın.
        "group/cell relative flex min-h-[38px] items-center border-r border-hairline px-2 py-1.5 last:border-r-0",
        cell.length || hasBand ? meta.cell : "bg-surface",
        // Hover: filtre (brightness) yerine ince bir mürekkep perdesi — kategori
        // rengi bozulmaz, sürükleme halkasıyla (ring) çakışmaz.
        isAdmin && HOVER_VEIL,
        canDrag && "active:cursor-grabbing",
        isOver && "ring-2 ring-inset ring-brand-ring",
        isDragging && "opacity-40",
      )}
      title={canDrag ? "Sürükleyip başka gün/saate taşıyabilirsiniz" : undefined}
    >
      {/* BOŞ HÜCRE BOŞ DURUR. Burada "+ başlık" ipucu vardı; görünmez (opacity-0)
          olmasına rağmen sayfa kopyalanınca her boş hücrede "başlık" kelimesi
          çıkıyordu ve ekranda da yanıp sönen bir gürültüydü. Hücrenin
          tıklanabilir olduğunu imleç zaten söylüyor. */}
      <span className="min-w-0">
        <span className={cn("block text-[12.5px] font-bold leading-[1.25] tracking-tight", meta.title)}>
          {title}
        </span>
        <KimBadges ids={ids} kim={kim} collaboratorIds={collabIds} memberNames={memberNames} personHex={personHex} />
        {content && (
          <span className="mt-0.5 block whitespace-pre-line text-[12px] leading-snug text-ink/70">
            {content}
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * Konu hücresi — bırakma hedefi ve (konu varsa) sürüklenebilir.
 *
 * Aslı Hanım (2026-08-29): "Konulardaki başlıklar da sürükle bırak olmalı."
 * Konu başka bir güne/saate ya da aynı saatin başka bir "Konu N" satırına
 * taşınabilir; hedef hücrede toplantı yoksa sunucu sessizce açar.
 */
function TopicCell({
  cellId, topic, isToday, isAdmin, draggable, memberNames, personHex, onOpen,
}: {
  cellId: string;
  topic: PlanningTopic | null;
  isToday: boolean;
  isAdmin: boolean;
  draggable: boolean;
  memberNames: Record<string, string>;
  personHex: Record<string, string>;
  onOpen: () => void;
}) {
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: cellId, disabled: !draggable });
  const canDrag = draggable && !!topic?.text;
  const { attributes, listeners, setNodeRef: dragRef, isDragging } = useDraggable({
    id: topic ? `topic:${topic.id}` : cellId,
    disabled: !canDrag,
    data: { cell: cellId, label: topic?.text ?? "Konu" },
  });
  const setRef = (node: HTMLDivElement | null) => { dropRef(node); dragRef(node); };
  const keyOpen = keyboardOpen(isAdmin && !canDrag, onOpen);

  return (
    <div
      ref={setRef}
      {...(canDrag ? listeners : {})}
      {...(canDrag ? attributes : {})}
      {...keyOpen}
      onClick={isAdmin ? onOpen : undefined}
      title={canDrag ? "Sürükleyip başka gün/saate ya da satıra taşıyabilirsiniz" : undefined}
      className={cn(
        "relative min-h-[30px] border-r border-hairline px-2 py-1.5 text-[12px] leading-snug text-ink/90 last:border-r-0",
        isToday && "bg-brand-soft/25",
        isAdmin && HOVER_VEIL,
        canDrag && "active:cursor-grabbing",
        isOver && "ring-2 ring-inset ring-brand-ring",
        isDragging && "opacity-40",
      )}
    >
      {topic?.text}
      {topic?.task_id && (
        <CheckCircle2 size={12} className="ml-1 inline shrink-0 text-success" aria-label="Göreve atandı" />
      )}
      {topic && (
        <KimBadges
          ids={topic.participant_ids}
          kim={topic.kim}
          collaboratorIds={topic.collaborator_ids}
          memberNames={memberNames}
          personHex={personHex}
        />
      )}
      {/* Tarih YALNIZ hücrenin gününden FARKLIYSA yazılır. Konu bir güne
          eklendiği için teslim tarihi varsayılan olarak o gündür; her satıra
          sütunun tarihini tekrar basmak gürültüydü (Aslı Hanım, 2026-08-29:
          "zaten ben o tarihi seçip konu ekliyorum"). */}
      {topic?.due_date && topic.due_date.slice(0, 10) !== cellId.split("|")[0] && (
        <span className="ml-1 whitespace-nowrap text-[12px] tabular-nums text-subtle">
          {format(parseISO(topic.due_date), "d MMM", { locale: tr })}
        </span>
      )}
    </div>
  );
}

function HeadCell({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky left-0 z-10 border-r border-hairline bg-surface-muted px-2.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">
      {children}
    </div>
  );
}

/** Saat sütunu: üstte kayıtlı New York saati, altında İstanbul karşılığı. */
function SlotLabel({ slot, refDay }: { slot: string; refDay: string }) {
  const ist = istanbulLabel(refDay, slot);
  return (
    <div className="sticky left-0 z-10 border-r border-hairline bg-surface px-2.5 py-1.5">
      <span className="block text-[12.5px] font-semibold tabular-nums leading-tight text-ink">
        <span className="mr-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-subtle">{HOME_LABEL}</span>
        {slot}
      </span>
      {ist && (
        <span className="mt-0.5 block text-[12px] font-medium tabular-nums leading-tight text-subtle">
          <span className="mr-1 uppercase tracking-[0.06em]">{AWAY_LABEL}</span>
          {ist}
        </span>
      )}
    </div>
  );
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky left-0 z-10 border-r border-hairline bg-surface px-2.5 py-1.5 text-[12px] font-medium text-subtle">
      {children}
    </div>
  );
}
