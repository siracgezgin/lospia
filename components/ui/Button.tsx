import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Button — the canonical action primitive. The primary variant matches the
 * dominant inline pattern already in the app (rounded-lg bg-brand px-3.5 py-2
 * text-[13px] …), so adopting it view-by-view is a visual no-op. New code
 * should use this instead of hand-rolled button class strings.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md";

const VARIANT: Record<ButtonVariant, string> = {
  primary:     "bg-brand text-white hover:bg-brand-strong",
  secondary:   "bg-surface text-ink border border-line hover:bg-surface-muted hover:border-line-strong",
  ghost:       "text-muted hover:bg-surface-muted hover:text-ink",
  destructive: "bg-danger text-white hover:bg-danger-strong",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[12.5px] gap-1.5",
  md: "h-9 px-3.5 text-[13px] gap-1.5",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: React.ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap select-none",
        "transition-colors disabled:opacity-50 disabled:pointer-events-none",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 size={14} className="animate-spin shrink-0" />}
      {children}
    </button>
  );
}
