import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Button — the canonical action primitive.
 *
 * Hiyerarşi dört adımdır ve bir ekranda TEK dominant primary olmalı:
 *   primary → ekranın ana eylemi (Kaydet, Yeni ürün)
 *   secondary → çerçeveli, yanındaki ikincil eylem (Vazgeç, Dışa aktar)
 *   ghost → satır içi / araç çubuğu eylemi, dinlenirken görünmez
 *   destructive → yalnız geri alınamaz işler; asla primary gibi durmaz
 *
 * Durumlar (ANA VİZYON): disabled yalnız "soluklaştırılmış" değil, okunur
 * bir nötr dolgu; loading yerleşimi kaydırmaz (spinner metnin yanına girer,
 * genişlik sabit kalmasın diye min-width yok — metin zaten yerinde).
 * Focus halkası globals.css'teki tek kuraldan gelir.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md";

const VARIANT: Record<ButtonVariant, string> = {
  primary:     "bg-brand text-white shadow-xs hover:bg-brand-strong",
  secondary:   "bg-surface text-ink border border-line shadow-xs hover:bg-surface-muted hover:border-line-strong",
  ghost:       "text-muted hover:bg-surface-muted hover:text-ink",
  destructive: "bg-danger text-white shadow-xs hover:bg-danger-strong",
};

/* Metin ≥13px: birincil arayüz metni 13.5px altına düşmez; `sm` kompakt araç
   çubuğu ölçüsüdür ve 13px'te kalır. */
const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-9 px-3.5 text-[13.5px] gap-1.5",
};

/* Devre dışı: okunur nötr — opacity değil renk. Yükleme sırasında UYGULANMAZ,
   düğme kendi rengini korur ki "bekliyor" ile "kapalı" karışmasın. */
const DISABLED =
  "disabled:bg-surface-sunken disabled:text-subtle disabled:border-line disabled:shadow-none disabled:pointer-events-none";

export const Button = forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
  }
>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    disabled,
    className,
    children,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-control font-medium whitespace-nowrap select-none",
        "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-standard",
        "active:scale-[0.98]",
        loading ? "pointer-events-none" : DISABLED,
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 size={14} className="animate-spin shrink-0" aria-hidden />}
      {children}
    </button>
  );
});

/**
 * IconButton — yalnız ikon taşıyan kare düğme. `aria-label` ZORUNLU: ikonun
 * anlamı evrensel olsa bile ekran okuyucu bir ad ister. Boy düğmelerle aynı
 * (h-9 / h-8) ki araç çubuğunda yan yana hizalansın; telefonda `tap-target`
 * görünmez alanı 40px'e büyütür.
 */
export const IconButton = forwardRef<
  HTMLButtonElement,
  Omit<React.ComponentProps<"button">, "children" | "aria-label"> & {
    "aria-label": string;
    variant?: Exclude<ButtonVariant, "primary" | "destructive"> | "primary" | "destructive";
    size?: ButtonSize;
    children: React.ReactNode;
  }
>(function IconButton({ variant = "ghost", size = "md", className, children, type = "button", ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "tap-target inline-flex shrink-0 items-center justify-center rounded-control select-none",
        "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-standard active:scale-[0.96]",
        DISABLED,
        VARIANT[variant],
        size === "sm" ? "size-8" : "size-9",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
