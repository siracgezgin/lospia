// Koleksiyon taksonomisi — aslifilinta.com nav yapısıyla birebir.
// Föy'ün category + subcategory alanlarını doldurur; Koleksiyon tarayıcısı,
// editör seçicisi ve maliyet gruplaması TEK kaynaktan bu ağacı kullanır.

import type { ProductionCategory } from "@/types";

/** Alt kategori. `children` doluysa bir kademe daha iner (Hats → Bucket Hat).
 *  Ağaç ÜÇ seviyeye kadar okunur; föy yine iki alan taşır (bkz. dosya notu). */
export type SubCategory = { key: string; label: string; children?: SubCategory[] };
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
      { key: "headpiece", label: "Headpiece" },
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
    subcategories: [
      {
        key: "hats",
        label: "Hats",
        children: [
          { key: "bucket_hat", label: "Bucket Hat" },
          { key: "eight_cornered_cap", label: "Eight-Cornered Cap" },
        ],
      },
      { key: "bags", label: "Bags" },
      {
        key: "wraps",
        label: "Wraps",
        children: [
          { key: "ehrams", label: "Ehrams" },
          { key: "peshtemal", label: "Peshtemal" },
        ],
      },
    ],
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
  return node ? (findSub(node.subcategories, sub)?.label ?? "") : "";
}

/** Alt ağaçta anahtarı arar — ikinci ve ÜÇÜNCÜ seviyeyi birlikte tarar. */
export function findSub(list: SubCategory[], key: string): SubCategory | null {
  for (const s of list) {
    if (s.key === key) return s;
    const hit = s.children ? findSub(s.children, key) : null;
    if (hit) return hit;
  }
  return null;
}

/** Bir alt kategorinin köke kadar olan yolu ("Accessories › Hats › Bucket Hat"). */
export function subPath(list: SubCategory[], key: string): SubCategory[] {
  for (const s of list) {
    if (s.key === key) return [s];
    if (s.children) {
      const deeper = subPath(s.children, key);
      if (deeper.length) return [s, ...deeper];
    }
  }
  return [];
}

/** Seçilebilir TÜM alt kategoriler, derinlik bilgisiyle (seçici listeleri için). */
export function flattenSubs(list: SubCategory[], depth = 0): { node: SubCategory; depth: number }[] {
  return list.flatMap((s) => [
    { node: s, depth },
    ...(s.children ? flattenSubs(s.children, depth + 1) : []),
  ]);
}

export function subcategoriesOf(category: string | null | undefined): SubCategory[] {
  if (!category) return [];
  return CATEGORY_BY_KEY.get(category as ProductionCategory)?.subcategories ?? [];
}

/** Kategorisiz föyler için sanal düğüm. */
export const UNCATEGORIZED_KEY = "uncategorized";
