import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * EmptyState — sakin sıfır-veri yüzeyi.
 *
 * ANA VİZYON: illüstrasyon yok, halka/dekor yok. Kısa başlık + gerekirse tek
 * cümle + gerçekten gerekiyorsa TEK eylem. "Henüz ürün yok." / "İlk ürünü ekle".
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  /** Kart/kolon içi kullanım — daha az dikey boşluk. */
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-6",
        compact ? "py-8" : "py-14",
        className,
      )}
    >
      {Icon && (
        <div className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-surface-sunken text-muted">
          <Icon size={18} strokeWidth={1.75} aria-hidden />
        </div>
      )}
      <p className="text-[14px] font-semibold tracking-tight text-ink">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-[13.5px] leading-relaxed text-muted">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
