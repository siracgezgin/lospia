"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { tr } from "date-fns/locale";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { CheckCircle2, Plus, Pencil, X, Loader2, XCircle, Copy, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { categoryMeta } from "@/lib/planning/categories";
import { WEEKDAY_SHORT_EN, WEEKDAY_LONG_TR, type RuntimeBand } from "@/lib/planning/bands";
import { BandEditor } from "./BandEditor";
import { istanbulLabel, AWAY_LABEL, HOME_LABEL, normalizeSlot } from "@/lib/planning/timezones";
import { moveMeeting, moveTopic, duplicateMeeting, setMeetingTitle, deleteTopic } from "@/lib/actions/planning";
import { KimBadges } from "./KimBadges";
import type { PlanningMeetingWithTopics, PlanningTopic } from "@/types";

interface Props {
  weekDays: string[];
  byCell: Map<string, PlanningMeetingWithTopics[]>;
  topicRows: Map<string, (PlanningTopic | null)[]>;
  rowCountOfSlot: Map<string, number>;
  extraSlots: string[];
  memberNames: Record<string, string>;
  /** profiles.id → fotoğraf; kişi rozetleri yuvarlak kart. */
  memberPhotos?: Record<string, string | null>;
  /** Kişi rengi (profiles.id → hex) — baş harf rozetleri kendi renginde. */
  personHex?: Record<string, string>;
  isAdmin: boolean;
  todayIso: string;
  /** `_topicIndex` verildiğinde düzenleyici YALNIZ o konuyu açar (H1). */
  onOpen: (_iso: string, _slot: string, _dayIndex: number, _topicIndex?: number) => void;
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
  weekDays, byCell, topicRows, rowCountOfSlot, extraSlots, memberNames, memberPhotos = {}, personHex = {},
  isAdmin, todayIso, onOpen, bands,
}: Props) {
  const router = useRouter();
  const mounted = useSyncExternalStore(subscribeMounted, getMounted, getServerMounted);
  const weekRefDay = weekDays[0];
  /* Açık şerit düzenleyici. `"new"` = yeni şerit ekleme satırı. */
  const [editingBand, setEditingBand] = useState<string | null>(null);
  /** Sürüklenen şeyin ekranda gösterilecek etiketi (toplantı ya da konu). */
  const [dragging, setDragging] = useState<string | null>(null);
  /* Taşıma SESSİZ BAŞARISIZ OLUYORDU: sunucu hata döndürdüğünde kart eski
     yerine geri kayıyor ve ekranda hiçbir şey yazmıyordu — kullanıcı taşımanın
     tutmadığını ancak sayfayı yenileyince anlıyordu. Artık hata yazılır,
     taşıma sürerken de kısa bir "Taşınıyor…" şeridi görünür. */
  const [moveError, setMoveError] = useState<string | null>(null);
  /** Taşıma yerine KOPYALAMA yapıldığında kullanıcıya söylenen kısa not. */
  const [moveNote, setMoveNote] = useState<string | null>(null);
  const [isMoving, startMove] = useTransition();
  /** Sürükleme Option/Alt ile mi başladı — kopya kipinin göstergesi. */
  const [copyMode, setCopyMode] = useState(false);

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
    setCopyMode(false);
    setMoveError(null);
    setMoveNote(null);
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : "";
    const from = String(e.active.data.current?.cell ?? "");
    if (!overId || overId === from) return;

    const [cellPart, rowPart] = overId.split("#");
    const [meeting_date, time_slot] = cellPart.split("|");
    if (!meeting_date || !time_slot) return;

    /* TAKVİM BİR ARŞİVDİR. Aslı Hanım (2026-09-07), pazartesinin toplantısını
       çarşambaya sürükleyip: "Bu pazartesiyi buraya ALDI. Hâlbuki ben bunun
       alsın istemiyorum. Ben dönüp HANGİ TARİHTE HANGİ TOPLANTIYI yaptığımız
       kalsın istiyorum." Sürüklemek geçmiş günü boşaltıyordu.
       Artık:
         • Option/Alt basılıysa → her zaman ÇOĞALT ("option'a basıp duplicate
           gibi taşıyabiliyor muyum?"),
         • geçmişteki bir toplantı sürüklendiyse → yine ÇOĞALT; kaynak kendi
           gününde kalır ve neden kopyalandığı yazılır,
         • bugün ya da ileri tarihli bir toplantı → eskisi gibi TAŞINIR. */
    const sourceDay = from.split("|")[0] ?? "";
    const isPastSource = !!sourceDay && sourceDay < todayIso;
    const wantsCopy = copyMode || (!activeId.startsWith("topic:") && isPastSource);

    if (activeId.startsWith("topic:")) {
      const topicId = activeId.slice(6);
      /* Başlık hücresine bırakılan konu listenin SONUNA eklenir. 50 şemanın
         üst sınırı: renumberTopics dizinin sonuna oturtur, taşmaz. */
      const position = rowPart === undefined ? 50 : Math.min(50, Math.max(0, Number(rowPart) || 0));
      startMove(async () => {
        const res = await moveTopic(topicId, { meeting_date, time_slot, position });
        if ("error" in res) { setMoveError(`Konu taşınamadı: ${res.error}`); return; }
        router.refresh();
      });
      return;
    }

    if (wantsCopy) {
      startMove(async () => {
        const res = await duplicateMeeting(activeId, { meeting_date, time_slot });
        if ("error" in res) { setMoveError(`Toplantı çoğaltılamadı: ${res.error}`); return; }
        setMoveNote(
          copyMode
            ? "Toplantının bir kopyası oluşturuldu."
            : "Geçmiş toplantı yerinde kaldı; devamı yeni güne kopyalandı.",
        );
        router.refresh();
      });
      return;
    }

    startMove(async () => {
      const res = await moveMeeting(activeId, { meeting_date, time_slot });
      if ("error" in res) { setMoveError(`Toplantı taşınamadı: ${res.error}`); return; }
      router.refresh();
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
            memberNames={memberNames} memberPhotos={memberPhotos}
            personHex={personHex}
            onOpen={() => onOpen(iso, slot, i)}
            onSaved={() => router.refresh()}
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
            memberNames={memberNames} memberPhotos={memberPhotos}
            personHex={personHex}
            onOpen={() => onOpen(iso, slot, i, ti)}
            onSaved={() => router.refresh()}
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
              /* BUGÜN — soluk bir zemin yetmiyordu.
                 Sıraç (2026-08-30): "Hangi günde olduğumuz daha belirgin olmalı,
                 anlaşılmıyor." Yedi sütunun biri yalnız bir tık açık maviydi;
                 göz onu ancak arayınca buluyordu. Artık üç sinyal birlikte
                 çalışıyor: DOLU marka zemini + beyaz yazı + üstte 3px'lik
                 çubuk. Renk tek başına anlam taşımasın diye ayrıca "BUGÜN"
                 yazar (ekran okuyucuya da `aria-current`). */
              <div
                key={iso}
                title={WEEKDAY_LONG_TR[i]}
                aria-current={iso === todayIso ? "date" : undefined}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-0.5 border-r border-hairline px-1 py-1.5 leading-none last:border-r-0",
                  iso === todayIso && "bg-brand",
                )}
              >
                {iso === todayIso && (
                  <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-brand-strong" />
                )}
                <span className={cn(
                  "text-[12px] font-semibold uppercase tracking-[0.08em]",
                  iso === todayIso ? "text-white/80" : "text-subtle",
                )}>
                  {iso === todayIso ? "BUGÜN" : WEEKDAY_SHORT_EN[i]}
                </span>
                <span className={cn(
                  "whitespace-nowrap text-[12.5px] font-semibold tabular-nums",
                  iso === todayIso ? "text-white" : "text-ink",
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
                    <BandEditor
                      band={band}
                      refDay={weekRefDay}
                      takenSlots={bands.filter((b) => b.slot !== band.slot).map((b) => b.slot)}
                      onClose={() => setEditingBand(null)}
                    />
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
                takenSlots={bands.map((b) => b.slot)}
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
      onDragStart={(e: DragStartEvent) => {
        setDragging(String(e.active.data.current?.label ?? "") || null);
        // Option/Alt sürüklemeyi BAŞLATIRKEN basılıysa kopya kipi açılır.
        const src = e.activatorEvent as { altKey?: boolean } | undefined;
        setCopyMode(Boolean(src?.altKey));
      }}
      onDragCancel={() => { setDragging(null); setCopyMode(false); }}
      onDragEnd={handleDragEnd}
    >
      {grid}
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="flex items-center gap-1.5 rounded-control border border-brand-ring bg-surface px-2.5 py-1.5 text-[12.5px] font-semibold tracking-tight text-ink shadow-pop">
            {copyMode && <Copy size={13} className="shrink-0 text-brand" aria-hidden />}
            {dragging}
            {copyMode && <span className="text-brand">kopya</span>}
          </div>
        )}
      </DragOverlay>

      {/* TAŞIMA DURUMU — ızgaranın yerleşimini bozmasın diye ekranın altında
          yüzen tek şerit. Hata kendiliğinden kaybolmaz: kullanıcı okumadan
          geçmesin (kapatma düğmesi var).

          KONUM "Geri al" şeridinin BİR KADEME ÜSTÜ (bottom-20): MeetingUndoBar
          aynı sayfada, aynı z katmanında bottom-4'te duruyor. İkisi aynı anda
          açıkken üst üste biniyor ve telefonda geri almanın TEK yolu olan
          düğme bu kutunun altında kalıyordu. */}
      {(isMoving || moveError || moveNote) && (
        <div className="mb-bottom-nav pointer-events-none fixed inset-x-0 bottom-20 z-[110] flex justify-center px-4 md:mb-0">
          <div
            role={moveError ? "alert" : "status"}
            className={cn(
              "anim-fade-up pointer-events-auto flex max-w-full items-center gap-2.5 rounded-card border bg-surface px-4 py-2.5 shadow-pop",
              moveError ? "border-danger/30" : "border-line",
            )}
          >
            {moveError ? (
              <>
                <span className="min-w-0 text-[13.5px] font-medium text-danger">{moveError}</span>
                <button
                  type="button"
                  onClick={() => setMoveError(null)}
                  aria-label="Uyarıyı kapat"
                  title="Kapat"
                  className="tap-target grid size-8 shrink-0 place-items-center rounded-control text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
                >
                  <X size={15} aria-hidden />
                </button>
              </>
            ) : isMoving ? (
              <span className="flex items-center gap-2 text-[13.5px] text-muted">
                <Loader2 size={14} className="animate-spin" aria-hidden /> Taşınıyor…
              </span>
            ) : (
              <>
                <span className="flex min-w-0 items-center gap-2 text-[13.5px] text-ink">
                  <Copy size={14} className="shrink-0 text-brand" aria-hidden /> {moveNote}
                </span>
                <button
                  type="button"
                  onClick={() => setMoveNote(null)}
                  aria-label="Bilgiyi kapat"
                  title="Kapat"
                  className="tap-target grid size-8 shrink-0 place-items-center rounded-control text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
                >
                  <X size={15} aria-hidden />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </DndContext>
  );
}

/**
 * Gün başlığı hücresi — hem BIRAKMA hedefi hem (toplantı varsa) sürüklenebilir.
 * Tutamaç ayrı bir eleman: hücrenin tamamı hedef, tutamaç sürükler. Böylece
 * hücreye tıklamak düzenleyiciyi açmaya devam eder.
 */
function TitleCell({
  cellId, cell, meta, hasBand, isAdmin, draggable, memberNames, memberPhotos = {}, personHex, onOpen,
  onSaved,
}: {
  cellId: string;
  cell: PlanningMeetingWithTopics[];
  meta: ReturnType<typeof categoryMeta>;
  hasBand: boolean;
  isAdmin: boolean;
  draggable: boolean;
  memberNames: Record<string, string>;
  memberPhotos?: Record<string, string | null>;
  personHex: Record<string, string>;
  onOpen: () => void;
  onSaved: () => void;
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
  /* SONUÇ — hücrenin başında büyük yeşil tik ya da kırmızı çarpı.
     Aslı Hanım (2026-09-07): "Bu yeşili biraz daha büyük yapabilirsin. Hani
     böyle BAŞARDIK gibi bir yeşil olsun." / "Bir aksama oldu — toplantı kırmızı
     çarpı olsun." İşaret hücrenin İÇİNDE değil, metnin SOLUNDA duruyor: göz
     haftaya baktığında hangi toplantının bittiğini okumadan görüyor.
     Bu ekranda yalnız GÖSTERİLİR; işaretleme toplantı penceresinde yapılır —
     hücre zaten sürükleniyor, üzerine ikinci bir tıklama hedefi koymak
     sürüklemeyi yutuyordu. */
  const outcome = cell.find((m) => m.status === "done" || m.status === "missed")?.status ?? null;

  /* BAŞLIK YERİNDE DEĞİŞİR. Aslı Hanım (2026-09-07): "Toplantı başlıkları ve
     konular AYRI olsun — başlık üzerine tıklayınca değişebilir olsun, silip
     yazabiliriz." Önceden başlığı değiştirmenin tek yolu bütün gündemi açan
     pencereydi. Artık tıklamak metni yazılabilir yapıyor; pencere ise
     köşedeki düğmede (kişiler, not, Bildir orada yaşıyor).
     Yalnız TEK toplantılı hücrede: aynı saatte iki başlık birleşmişse hangisini
     yazdığımız belirsiz olur, orada pencere açılır. */
  const single = cell.length === 1 ? cell[0] : null;
  const canRename = isAdmin && (cell.length === 0 || !!single);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);

  async function commit() {
    const next = draft.trim();
    setEditing(false);
    if (next === (title ?? "").trim()) return;
    if (!next && !single) return;              // boş hücreye boş başlık: iş yok
    setSaving(true);
    try {
      const [meeting_date, time_slot] = cellId.split("|");
      await setMeetingTitle(
        single ? { meetingId: single.id } : { meeting_date, time_slot },
        next,
      );
      onSaved();
    } finally {
      setSaving(false);
    }
  }
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
      onClick={
        isAdmin
          ? () => { if (canRename) { setDraft(title); setEditing(true); } else onOpen(); }
          : undefined
      }
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
      {outcome === "done" && (
        <CheckCircle2
          size={22}
          strokeWidth={2.5}
          className="mr-1.5 shrink-0 text-success"
          aria-label="Tamamlandı"
        />
      )}
      {outcome === "missed" && (
        <XCircle
          size={22}
          strokeWidth={2.5}
          className="mr-1.5 shrink-0 text-danger"
          aria-label="Aksadı — sonraki güne eklenmeli"
        />
      )}
      <span className="min-w-0 flex-1">
        {editing ? (
          /* Sürükleme dinleyicileri ÜST düğümde: input'ta pointer olaylarını
             durdurmazsak yazmaya çalışırken hücre sürüklenmeye başlıyor. */
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => { void commit(); }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") { e.preventDefault(); void commit(); }
              if (e.key === "Escape") { e.preventDefault(); setDraft(title); setEditing(false); }
            }}
            aria-label="Toplantı başlığı"
            placeholder="Başlık…"
            className="w-full rounded-[4px] border border-brand-ring bg-surface px-1 py-0.5 text-[12.5px] font-bold tracking-tight text-ink outline-none"
          />
        ) : (
          <span
            className={cn(
              "block text-[12.5px] font-bold leading-[1.25] tracking-tight",
              meta.title,
              // Biten iş üstü çizili değil, SOLUK: çizgi başlığı okunmaz yapıyor.
              outcome === "done" && "opacity-70",
              saving && "opacity-50",
            )}
          >
            {title}
          </span>
        )}
        <KimBadges ids={ids} kim={kim} collaboratorIds={collabIds} memberNames={memberNames} memberPhotos={memberPhotos} personHex={personHex} />
        {content && (
          <span className="mt-0.5 block whitespace-pre-line text-[12px] leading-snug text-ink/70">
            {content}
          </span>
        )}
      </span>

      {/* PENCERE KAPISI. Başlık artık hücrede düzenlendiği için toplantının
          geri kalanı (kişiler, not, Bildir, sonuç, çoğaltma) bu düğmenin
          arkasında. İç içe <button> değil KARDEŞ: hücre bir <div>, geçerli. */}
      {isAdmin && !editing && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
          title="Toplantıyı aç — kişiler, konular, not"
          aria-label="Toplantıyı aç"
          className="absolute right-0.5 top-0.5 z-10 grid size-5 place-items-center rounded-[4px] text-ink/35 opacity-0 transition-opacity duration-150 hover:bg-surface/70 hover:text-ink focus-visible:opacity-100 group-hover/cell:opacity-100"
        >
          <Maximize2 size={11} aria-hidden />
        </button>
      )}
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
  cellId, topic, isToday, isAdmin, draggable, memberNames, memberPhotos = {}, personHex, onOpen,
  onSaved,
}: {
  cellId: string;
  topic: PlanningTopic | null;
  isToday: boolean;
  isAdmin: boolean;
  draggable: boolean;
  memberNames: Record<string, string>;
  memberPhotos?: Record<string, string | null>;
  personHex: Record<string, string>;
  onOpen: () => void;
  onSaved: () => void;
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

  /* TEK KONU SİLME. Aslı Hanım (2026-09-07): "Ben sil deyince genelde KOMPLE O
     TOPLANTI siliniyor, bunu istemiyorum. BİRER BİRER SİLİNEBİLSİN."
     Silme artık konunun kendi hücresinde, kendi düğmesinde: toplantıyı silme
     yolu ayrı bir kapıda (pencerenin altında) ve ayrıca onaylı. */
  const [removing, setRemoving] = useState(false);
  async function removeTopic() {
    if (!topic) return;
    setRemoving(true);
    try {
      await deleteTopic(topic.id);
      onSaved();
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div
      ref={setRef}
      {...(canDrag ? listeners : {})}
      {...(canDrag ? attributes : {})}
      {...keyOpen}
      onClick={isAdmin ? onOpen : undefined}
      title={canDrag ? "Sürükleyip başka gün/saate ya da satıra taşıyabilirsiniz" : undefined}
      className={cn(
        "group/topic relative min-h-[30px] border-r border-hairline px-2 py-1.5 text-[12px] leading-snug text-ink/90 last:border-r-0",
        // Bugünün sütunu gövdede de sürer — göz başlıktan aşağı inince
        // hangi sütunda olduğunu kaybetmesin. Zemin bilerek ÇOK açık:
        // hücrelerdeki metin ve kategori renkleri okunur kalmalı.
        isToday && "bg-brand-soft/40",
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
          memberNames={memberNames} memberPhotos={memberPhotos}
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

      {/* Yalnız BU konuyu siler — toplantıya dokunmaz. Kardeş düğüm, iç içe
          düğme değil; sürükleme dinleyicileri üstte olduğu için pointerdown
          durdurulur, yoksa silmeye giderken hücre sürüklenmeye başlıyor. */}
      {isAdmin && topic?.text && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); void removeTopic(); }}
          disabled={removing}
          title="Yalnız bu konuyu sil"
          aria-label={`“${topic.text}” konusunu sil`}
          className="absolute right-0.5 top-0.5 z-10 grid size-5 place-items-center rounded-[4px] text-ink/35 opacity-0 transition-opacity duration-150 hover:bg-surface/70 hover:text-danger focus-visible:opacity-100 group-hover/topic:opacity-100 disabled:opacity-40"
        >
          {removing ? <Loader2 size={11} className="animate-spin" aria-hidden /> : <X size={11} aria-hidden />}
        </button>
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
