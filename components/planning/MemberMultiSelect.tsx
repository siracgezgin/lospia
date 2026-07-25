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
        className={cn(
          "flex w-full items-center justify-between gap-1 rounded-md border border-line bg-surface text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-brand-ring",
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
        <ChevronDown size={13} className="shrink-0 text-subtle" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 max-h-60 w-56 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-drawer">
          {members.length === 0 ? (
            <p className="px-2 py-1.5 text-[12px] text-subtle">Üye bulunamadı.</p>
          ) : (
            members.map((m) => {
              const on = selected.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggle(m.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
                    on ? "bg-brand-soft text-brand-strong" : "text-ink hover:bg-surface-muted",
                  )}
                >
                  <span className="inline-flex h-5 w-6 shrink-0 items-center justify-center rounded bg-surface-muted text-[10.5px] font-semibold text-muted">
                    {initialsOf(m.name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  {on && <Check size={14} className="shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/** Salt-görüntü: id listesini baş-harf rozetleri olarak gösterir. */
export function MemberInitials({
  ids, memberNames, className,
}: { ids: string[]; memberNames: Record<string, string>; className?: string }) {
  if (!ids?.length) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      <Users size={9} className="text-ink/50" />
      {ids.map((id) => (
        <span key={id} title={memberNames[id] ?? ""} className="rounded bg-black/5 px-1 text-[10px] font-semibold text-ink/70">
          {initialsOf(memberNames[id])}
        </span>
      ))}
    </span>
  );
}
