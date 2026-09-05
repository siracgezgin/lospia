"use client";

import { Children, cloneElement, forwardRef, isValidElement, useId, type ReactElement } from "react";
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
 *
 * Ortak yükseklik 36px (h-9) — araç çubuklarındaki düğmelerle aynı.
 *
 * Hata durumu `aria-invalid` üzerinden gelir: `Field` bir `error` aldığında
 * içindeki tek kontrole `aria-invalid` + `aria-describedby` enjekte eder, kontrol
 * kendi kenarlığını kırmızıya çevirir. Elle `invalid` de verilebilir.
 */

/* DOKUNMATİKTE BİR KADEME İRİ — düğmelerle aynı kural (bkz. ui/Button SIZE).
   İki somut sorun vardı, ikisi de yalnız telefonda:
     • 36px'lik alan parmak hedefi için düşüktü (proje kuralı: ≥40px).
     • iOS Safari, yazı boyu 16px'in ALTINDA olan bir alana odaklanınca sayfayı
       KENDİLİĞİNDEN yakınlaştırır ve geri çıkmaz: kullanıcı her form
       dokunuşunda yamuk, taşan bir sayfada kalıyordu. 16px o davranışı
       tamamen kapatır.
   Kural TELEFONA (max-md) + PARMAĞA (pointer-coarse) bağlıdır: masaüstü ve
   tablet yoğunluğu aynen kalır; iPad Safari zaten odakta yakınlaştırmaz. */
const CONTROL =
  "h-9 max-md:pointer-coarse:h-11 w-full rounded-control border border-line bg-surface px-3 " +
  "text-[13.5px] max-md:pointer-coarse:text-[16px] text-ink " +
  "transition-[border-color,box-shadow,background-color] duration-150 " +
  "placeholder:text-subtle hover:border-line-strong " +
  "focus:border-brand-ring focus:outline-none focus:ring-2 focus:ring-brand-ring/40 " +
  "aria-invalid:border-danger aria-invalid:focus:border-danger aria-invalid:focus:ring-danger/25 " +
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-subtle disabled:hover:border-line";

type Invalid = { invalid?: boolean };

export const TextInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & Invalid>(
  function TextInput({ className, invalid, ...props }, ref) {
    return <input ref={ref} aria-invalid={invalid || props["aria-invalid"] || undefined} className={cn(CONTROL, className)} {...props} />;
  },
);

export const TextArea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & Invalid>(
  function TextArea({ className, rows = 3, invalid, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        aria-invalid={invalid || props["aria-invalid"] || undefined}
        /* max-md:pointer-coarse:h-auto ŞART: CONTROL telefonda h-11 veriyor ve
           `h-auto` başka bir varyant grubunda olduğu için onu ezmiyordu —
           çok satırlı alan telefonda tek satıra kilitleniyordu. */
        className={cn(CONTROL, "h-auto max-md:pointer-coarse:h-auto resize-y py-2 leading-relaxed", className)}
        {...props}
      />
    );
  },
);

/**
 * Ok GLOBAL kuraldan gelir (app/globals.css → `select:not([multiple])`), bu
 * yüzden burada ayrıca çizilmez: uygulamadaki her açılır liste — bu bileşeni
 * kullanmayanlar da — aynı oku alır.
 */
export const SelectInput = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & Invalid>(
  function SelectInput({ className, children, invalid, ...props }, ref) {
    return (
      <select
        ref={ref}
        aria-invalid={invalid || props["aria-invalid"] || undefined}
        /* pr-8 ŞART. Ok, globals.css base katmanında çiziliyor ve orada
           `padding-right: 1.9rem` ile kendine yer ayırıyor — ama `px-3`
           bir UTILITY sınıfı ve utilities katmanı base'i EZER. Sonuç: alan
           yalnız 0.75rem sağ boşluk bırakıyor, ok metnin üstüne biniyor ve
           kutu içeriğine göre daralınca son harf okunmuyordu (canlı taramada
           "Tüm durumlar" okun altında kalıyordu). Sağ dolgu burada, sınıf
           düzeyinde verilir; her açılır liste aynı payı alır. */
        className={cn(CONTROL, "cursor-pointer pr-8", className)}
        {...props}
      >
        {children}
      </select>
    );
  },
);

/**
 * Etiket + alan + (varsa) yardım ya da hata satırı.
 *
 * Etiket her zaman GÖRÜNÜR — placeholder etiket yerine geçmez. Tek çocuklu
 * kullanımda `id`, `aria-describedby` ve `aria-invalid` kontrole kendiliğinden
 * enjekte edilir; birden çok kontrol varsa `htmlFor` ile hedefi elle ver.
 */
export function Field({
  label,
  required,
  hint,
  helper,
  error,
  htmlFor,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  /** Alanın altındaki tek satırlık yardım. */
  hint?: string;
  /** @deprecated `hint` ile aynı — eski çağrı yerleri için. */
  helper?: string;
  error?: string | null;
  /** Kontrolün id'si; verilmezse tek çocuğa otomatik atanır. */
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const autoId = useId();
  const id = htmlFor ?? autoId;
  const descId = `${id}-desc`;
  const help = error ?? hint ?? helper ?? null;

  let content = children;
  if (!htmlFor && Children.count(children) === 1 && isValidElement(children)) {
    const el = children as ReactElement<Record<string, unknown>>;
    content = cloneElement(el, {
      id: (el.props.id as string | undefined) ?? id,
      "aria-describedby": help ? descId : el.props["aria-describedby"],
      "aria-invalid": error ? true : el.props["aria-invalid"],
    });
  }

  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className="mb-1 block text-[12.5px] font-medium text-muted">
        {label}
        {required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
      </label>
      {content}
      {help && (
        <p
          id={descId}
          role={error ? "alert" : undefined}
          className={cn("mt-1 text-[12px] leading-snug", error ? "text-danger" : "text-subtle")}
        >
          {help}
        </p>
      )}
    </div>
  );
}

/** İki sütunlu alan ızgarası — dar ekranda tek sütuna iner. Yalnız yan yana
 *  durması ANLAMLI alanlar için (başlangıç · bitiş, adet · birim). */
export function FieldGrid({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("grid grid-cols-1 gap-x-3 gap-y-3.5 sm:grid-cols-2", className)}>{children}</div>;
}
