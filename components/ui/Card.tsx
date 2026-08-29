import { cn } from "@/lib/utils/cn";

/**
 * Card — the canonical panel surface: white, hairline border, soft elevation.
 *
 * Kart yalnız gerçek bir NESNE / seçim / bağımsız bilgi grubu için; sayfa
 * bölümleri kart değildir (zemin → yüzey → ince çizgi → içerik). Kart içine
 * kart koyma. `hoverable` tıklanabilir kartta gölge + kenarlık değişimi verir;
 * hareket yok — hover sırasında yer değiştiren yüzey gözü yorar.
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
          "transition-[box-shadow,border-color] duration-150 ease-standard hover:border-line-strong hover:shadow-card-hover",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Kart başlığı satırı — başlık solda, eylem/bağlantı sağda; altında ince çizgi. */
export function CardHeader({
  title,
  aside,
  className,
}: {
  title: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 border-b border-hairline px-4 py-3 sm:px-5", className)}>
      <h2 className="min-w-0 truncate text-[13.5px] font-semibold tracking-tight text-ink">{title}</h2>
      {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
    </div>
  );
}
