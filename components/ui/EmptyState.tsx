import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * EmptyState — calm zero-data placeholder: muted icon in a soft well, short
 * title, optional description and action slot (e.g. a <Button>).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center px-6 py-12", className)}>
      {Icon && (
        <div className="grid h-11 w-11 place-items-center rounded-full bg-surface-sunken text-subtle mb-3">
          <Icon size={20} strokeWidth={1.75} />
        </div>
      )}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
