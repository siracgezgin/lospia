import { redirect } from "next/navigation";

/**
 * Eski "Görev Takvimi" rotası — artık Calendar'ın "Ay" sekmesi.
 *
 * Aslı Hanım (2026-08-19): "Bence tek takvim yap. Buradan görebilelim."
 * Rota yer imleri ve eski bağlantılar kırılmasın diye duruyor; tek yaptığı
 * birleşik takvime yönlendirmek.
 */
export default function LegacyCalendarRedirect() {
  redirect("/planning?v=ay");
}
