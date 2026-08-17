// Aslı Hanım'ın "Toplantı Takvimi" sayfasının sabit iskeleti.
// Excel'de her departman bir RENKLİ ŞERİT ve o şeridin sabit bir saati var;
// şeridin altında gün gün başlık satırı, onun altında "Konu 1..5".
// Bu dosya o iskeletin tek kaynağıdır — ızgara, matris ve şablonlar buradan okur.
import type { PlanningCategory } from "@/types";

export type PlanningBand = {
  slot: string;               // saat bloğu — Excel'de şeridin sol sütunu
  category: PlanningCategory; // renk + varsayılan kategori
  label: string;              // şerit başlığı (Excel'deki büyük harfli ad)
};

/** Excel'deki şerit sırası: ÜRETİM 09:00 → MARKETING 10:00 → SALES 11:00 → SİSTEM/AI 12:00 */
export const PLANNING_BANDS: PlanningBand[] = [
  { slot: "09:00", category: "uretim",    label: "ÜRETİM" },
  { slot: "10:00", category: "marketing", label: "MARKETING" },
  { slot: "11:00", category: "sales",     label: "SALES" },
  { slot: "12:00", category: "system",    label: "SİSTEM / AI" },
];

/** Aslı Hanım'ın sınırı: bir toplantıda en çok 5 konu (Konu 1..5). */
export const TOPIC_ROWS = 5;

const BAND_BY_SLOT = new Map(PLANNING_BANDS.map((b) => [b.slot, b]));

export function bandOfSlot(slot: string): PlanningBand | undefined {
  return BAND_BY_SLOT.get(slot);
}

/** Takvimin altındaki "Tarih/Saat × departman" matrisinin sütunları.
 *  Sıra Excel'deki soldan sağa; "AI" sütunu kaynakta başlıksızdır (yalnız Kim
 *  hücresi doludur) — burada adlandırıldı. */
export const MATRIX_COLUMNS: { category: PlanningCategory; label: string }[] = [
  { category: "uretim",    label: "Üretim" },
  { category: "system",    label: "Sistem" },
  { category: "sales",     label: "Sales" },
  { category: "marketing", label: "Marketing" },
  { category: "ai",        label: "AI" },
  { category: "tasarim",   label: "Tasarım" },
];

/** Matris satırları: Excel'de yalnız Pazartesi–Cuma 09:00 var. */
export const MATRIX_WEEKDAYS = [0, 1, 2, 3, 4];

export const WEEKDAY_SHORT_EN = ["Mon", "Tue", "Wed", "Thur", "Fri", "Sat", "Sun"];
export const WEEKDAY_LONG_TR = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
/** Kısaltmalar elle yazılır: ilk üç harf Pazartesi ve Pazar'ı ikisini de
 *  "Paz" yapıyor — dar ekranda gün seçici okunamaz hâle geliyordu. */
export const WEEKDAY_SHORT_TR = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
