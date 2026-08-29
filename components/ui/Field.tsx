"use client";

import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * FORM ALANLARI — tek ölçü, tek çerçeve, tek odak halkası.
 *
 * Sıraç (2026-08-29): "İkon renkleri gibisinden düzen, dizayn, uyum, eşitlik…
 * bunlar tasarımcılar için çok önemli."
 *
 * Uygulamada input ve select'ler her ekranda elle yazılıyordu: kimi h-9 kimi
 * h-10, kimi rounded-lg kimi rounded-md. En göze batanı `<select>`ti — hiçbir
 * yerde `appearance-none` yoktu, dolayısıyla macOS kendi ÇİFT OKUNU çiziyordu.
 * Yan yana duran bir input ile bir select aynı satırda farklı yükseklikte ve
 * farklı ok işaretiyle görünüyordu.
 *
 * Ortak yükseklik 36px (h-9) — araç çubuklarındaki düğmelerle aynı.
 */

const CONTROL =
  "h-9 w-full rounded-control border border-line bg-surface px-3 text-[13.5px] text-ink " +
  "transition-[border-color,box-shadow] duration-150 " +
  "placeholder:text-subtle hover:border-line-strong " +
  "focus:border-brand-ring focus:outline-none focus:ring-2 focus:ring-brand-ring/40 " +
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-subtle";

export const TextInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...props }, ref) {
    return <input ref={ref} className={cn(CONTROL, className)} {...props} />;
  },
);

export const TextArea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className, rows = 3, ...props }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(CONTROL, "h-auto resize-y py-2 leading-relaxed", className)} {...props} />;
  },
);

/**
 * Ok GLOBAL kuraldan gelir (app/globals.css → `select:not([multiple])`), bu
 * yüzden burada ayrıca çizilmez: uygulamadaki her açılır liste — bu bileşeni
 * kullanmayanlar da — aynı oku alır.
 */
export const SelectInput = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function SelectInput({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn(CONTROL, "cursor-pointer", className)} {...props}>
        {children}
      </select>
    );
  },
);

/** Etiket + alan + (varsa) yardım satırı. */
export function Field({
  label,
  required,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className="mb-1 block text-[12px] font-medium text-muted">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {/* Alanın kendisi `id` almasa da etiket tıklanınca odaklanması için
          sarmalayıcıya bırakıyoruz; tek çocuklu kullanımda yeterli. */}
      <div id={id}>{children}</div>
      {(hint || error) && (
        <p className={cn("mt-1 text-[11.5px] leading-snug", error ? "text-danger" : "text-subtle")}>{error ?? hint}</p>
      )}
    </div>
  );
}

/** İki sütunlu alan ızgarası — dar ekranda tek sütuna iner. */
export function FieldGrid({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("grid grid-cols-1 gap-x-3 gap-y-3.5 sm:grid-cols-2", className)}>{children}</div>;
}
