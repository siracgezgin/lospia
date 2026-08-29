/**
 * INFLUENCER SEEDING — ürün gönderiminin yedi adımı.
 *
 * Aslı Hanım (2026-08-28) süreci tek tek sayarak tarif etti: ilk iletişim →
 * styling → yazılı iletişim → kargo → teslim → paylaşım → rapor. Bugüne kadar
 * bu sıra yalnız insanların aklındaydı; "Kargo gitti mi, mail atıldı mı"
 * sorusu kimseye sormadan cevaplanamıyordu.
 *
 * Tek kaynak: CRM listesi ve kişi formu buradan okur.
 *
 * `note` yalnız O ADIMDA YAPILACAK İŞİ söyler — yorum, ilke ya da çalışma
 * felsefesi değil (2026-08-29).
 */

export type SeedingStage =
  | "iletisim" | "styling" | "yazili" | "kargo" | "teslim" | "paylasim" | "rapor";

export type SeedingStep = {
  key: SeedingStage;
  /** Sıra numarası — ekranda "3/7" gibi gösterilir. */
  order: number;
  label: string;
  /** O adımda yapılacak iş — tek cümle. */
  note: string;
};

export const SEEDING_STEPS: SeedingStep[] = [
  { key: "iletisim", order: 1, label: "İlk iletişim", note: "İletişim kaydı açıldı." },
  { key: "styling", order: 2, label: "Styling", note: "Kişiye özel kombin seçilir." },
  { key: "yazili", order: 3, label: "Yazılı iletişim", note: "Seçilen ürünlerle birlikte mail gönderilir." },
  { key: "kargo", order: 4, label: "Kargo", note: "Ürünlerin üretim bilgisi yazılı olarak kutuya konur." },
  { key: "teslim", order: 5, label: "Teslim", note: "Ulaştığı doğrulanır." },
  { key: "paylasim", order: 6, label: "Paylaşım", note: "Paylaşımın ekran görüntüsü dosyalanır." },
  { key: "rapor", order: 7, label: "Rapor", note: "Satışa etkisi ve devam kararı." },
];

const BY_KEY = new Map(SEEDING_STEPS.map((s) => [s.key, s]));

export function seedingStep(key: string | null | undefined): SeedingStep | null {
  return key ? BY_KEY.get(key as SeedingStage) ?? null : null;
}

export const SEEDING_TOTAL = SEEDING_STEPS.length;

/** Sıradaki adım — "Kargo"daysa "Teslim". Son adımda null. */
export function nextSeedingStep(key: string | null | undefined): SeedingStep | null {
  const cur = seedingStep(key);
  if (!cur) return SEEDING_STEPS[0];
  return SEEDING_STEPS.find((s) => s.order === cur.order + 1) ?? null;
}
