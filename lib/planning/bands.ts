// Aslı Hanım'ın "Toplantı Takvimi" sayfasının sabit iskeleti.
// Excel'de her departman bir RENKLİ ŞERİT ve o şeridin sabit bir saati var;
// şeridin altında gün gün başlık satırı, onun altında "Konu 1..5".
// Bu dosya o iskeletin tek kaynağıdır — ızgara, matris ve şablonlar buradan okur.
import type { PlanningCategory } from "@/types";

export type PlanningBand = {
  slot: string;               // saat bloğu — Excel'de şeridin sol sütunu
  category: PlanningCategory; // renk + varsayılan kategori
  label: string;              // şerit başlığı (Excel'deki büyük harfli ad)
  /** Gün başlıkları: Pzt…Paz (7). Boş dize = o gün o şeritte toplantı yok. */
  columns: string[];
};

/**
 * Haftanın SABİT iskeleti — kaynak: AF_Work "Toplantı Takvimi" sayfası.
 *
 * Aslı Hanım (2026-08-24): "Bu başlıkları ekle ki sadece biz konuları girelim."
 * Başlıklar (Ready to Wear, Accessories, Celebrity…) her hafta AYNI; eskiden
 * her toplantının başlığı elle yazılıyordu ve haftalar birbirini tutmuyordu.
 * Artık başlık koddan gelir, kullanıcı yalnız "Konu 1..5" hücrelerini doldurur.
 *
 * Şerit sırası: ÜRETİM 09:00 → MARKETING 10:00 → SALES 11:00 → SİSTEM/AI 12:00
 */
export const PLANNING_BANDS: PlanningBand[] = [
  {
    slot: "09:00", category: "uretim", label: "ÜRETİM",
    columns: [
      "Ready to Wear", "One of a kind / Upcycle", "Accessories",
      "Satın Alma", "Rapor & Arge", "Calls", "",
    ],
  },
  {
    slot: "10:00", category: "marketing", label: "MARKETING",
    columns: [
      "Celebrity", "Interviews", "AI / Sales & Marketing",
      "Celebrity", "Rapor & Arge", "Outside Meetings", "",
    ],
  },
  {
    slot: "11:00", category: "sales", label: "SALES",
    columns: [
      "AFCOM", "İç piyasa & İhracat", "Bireysel Müşteri",
      "Finance", "Rapor & Arge", "KOOP", "",
    ],
  },
  {
    slot: "12:00", category: "system", label: "SİSTEM / AI",
    columns: [
      "AFCOM", "", "AF Operational System",
      "", "Filinta Methodogy", "", "",
    ],
  },
];

const BAND_BY_SLOT = new Map(PLANNING_BANDS.map((b) => [b.slot, b]));

/** Bir şeridin belirli gününün sabit başlığı. Boşsa o gün toplantı yok. */
export function bandTitle(slot: string, weekday: number): string {
  return BAND_BY_SLOT.get(slot)?.columns[weekday] ?? "";
}

/** Aslı Hanım'ın sınırı: bir toplantıda en çok 5 konu (Konu 1..5). */
export const TOPIC_ROWS = 5;

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
