import { cn } from "@/lib/utils/cn";
import { getPersonInitials } from "@/lib/utils/person-display";
import { PERSON_TONES } from "@/lib/design/person-colors";

// Initials follow the shared person-display rule (first + last word, Turkish-aware).
const getInitials = (name: string): string => getPersonInitials(name);

/* Renk verilmediğinde addan deterministik bir ton türetilir — kişi kimliği
   paletinden (person-colors), rastgele Tailwind renklerinden değil: aynı kişi
   her yerde aynı aileyle görünsün. */
function hexFor(name: string): string {
  let hash = 0;
  for (const c of name) hash = ((hash * 31) + c.charCodeAt(0)) & 0x7fffffff;
  return PERSON_TONES[hash % PERSON_TONES.length]!.hex;
}

// tone controls the badge fill:
//   "color"   → person color (default; used everywhere except task cards)
//   "neutral" → light/neutral chip; a person assigned to an UNFINISHED task must
//               NOT look "done", so card people badges start neutral, not green.
//   "done"    → green; the person completed their part / the task is done.
export type AvatarTone = "color" | "neutral" | "done";

export function Avatar({
  name,
  size = "sm",
  tone = "color",
  title,
  className,
  colorHex,
}: {
  name: string;
  size?: "xs" | "sm" | "md" | "lg";
  tone?: AvatarTone;
  title?: string;
  className?: string;
  /**
   * Kişinin GERÇEK rengi (hex). Verilmezse addan türetilen tona düşülür.
   * Serbest renk seçilebildiği için değer Tailwind sınıfı değil ham hex'tir.
   */
  colorHex?: string;
}) {
  /* Baş harf rozeti küçük bir daire; 16–20px'lik kutuda yazı zorunlu olarak
     küçük. Bu bir metin satırı değil, bir simgedir — tipografi tabanı burada
     uygulanmaz; kişinin adı `title` ile ayrıca verilir. */
  const sizeClass =
    size === "xs" ? "w-4 h-4 text-[8px]"
    : size === "sm" ? "w-5 h-5 text-[9px]"
    : size === "lg" ? "w-14 h-14 text-lg"
    : "w-7 h-7 text-xs";
  const toneClass =
    tone === "neutral"
      ? "bg-surface border border-line-strong text-muted"
      : tone === "done"
        ? "bg-success text-white"
        : "text-white";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold shrink-0 select-none",
        sizeClass,
        toneClass,
        className
      )}
      style={tone === "color" ? { backgroundColor: colorHex ?? hexFor(name) } : undefined}
      title={title ?? name}
    >
      {getInitials(name)}
    </span>
  );
}

export function AvatarGroup({
  names,
  max = 3,
}: {
  names: string[];
  max?: number;
}) {
  const visible = names.slice(0, max);
  const overflow = names.length - max;
  return (
    <div className="flex items-center -space-x-1">
      {visible.map((name, i) => (
        <Avatar key={i} name={name} size="xs" className="ring-1 ring-surface" />
      ))}
      {overflow > 0 && (
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-surface-sunken text-muted text-[8px] font-semibold tabular-nums ring-1 ring-surface">
          +{overflow}
        </span>
      )}
    </div>
  );
}
