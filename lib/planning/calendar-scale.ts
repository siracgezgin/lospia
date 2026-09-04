/**
 * Tek takvimin üç ölçeği — sunucu ve istemcinin PAYLAŞTIĞI sözlük.
 *
 * Ayrı dosyada duruyor çünkü `?v=` çözümlemesini sayfanın sunucu bileşeni
 * yapıyor; "use client" modülünden düz fonksiyon çağrılamaz.
 */
export type CalendarScale = "gun" | "hafta" | "ay" | "yil";

export function asCalendarScale(v: string | undefined): CalendarScale {
  return v === "gun" || v === "ay" || v === "yil" ? v : "hafta";
}
