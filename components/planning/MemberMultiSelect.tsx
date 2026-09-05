"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAnchoredMenu } from "@/lib/utils/use-anchored-menu";
import { createPortal } from "react-dom";
import { Users, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

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
  const close = useCallback(() => setOpen(false), []);

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

  /* Kapanma/konum davranışı ORTAK kurala taşındı (lib/utils/use-anchored-menu):
     menünün kendi kaydırması yok sayılır, dışarıdaki kaydırmada liste
     tetikleyicisini takip eder, tetikleyici ekrandan çıkarsa kapanır. */
  useAnchoredMenu({ open, onClose: close, triggerRef: ref, menuRef: listRef, reposition: place });

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  const selectedMembers = members.filter((m) => selected.includes(m.id));

  const list = open && (
    /* TELEFONDA ALTTAN YAPRAK, MASAÜSTÜNDE TETİKLEYİCİYE BAĞLI LİSTE.
       Sıraç (2026-08-30): "Kişilerin açılır kartları istediğim gibi değil,
       daha anlaşılır responsive olsun." Dar ekranda tetikleyicinin altına
       açılan 224px'lik kutu hem küçük kalıyor hem de klavye/adres çubuğu
       aç-kapa oldukça yer değiştiriyordu. Telefonda liste ekranın altına
       tam genişlikte oturur (satırlar parmağa göre), masaüstünde eski
       davranış aynen sürer. */
    <div
      ref={listRef}
      role="listbox"
      aria-multiselectable="true"
      style={pos ? { ["--mm-top" as string]: `${pos.top}px`, ["--mm-left" as string]: `${pos.left}px`, ["--mm-w" as string]: `${pos.width}px`, ["--mm-max" as string]: `${pos.maxHeight}px` } : { opacity: 0 }}
      className={cn(
        "fixed z-[120] overflow-y-auto overscroll-contain border border-line bg-surface shadow-pop",
        // Telefon: alttan yaprak, tam genişlik, güvenli alan payı.
        "anim-slide-up inset-x-0 bottom-0 max-h-[60dvh] rounded-t-modal p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]",
        // sm ve üstü: tetikleyiciye bağlı klasik liste.
        "sm:anim-fade-down sm:inset-x-auto sm:bottom-auto sm:rounded-control sm:p-1",
        "sm:left-[var(--mm-left)] sm:top-[var(--mm-top)] sm:w-[var(--mm-w)] sm:max-h-[var(--mm-max)]",
      )}
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
                "flex w-full items-center gap-2.5 rounded-md px-2 text-left text-[13.5px] transition-colors duration-150",
                // Telefonda satır parmağa göre; masaüstünde kompakt kalır.
                "min-h-11 sm:min-h-0 sm:gap-2 sm:py-1.5 sm:text-[13px]",
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
  ids, memberNames, memberPhotos = {}, personHex = {}, extra = [], className,
}: {
  ids: string[];
  memberNames: Record<string, string>;
  memberPhotos?: Record<string, string | null>;
  personHex?: Record<string, string>;
  extra?: string[];
  className?: string;
}) {
  if (!ids?.length && !extra.length) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      <Users size={11} className="text-ink/50" aria-hidden />
      {/* Kişi = YUVARLAK KART (fotoğraf ya da kendi renginde baş harf),
          düz harf çipi değil (Sıraç, 2026-08-30). */}
      {ids.map((id) => (
        <PersonAvatar
          key={id}
          name={memberNames[id] ?? "—"}
          photoUrl={memberPhotos[id] ?? null}
          colorHex={personHex[id] ?? null}
          size="xs"
          title={memberNames[id] ?? ""}
        />
      ))}
      {extra.map((name) => (
        <span key={name} title={`${name} — sistemde kullanıcı değil`} className="rounded bg-black/5 px-1 text-[12px] font-medium text-ink/60">
          {name}
        </span>
      ))}
    </span>
  );
}
