import { cn } from "@/lib/utils/cn";

/**
 * Skeleton — soft loading placeholder. Size it with width/height classes:
 *   <Skeleton className="h-4 w-32" />
 * Prefer this over spinners for content that has a known shape.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("block animate-pulse rounded-md bg-surface-sunken", className)}
    />
  );
}
