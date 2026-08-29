"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Users, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { initialsOf } from "@/lib/planning/initials";

export type Member = { id: string; name: string };

interface Props {
  members: Member[];
  selected: string[];
  onChange: (_ids: string[]) => void;
  placeholder?: string;
  compact?: boolean;
}

const LIST_WIDTH = 224;      // w-56
const LIST_EST_HEIGHT = 240; // max-h-60 — ilk boyama tahmini, ölçülünce düzelir

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
export function MemberMultiSelect({ members, selected, onChange, placeholder = "Kim", compact }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
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
    const below = r.bottom + 4;
    const top = below + height > window.innerHeight - 8
      ? Math.max(8, r.top - height - 4)
      : below;
    setPos((prev) =>
      prev && prev.top === top && prev.left === left && prev.width === width
        ? prev
        : { top, left, width },
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
    // Sabit konumlu liste kaydırmayı takip edemez — sürüklenmektense kapanır.
    const dismiss = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  const selectedMembers = members.filter((m) => selected.includes(m.id));

  const list = open && (
    <div
      ref={listRef}
      role="listbox"
      aria-multiselectable="true"
      style={pos ? { top: pos.top, left: pos.left, width: pos.width } : { opacity: 0 }}
      className="anim-fade-down fixed z-[120] max-h-60 overflow-y-auto rounded-control border border-line bg-surface p-1 shadow-pop"
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
              <span
                className={cn(
                  "inline-flex h-5 w-6 shrink-0 items-center justify-center rounded text-[11.5px] font-semibold transition-colors duration-150",
                  on ? "bg-brand/10 text-brand-strong" : "bg-surface-muted text-muted",
                )}
              >
                {initialsOf(m.name)}
              </span>
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
        <span className="flex min-w-0 flex-wrap items-center gap-1">
          {selectedMembers.length === 0 ? (
            <span className="truncate text-subtle">{placeholder}</span>
          ) : (
            selectedMembers.map((m) => (
              <span key={m.id} title={m.name} className="inline-flex h-5 items-center rounded bg-brand-soft px-1.5 text-[11.5px] font-semibold text-brand-strong">
                {initialsOf(m.name)}
              </span>
            ))
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
