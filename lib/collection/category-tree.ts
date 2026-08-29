import type { SupabaseClient } from "@supabase/supabase-js";
import { COLLECTION_TAXONOMY, findSub, type CategoryNode } from "./taxonomy";

/**
 * KATEGORİ AĞACININ TEK OKUMA KAPISI.
 *
 * Kategoriler artık düzenlenebilir (workspace_product_categories). Ama tablo
 * BOŞSA — yeni kurulan bir çalışma alanı, ya da migration henüz uygulanmamış
 * bir veritabanı — kod varsayılanları geçerlidir. Böylece Koleksiyon hiçbir
 * durumda boş ekranla açılmaz.
 *
 * Etiketler değişebilir, ANAHTARLAR değişmez: föy `category`/`subcategory`
 * alanlarında bu anahtarı taşır.
 */

export type CategoryRow = {
  key: string;
  label: string;
  parent_key: string | null;
  position: number;
  color_hex: string | null;
};

/**
 * Düz satırları ağaca çevirir — ÜÇ kademeye kadar (Accessories › Hats ›
 * Bucket Hat). Şema `parent_key` ile keyfi derinliğe izin veriyordu ama
 * kurucu yalnız iki kademe okuyordu: üçüncü seviye satırlar veritabanında
 * durup ekranda hiç görünmüyordu (Sıraç, 2026-08-30 koleksiyon yapısı).
 */
export function buildCategoryTree(rows: CategoryRow[]): CategoryNode[] {
  const byOrder = (a: CategoryRow, b: CategoryRow) =>
    a.position - b.position || a.label.localeCompare(b.label, "tr");

  const childrenOf = (parent: string): CategoryNode["subcategories"] =>
    rows
      .filter((r) => r.parent_key === parent)
      .sort(byOrder)
      .map((s) => {
        const kids = childrenOf(s.key);
        return kids.length ? { key: s.key, label: s.label, children: kids } : { key: s.key, label: s.label };
      });

  return rows
    .filter((r) => !r.parent_key)
    .sort(byOrder)
    .map((t) => ({ key: t.key, label: t.label, subcategories: childrenOf(t.key) }));
}

/**
 * Çalışma alanının kategori ağacı. Tablo yoksa/boşsa kod varsayılanları döner —
 * çağıran yerin ayrıca hata ele alması gerekmez.
 */
export async function getCategoryTree(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<CategoryNode[]> {
  const { data, error } = await supabase
    .from("workspace_product_categories")
    .select("key, label, parent_key, position, color_hex")
    .eq("workspace_id", workspaceId)
    .order("position", { ascending: true });

  if (error || !data || data.length === 0) return COLLECTION_TAXONOMY;
  return buildCategoryTree(data as CategoryRow[]);
}

/** Ağaçtan etiket — bulunamazsa anahtarın kendisi değil, "Kategorisiz". */
export function labelOf(tree: CategoryNode[], key: string | null | undefined): string {
  if (!key) return "Kategorisiz";
  return tree.find((c) => c.key === key)?.label ?? "Kategorisiz";
}

/** Alt kategori etiketi. */
export function subLabelOf(
  tree: CategoryNode[],
  category: string | null | undefined,
  sub: string | null | undefined,
): string {
  if (!category || !sub) return "";
  // ÜÇ kademe: alt kategori ikinci ya da üçüncü seviyede olabilir.
  const node = tree.find((c) => c.key === category);
  return node ? (findSub(node.subcategories, sub)?.label ?? "") : "";
}

/** Bir kategorinin alt kategorileri. */
export function subsOf(tree: CategoryNode[], key: string | null | undefined) {
  if (!key) return [];
  return tree.find((c) => c.key === key)?.subcategories ?? [];
}
