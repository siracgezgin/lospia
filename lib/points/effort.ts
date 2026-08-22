// Effort → points mapping for the Puan & Motivasyon system.
// Points are intentionally fixed and non-divisible: a "large" task is always
// worth 5 points to EACH responsible person, never split between them.

/**
 * Puan & Motivasyon arayüzünün TEK anahtarı.
 *
 * Özellik kullanıcı geri bildirimiyle gizlendi; veri, tablolar ve sunucu
 * mantığı korunuyor — bu bayrak `true` olunca her yüzey geri gelir.
 *
 * Kapattığı yüzeyler (2026-08-20'de üçü de açıkta kalmıştı):
 *   • Görev detayı → TaskEffortPanel
 *   • Görev oluştur → "Efor" seçicisi
 *   • Raporlar → PointsMotivationSection (zaten `false &&` ile kapalıydı)
 *
 * Panolardaki `{false && …}` blokları da buraya bağlandı ki bir dahaki sefere
 * yüzeylerden biri unutulmasın.
 */
export const POINTS_UI_ENABLED = false;

export type EffortSize = "small" | "medium" | "large";

export const EFFORT_OPTIONS: EffortSize[] = ["small", "medium", "large"];

export const EFFORT_POINTS: Record<EffortSize, number> = {
  small: 1,
  medium: 3,
  large: 5,
};

export const EFFORT_LABELS: Record<EffortSize, string> = {
  small: "Küçük",
  medium: "Orta",
  large: "Büyük",
};

export const DEFAULT_EFFORT: EffortSize = "medium";

export function isEffortSize(v: unknown): v is EffortSize {
  return v === "small" || v === "medium" || v === "large";
}

export function pointsForEffort(effort: EffortSize): number {
  return EFFORT_POINTS[effort] ?? EFFORT_POINTS[DEFAULT_EFFORT];
}

// "Efor: Orta · 3 puan" — the canonical admin-facing label.
export function effortPointsLabel(effort: EffortSize): string {
  return `${EFFORT_LABELS[effort]} · ${pointsForEffort(effort)} puan`;
}
