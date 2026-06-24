import { cn } from "@/lib/utils/cn";

/**
 * Wordmark — text-only brand identity. No raster logo, no generated monogram
 * tile; a clean typographic name reads as a deliberate, premium B2B product.
 * In compact (collapsed) mode it falls back to small, subtle initials.
 */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "•";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function Wordmark({
  name = "Operasyon",
  compact = false,
  className,
}: {
  name?: string;
  compact?: boolean;
  className?: string;
}) {
  if (compact) {
    return (
      <span className={cn("text-xs font-semibold tracking-tight text-muted select-none", className)}>
        {initials(name)}
      </span>
    );
  }
  return (
    <span className={cn("truncate text-sm font-semibold tracking-tight text-ink select-none", className)}>
      {name}
    </span>
  );
}
