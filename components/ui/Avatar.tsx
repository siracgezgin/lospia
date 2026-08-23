import { cn } from "@/lib/utils/cn";
import { getPersonInitials } from "@/lib/utils/person-display";

const COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-purple-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-rose-500",
];

// Initials follow the shared person-display rule (first + last word, Turkish-aware).
const getInitials = (name: string): string => getPersonInitials(name);

function colorFor(name: string): string {
  let hash = 0;
  for (const c of name) hash = ((hash * 31) + c.charCodeAt(0)) & 0x7fffffff;
  return COLORS[hash % COLORS.length]!;
}

// tone controls the badge fill:
//   "color"   → hashed brand color (default; used everywhere except task cards)
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
  colorClass,
}: {
  name: string;
  size?: "xs" | "sm" | "md" | "lg";
  tone?: AvatarTone;
  title?: string;
  className?: string;
  /**
   * Kişinin GERÇEK rengi (lib/design/person-colors.ts `solid`).
   *
   * Verilmezse addan türetilen yedek palete düşülür. Bu bileşen kişi kimliği
   * sisteminden habersiz doğdu ve kendi paletini kullanıyordu; aynı kişi
   * Ayarlar'da mor, panoda turkuaz görünüyordu. Rengi bilen çağıran buradan
   * geçirir — kimlik tek kaynaktan okunur.
   */
  colorClass?: string;
}) {
  const sizeClass =
    size === "xs" ? "w-4 h-4 text-[8px]"
    : size === "sm" ? "w-5 h-5 text-[9px]"
    : size === "lg" ? "w-14 h-14 text-lg"
    : "w-7 h-7 text-xs";
  const toneClass =
    tone === "neutral"
      ? "bg-surface border border-line-strong text-muted"
      : tone === "done"
        ? "bg-green-500 border border-green-600 text-white"
        : cn("text-white", colorClass || colorFor(name));
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold shrink-0 select-none",
        sizeClass,
        toneClass,
        className
      )}
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
