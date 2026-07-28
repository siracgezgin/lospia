"use client";

import { useEffect, useRef, useState } from "react";
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

/** Sistemdeki üyelerden çoklu seçim; buton seçili baş harfleri gösterir. */
export function MemberMultiSelect({ members, selected, onChange, placeholder = "Kim", compact }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  const selectedMembers = members.filter((m) => selected.includes(m.id));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between gap-1 rounded-lg border bg-surface text-[13px] text-ink transition-[border-color,box-shadow] duration-150 focus:outline-none focus:ring-2 focus:ring-brand-ring focus:border-brand-ring",
          open ? "border-brand-ring" : "border-line hover:border-line-strong",
          compact ? "px-2 py-1" : "px-2.5 py-1.5",
        )}
      >
        <span className="flex min-w-0 flex-wrap items-center gap-1">
          {selectedMembers.length === 0 ? (
            <span className="text-subtle">{placeholder}</span>
          ) : (
            selectedMembers.map((m) => (
              <span key={m.id} title={m.name} className="inline-flex h-5 items-center rounded bg-brand-soft px-1.5 text-[11px] font-semibold text-brand-strong">
                {initialsOf(m.name)}
              </span>
            ))
          )}
        </span>
        <ChevronDown size={13} className={cn("shrink-0 text-subtle transition-transform duration-200 ease-standard", open && "rotate-180")} />
      </button>

      {open && (
        <div role="listbox" aria-multiselectable="true" className="anim-fade-down absolute z-50 mt-1 max-h-60 w-56 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-pop">
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
                      "inline-flex h-5 w-6 shrink-0 items-center justify-center rounded text-[11px] font-semibold transition-colors duration-150",
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
      )}
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
      <Users size={9} className="text-ink/50" />
      {ids.map((id) => (
        <span key={id} title={memberNames[id] ?? ""} className="rounded bg-black/5 px-1 text-[10px] font-semibold text-ink/70">
          {initialsOf(memberNames[id])}
        </span>
      ))}
      {extra.map((name) => (
        <span key={name} title={`${name} — sistemde kullanıcı değil`} className="rounded bg-black/5 px-1 text-[10px] font-medium text-ink/55">
          {name}
        </span>
      ))}
    </span>
  );
}
