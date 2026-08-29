// Koleksiyon taksonomisi — aslifilinta.com nav yapısıyla birebir.
// Föy'ün category + subcategory alanlarını doldurur; Koleksiyon tarayıcısı,
// editör seçicisi ve maliyet gruplaması TEK kaynaktan bu ağacı kullanır.

import type { ProductionCategory } from "@/types";

export type SubCategory = { key: string; label: string };
export type CategoryNode = {
  /* Kategoriler artık kullanıcı tarafından açılabildiği için anahtar SERBEST
     metindir; kod varsayılanları `ProductionCategory` birliğinden gelir ama
     "bags" gibi sonradan açılanlar da geçerlidir (2026-08-29). */
  key: string;
  label: string;
  subcategories: SubCategory[];
};

/** Web sitesi menü ağacı. Etiketler siteyle aynı (İngilizce) — Aslı'nın kullandığı adlar. */
export const COLLECTION_TAXONOMY: CategoryNode[] = [
  {
    key: "one_of_a_kind",
    label: "One-of-a-Kind",
    subcategories: [
      { key: "clothing", label: "Clothing" },
      { key: "belts", label: "Belts" },
    ],
  },
  {
    key: "ready_to_wear",
    label: "Ready to Wear",
    subcategories: [
      { key: "shirts_tops", label: "Shirts & Tops" },
      { key: "trousers_skirts", label: "Trousers & Skirts" },
      { key: "jackets_vests", label: "Jackets & Vests" },
      { key: "dresses_jumpsuits", label: "Dresses & Jumpsuits" },
      { key: "sweatshirts_tshirts", label: "Sweatshirts & T-shirts" },
      { key: "loungewear", label: "Loungewear" },
    ],
  },
  {
    key: "shoes",
    label: "Shoes",
    subcategories: [],
  },
  {
    key: "accessories",
    label: "Accessories",
    // Sitede alt kategori kırılımı görünmüyordu — Aslı Excel'i gelince eklenebilir.
    subcategories: [],
  },
];

const CATEGORY_BY_KEY = new Map(COLLECTION_TAXONOMY.map((c) => [c.key, c]));

export function categoryLabel(key: string | null | undefined): string {
  if (!key) return "Kategorisiz";
  return CATEGORY_BY_KEY.get(key as ProductionCategory)?.label ?? "Kategorisiz";
}

export function subcategoryLabel(
  category: string | null | undefined,
  sub: string | null | undefined,
): string {
  if (!category || !sub) return "";
  const node = CATEGORY_BY_KEY.get(category as ProductionCategory);
  return node?.subcategories.find((s) => s.key === sub)?.label ?? "";
}

export function subcategoriesOf(category: string | null | undefined): SubCategory[] {
  if (!category) return [];
  return CATEGORY_BY_KEY.get(category as ProductionCategory)?.subcategories ?? [];
}

/** Kategorisiz föyler için sanal düğüm. */
export const UNCATEGORIZED_KEY = "uncategorized";
