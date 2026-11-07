/**
 * UPCYCLE — geri alınan modülün (d3b75d2 → 5be6e02) tanımları; yalnız
 * scripts/upcycle-arsiv/export.ts kullanır.
 *
 * Kaynak: "upcycle yapılacaklar listesi.xlsx" (Gül Hanım, 04.11.2026).
 */
type Photo = { path: string; url: string };
export type UpcycleSection = "urun" | "malzeme";
export type UpcycleSize = "XS" | "S" | "M" | "L" | "XL" | "ONE";
export type UpcycleItem = {
  id: string; workspace_id: string; section: UpcycleSection; position: number;
  status_note: string; owners: string; name: string; color: string; code: string;
  material_type: string; description: string; sizes: Partial<Record<UpcycleSize, number>>;
  market212: number | null; retail_price: number | null; quantity: number | null;
  before_photos: Photo[]; after_photos: Photo[];
  created_by: string | null; updated_by: string | null; created_at: string; updated_at: string;
};

/** Excel'deki beden sütunları — aynı sıra, aynı yazım. */
export const SIZES: { key: UpcycleSize; label: string }[] = [
  { key: "XS", label: "XS" },
  { key: "S", label: "S" },
  { key: "M", label: "M" },
  { key: "L", label: "L" },
  { key: "XL", label: "XL" },
  { key: "ONE", label: "One Size" },
];

export const SECTIONS: { key: UpcycleSection; label: string }[] = [
  { key: "urun", label: "Ürünler" },
  { key: "malzeme", label: "Malzeme listesi" },
];

export const parseSection = (raw: string | undefined | null): UpcycleSection =>
  raw === "malzeme" ? "malzeme" : "urun";

/** "AFR Toplam Adet" — Excel'de =SUM(I:N); burada da hep hesaplanır. */
export const sizeTotal = (sizes: UpcycleItem["sizes"]): number =>
  SIZES.reduce((sum, s) => sum + (Number(sizes?.[s.key]) || 0), 0);

export const UPCYCLE_BUCKET = "production-sheets";
export const upcyclePrefix = (workspaceId: string) => `${workspaceId}/upcycle/`;

export const UPCYCLE_COLUMNS =
  "id, workspace_id, section, position, status_note, owners, name, color, code, material_type, description, " +
  "sizes, market212, retail_price, quantity, before_photos, after_photos, created_by, updated_by, created_at, updated_at";
