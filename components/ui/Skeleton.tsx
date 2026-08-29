import { cn } from "@/lib/utils/cn";

/**
 * Skeleton — soft loading placeholder. Size it with width/height classes:
 *   <Skeleton className="h-4 w-32" />
 *
 * Yalnız gerçek düzeni temsil eden iskeletlerde kullanılır. Hareket sakin bir
 * nabızdır (opaklık); parlayan gradient şeridi "yükleniyor"dan çok "bozuk"
 * okunuyordu ve her satırda tekrarlanınca gözü yoruyordu. prefers-reduced-motion
 * globalde animasyonu durdurur.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("block animate-pulse rounded-md bg-surface-sunken", className)}
    />
  );
}
