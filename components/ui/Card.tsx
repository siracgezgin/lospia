import { cn } from "@/lib/utils/cn";

/**
 * Card — the canonical panel surface: white, hairline border, soft elevation.
 * `hoverable` adds the shadow-card-hover lift for clickable cards.
 */
export function Card({
  hoverable = false,
  className,
  children,
  ...rest
}: React.ComponentProps<"div"> & { hoverable?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-card border border-line bg-surface shadow-card",
        hoverable &&
          "transition-[box-shadow,transform] duration-200 ease-standard hover:shadow-card-hover hover:-translate-y-px",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
