/**
 * Sezon bağlamı — sunucu ve istemcinin PAYLAŞTIĞI sözlük.
 *
 * Ayrı dosyada duruyor çünkü `?sezon=` çözümlemesini sayfaların sunucu
 * bileşenleri yapıyor; "use client" modülünden düz fonksiyon çağrılamaz
 * (build geçer, runtime 500 verir — 2026-08-20'de calendar-scale ile aynı ders).
 */

/** URL'deki "tüm sezonlar" değeri. */
export const ALL_SEASONS = "hepsi";

/**
 * `?sezon=` → süzülecek sezon id'si. null = süzme yok.
 *
 * Parametre yoksa AKTİF sezon döner: Zedonk'taki gibi sistem hep bir sezonun
 * içinde açılır, "hepsi" bilinçli bir seçimdir.
 */
export function resolveSeasonId(
  raw: string | undefined,
  seasons: { id: string; is_current: boolean }[],
): string | null {
  if (raw === ALL_SEASONS) return null;
  if (raw && seasons.some((s) => s.id === raw)) return raw;
  return seasons.find((s) => s.is_current)?.id ?? null;
}
