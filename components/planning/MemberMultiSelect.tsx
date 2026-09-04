"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Users, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { initialsOf } from "@/lib/planning/initials";
import { PersonAvatar } from "@/components/ui/PersonAvatar";

export type Member = {
  id: string;
  name: string;
  /** profiles.avatar_url — varsa rozet fotoğrafı gösterir. */
  photoUrl?: string | null;
};

interface Props {
  members: Member[];
  selected: string[];
  onChange: (_ids: string[]) => void;
  placeholder?: string;
  compact?: boolean;
  /** profiles.id → hex. Rozetler kişinin KENDİ rengini taşır (Pano/List ile
   *  aynı kaynak); verilmezse nötr gri. */
  personHex?: Record<string, string>;
}

const LIST_WIDTH = 224;      // w-56
const LIST_EST_HEIGHT = 240; // ilk boyama tahmini, ölçülünce düzelir
const LIST_MAX_HEIGHT = 380; // ekranda yer varsa bu kadar uzayabilir
const MAX_BADGES = 4;        // tetikleyicide yan yana en fazla bu kadar yüz

/**
 * Sistemdeki üyelerden çoklu seçim; buton seçili baş harfleri gösterir.
 *
 * Açılır liste <body>'ye PORTAL edilir. Sebebi: bu seçici toplantı
 * düzenleyicisinin `max-h-[70vh] overflow-y-auto` gövdesinin içinde yaşıyor;
 * `absolute` konumlu liste o kutunun kenarında KIRPILIYORDU — "İş birliği"
 * açılınca isimlerin yarısı görünmüyordu (2026-08-20 kullanıcı geri bildirimi).
 * Kart menüsüyle (KanbanBoard/CardMenu) aynı desen: viewport koordinatı ölç,
 * yer yoksa yukarı çevir, kaydırma/yeniden boyutlamada kapat.
 */
export function MemberMultiSelect({
  members, selected, onChange, placeholder = "Kim", compact, personHex = {},
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const trigger = ref.current;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const height = listRef.current?.offsetHeight ?? LIST_EST_HEIGHT;
    // Liste tetikleyiciden dar olmasın; ekrandan da taşmasın.
    const width = Math.max(LIST_WIDTH, r.width);
    const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - width - 8));

    /* Yükseklik EKRANA GÖRE: sabit 240px, ekranda yer varken bile listeyi
       kısaltıp gereksiz kaydırma üretiyordu ("kişilerin tamamı çıkmıyor").
       Altta ve üstte kalan boşluk ölçülür, geniş olan taraf seçilir. */
    const spaceBelow = window.innerHeight - r.bottom - 12;
    const spaceAbove = r.top - 12;
    const openUp = spaceBelow < Math.min(height, LIST_EST_HEIGHT) && spaceAbove > spaceBelow;
    const maxHeight = Math.max(140, Math.min(LIST_MAX_HEIGHT, openUp ? spaceAbove : spaceBelow));
    const shown = Math.min(height, maxHeight);
    const top = openUp ? Math.max(8, r.top - shown - 4) : r.bottom + 4;

    setPos((prev) =>
      prev && prev.top === top && prev.left === left && prev.width === width && prev.maxHeight === maxHeight
        ? prev
        : { top, left, width, maxHeight },
    );
  }, []);

  useEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    /* KAYDIRINCA KAPANMAZ, TAKİP EDER.
       Sıraç (2026-08-30): "Scroll olunca kapanmamalı."
       Önce iki kusur vardı: (1) dinleyici yakalama fazındaydı ve listenin
       KENDİ kaydırmasını da yakalayıp kapatıyordu — aşağı inmek imkânsızdı;
       (2) sayfa kaydırılınca liste tamamen kapanıyordu, oysa kullanıcı
       seçimini bitirmemişti. `fixed` katman tetikleyiciyi kendiliğinden takip
       etmez; çözüm kapatmak değil, YENİDEN KONUMLANDIRMAK. Tetikleyici
       görüş alanından tamamen çıkarsa liste kapanır — havada asılı kalmasın. */
    const onScroll = (e: Event) => {
      const t = e.target as Node | null;
      if (t && listRef.current?.contains(t)) return; // listenin kendi kaydırması
      const r = ref.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) { setOpen(false); return; }
      place();
    };
    const onResize = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, place]);

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  const selectedMembers = members.filter((m) => selected.includes(m.id));

  const list = open && (
    <div
      ref={listRef}
      role="listbox"
      aria-multiselectable="true"
      style={pos ? { top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight } : { opacity: 0 }}
      className="anim-fade-down fixed z-[120] overflow-y-auto overscroll-contain rounded-control border border-line bg-surface p-1 shadow-pop"
    >
      {members.length === 0 ? (
        <p className="px-2 py-1.5 text-[12px] text-subtle">Üye bulunamadı.</p>
      ) : (
        members.map((m) => {
          const on = selected.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              role="option"
              aria-selected={on}
              onClick={() => toggle(m.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors duration-150",
                on ? "bg-brand-soft font-medium text-brand-strong" : "text-ink hover:bg-surface-muted active:bg-surface-hover",
              )}
            >
              <PersonAvatar
                name={m.name}
                photoUrl={m.photoUrl}
                colorHex={personHex[m.id] ?? null}
                size="xs"
              />
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
              {on && <Check size={14} className="anim-scale-in shrink-0" />}
            </button>
          );
        })
      )}
    </div>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between gap-1 rounded-control border bg-surface text-[13.5px] text-ink transition-[border-color,box-shadow] duration-150 focus:outline-none focus:ring-2 focus:ring-brand-ring focus:border-brand-ring",
          open ? "border-brand-ring" : "border-line hover:border-line-strong",
          compact ? "min-h-8 px-2 py-1" : "min-h-9 px-2.5 py-1.5",
        )}
      >
        {/* SEÇİLENLER YAN YANA — sarmayan tek satır.
            Sıraç (2026-08-30): "Kişiler yan yana gelmeli ve şuradaki gibi."
            Önce `flex-wrap` ile köşeli baş-harf çipleriydi: iki kişi seçilince
            alt alta kayıyor, satırı ikiye çıkarıp ızgarayı bozuyordu. Artık
            List'teki süzgeç baloncuklarıyla AYNI dil — yuvarlak avatar,
            fotoğraf varsa fotoğraf, yoksa kişinin renginde baş harf — ve hafif
            üst üste binerek (-space-x) tek satırda kalır. Dördü aşınca "+N". */}
        <span className="flex min-w-0 items-center">
          {selectedMembers.length === 0 ? (
            <span className="truncate text-subtle">{placeholder}</span>
          ) : (
            <span className="flex shrink-0 items-center -space-x-1.5">
              {selectedMembers.slice(0, MAX_BADGES).map((m) => (
                <PersonAvatar
                  key={m.id}
                  name={m.name}
                  photoUrl={m.photoUrl}
                  colorHex={personHex[m.id] ?? null}
                  size="xs"
                  ring
                  title={m.name}
                />
              ))}
              {selectedMembers.length > MAX_BADGES && (
                <span
                  title={selectedMembers.slice(MAX_BADGES).map((m) => m.name).join(", ")}
                  className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-surface-sunken px-1 text-[11px] font-semibold tabular-nums text-muted ring-2 ring-surface"
                >
                  +{selectedMembers.length - MAX_BADGES}
                </span>
              )}
            </span>
          )}
        </span>
        <ChevronDown size={13} className={cn("shrink-0 text-subtle transition-transform duration-200 ease-standard", open && "rotate-180")} />
      </button>

      {typeof document !== "undefined" && list ? createPortal(list, document.body) : null}
    </div>
  );
}

/** Salt-görüntü: id listesini baş-harf rozetleri olarak gösterir.
 *  `extra` — sistemde kullanıcısı olmayan kişiler (Aslı'nın "Kim" metninden
 *  çözülemeyen adlar); ham hâliyle, daha soluk gösterilir. */
export function MemberInitials({
  ids, memberNames, extra = [], className,
}: { ids: string[]; memberNames: Record<string, string>; extra?: string[]; className?: string }) {
  if (!ids?.length && !extra.length) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      <Users size={11} className="text-ink/50" aria-hidden />
      {ids.map((id) => (
        <span key={id} title={memberNames[id] ?? ""} className="rounded bg-black/5 px-1 text-[11.5px] font-semibold text-ink/70">
          {initialsOf(memberNames[id])}
        </span>
      ))}
      {extra.map((name) => (
        <span key={name} title={`${name} — sistemde kullanıcı değil`} className="rounded bg-black/5 px-1 text-[12px] font-medium text-ink/60">
          {name}
        </span>
      ))}
    </span>
  );
}
