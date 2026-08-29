import { cn } from "@/lib/utils/cn";

/**
 * Badge — the canonical small label primitive. One component, consistent
 * sizing/typography everywhere (board chips, status pills, role tags).
 *
 * Boy: `sm` 12px (varsayılan), `xs` 11.5px yalnız sıkışık kart köşeleri için.
 * Rozet metadata'dır; 12px'in altına düşmez (ANA VİZYON tipografi kuralı).
 * Bir kartta EN FAZLA bir rozet (sadelik kuralı).
 */
export function Badge({
  children,
  className,
  size = "sm",
  dot,
}: {
  children: React.ReactNode;
  className?: string;
  size?: "xs" | "sm";
  dot?: string; // optional leading dot color class (e.g. "bg-success")
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md font-medium leading-none whitespace-nowrap tabular-nums",
        size === "xs" ? "h-[20px] px-1.5 text-[12px]" : "h-[22px] px-2 text-[12px]",
        className,
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dot)} aria-hidden />}
      {children}
    </span>
  );
}

/** A bare colored dot — for status/category identity without a full chip. */
export function Dot({ className }: { className?: string }) {
  return <span className={cn("inline-block h-2 w-2 rounded-full shrink-0", className)} aria-hidden />;
}
