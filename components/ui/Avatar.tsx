import { cn } from "@/lib/utils/cn";

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

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0] ?? "")
    .join("")
    .toUpperCase();
}

function colorFor(name: string): string {
  let hash = 0;
  for (const c of name) hash = ((hash * 31) + c.charCodeAt(0)) & 0x7fffffff;
  return COLORS[hash % COLORS.length]!;
}

export function Avatar({
  name,
  size = "sm",
  className,
}: {
  name: string;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const sizeClass = size === "xs" ? "w-4 h-4 text-[8px]" : size === "sm" ? "w-5 h-5 text-[9px]" : "w-7 h-7 text-xs";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full text-white font-semibold shrink-0 select-none",
        sizeClass,
        colorFor(name),
        className
      )}
      title={name}
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
        <Avatar key={i} name={name} size="xs" className="ring-1 ring-white" />
      ))}
      {overflow > 0 && (
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-600 text-[8px] font-semibold ring-1 ring-white">
          +{overflow}
        </span>
      )}
    </div>
  );
}
