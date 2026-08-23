import { totalQuantity } from "@/lib/collection/cost";
import type { ProductionSheet } from "@/types";

/**
 * Föy eksiksizlik denetimi.
 *
 * Aslı Hanım (2026-08-21): "Bir ürünün üretilmesi için üreticiye gidecek olan
 * dosyanın EKSİKSİZ bir şekilde sendeki föye girmesini istiyorum."
 *
 * Ölçüt onun kendi cümlesi: föye bakan üretici başka hiçbir şey sormadan
 * üretebilmeli. Zorunlu alanlar 2026-08-19 toplantısında tek tek sayıldı:
 *   "Kategorisi önemli. Alt kategori doğru. Ürünün tanımı önemli. Üreticisi
 *    önemli. Teslim tarihi ve dikim teslim tarihi… Bir ürünlerin teslim tarihi
 *    bir de dikim teslim tarihi lazım."
 * Teknik çizim de aynı toplantıdan: "Benim yukarıda çizimini görmem lazım."
 */

export type SheetCheck = {
  key: string;
  label: string;
  ok: boolean;
  /** Neden gerekli — kullanıcıya ipucu, Aslı Hanım'ın gerekçesiyle. */
  hint?: string;
};

type CheckableSheet = Pick<
  ProductionSheet,
  "title" | "product_kind" | "description" | "producer" | "category" | "subcategory"
  | "delivery_date" | "sewing_delivery_date" | "size_distribution" | "measurements" | "photo_refs"
> & { manufacturer_id?: string | null };

const filled = (v: string | null | undefined) => !!(v ?? "").trim();

export function checkSheet(s: CheckableSheet): SheetCheck[] {
  const photos = Array.isArray(s.photo_refs) ? s.photo_refs : [];
  const hasDrawing = photos.some(
    (p) =>
      p?.url &&
      (p.section === "technical_drawing_front" ||
        p.section === "technical_drawing_back" ||
        p.section === "technical_drawing"),
  );
  const measured = (s.measurements ?? []).filter((m) => filled(m.label) && filled(m.value)).length;

  return [
    { key: "title", label: "Ürün adı", ok: filled(s.title) },
    {
      key: "category",
      label: "Kategori",
      ok: !!s.category,
      hint: "“Kategorisi önemli, alt kategori doğru.”",
    },
    { key: "subcategory", label: "Alt kategori", ok: filled(s.subcategory) },
    {
      key: "description",
      label: "Ürün tanımı",
      ok: filled(s.description) || filled(s.product_kind),
      hint: "Ürünün ne olduğu — açıklama ya da ürün cinsi.",
    },
    {
      key: "producer",
      label: "Üretici",
      ok: !!s.manufacturer_id || filled(s.producer),
      hint: "Hangi ustada dikilecek.",
    },
    { key: "delivery_date", label: "Teslim tarihi", ok: filled(s.delivery_date) },
    {
      key: "sewing_delivery_date",
      label: "Dikim teslim tarihi",
      ok: filled(s.sewing_delivery_date),
      hint: "Ürün teslim tarihinden AYRI bir tarih.",
    },
    {
      key: "drawing",
      label: "Teknik çizim",
      ok: hasDrawing,
      hint: "“Benim yukarıda çizimini görmem lazım.” Ön ya da arka yeterli.",
    },
    {
      key: "sizes",
      label: "Beden dağılımı",
      ok: totalQuantity(s.size_distribution) > 0,
      hint: "En az bir bedene adet girilmeli.",
    },
    {
      key: "measurements",
      label: "Ölçüler",
      ok: measured >= 3,
      hint: `En az 3 ölçü (şu an ${measured}). Üretici ölçüsüz dikemez.`,
    },
  ];
}

/** Eksik olanlar. Boşsa föy eksiksizdir. */
export function missingOf(s: CheckableSheet): SheetCheck[] {
  return checkSheet(s).filter((c) => !c.ok);
}

export function isComplete(s: CheckableSheet): boolean {
  return missingOf(s).length === 0;
}
