import { redirect } from "next/navigation";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { ProductionSheetEditor } from "@/components/production/ProductionSheetEditor";
import { getCategoryTree } from "@/lib/collection/category-tree";
import type { ProductionSheet, Manufacturer, SheetMaterialWithMaterial } from "@/types";
import type { PickableMaterial } from "@/components/production/SheetBom";

export const dynamic = "force-dynamic";

export default async function ProductionSheetPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  /* Yeni föy KATEGORİSİYLE açılır: Koleksiyon'da bir kategorinin içindeyken
     "Yeni föy"e basınca o kategori taşınır (2026-08-29). */
  searchParams: Promise<{ kategori?: string; alt?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirect("/login");
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;

  // Üye adları — oluşturan/son giren rozetleri için.
  const membersResult = await supabase
    .from("workspace_members")
    .select("user_id, profiles(id, full_name, email)")
    .eq("workspace_id", workspaceId);
  const memberNames: Record<string, string> = {};
  for (const m of membersResult.data ?? []) {
    const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as
      | { id: string; full_name: string | null; email: string | null }
      | null;
    if (p) memberNames[m.user_id as string] = p.full_name || p.email || "—";
  }

  // Üretici (usta) listesi — föydeki "Üretici" alanı artık seçim.
  // Tablo henüz migrate edilmediyse boş liste döner ve alan serbest metne
  // düşer; föy açılmaya devam eder.
  const manufacturersResult = await supabase
    .from("workspace_manufacturers")
    // email: föyü ustaya maille göndermek için (2026-08-28).
    .select("id, name, is_active, lead_time_days, min_order_qty, currency, city, email")
    .eq("workspace_id", workspaceId)
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });
  const manufacturers = (manufacturersResult.data ?? []) as Pick<
    Manufacturer,
    "id" | "name" | "is_active" | "lead_time_days" | "min_order_qty" | "currency" | "city" | "email"
  >[];

  // Sezon listesi — föydeki "Sezon" alanı da artık seçim.
  const seasonsResult = await supabase
    .from("workspace_seasons")
    .select("id, name, is_current")
    .eq("workspace_id", workspaceId)
    .order("is_current", { ascending: false })
    .order("name", { ascending: false });
  const seasons = (seasonsResult.data ?? []) as { id: string; name: string; is_current: boolean }[];

  /* Kategori ağacı — Koleksiyon'daki listeyle AYNI olsun diye aynı kapıdan
     okunur; tablo boşsa kod varsayılanlarına düşer. */
  const categories = await getCategoryTree(supabase, workspaceId);

  // Hammadde kütüphanesi — reçeteye eklenebilecekler.
  const materialsResult = await supabase
    .from("workspace_materials")
    .select("id, name, code, category, unit, unit_price, currency")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .order("category")
    .order("name");
  const materials = (materialsResult.data ?? []) as PickableMaterial[];

  // "new" → boş föy oluşturma modu.
  if (id === "new") {
    return (
      <ProductionSheetEditor
        sheet={null}
        initialCategory={sp.kategori ?? null}
        initialSubcategory={sp.alt ?? null}
        memberNames={memberNames}
        manufacturers={manufacturers}
        seasons={seasons}
        materials={materials}
        bom={[]}
        isAdmin={isAdmin}
        currentUserId={user.id}
        categories={categories}
      />
    );
  }

  const { data, error } = await supabase
    .from("production_sheets")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error || !data) {
    redirect("/production");
  }

  // Aynı modelin diğer renkleri. Kök föy: kendisi varyantsa parent'ı, değilse
  // kendisi. Kardeşler = aynı köke bağlı olanlar + kökün kendisi.
  const sheetRow = data as unknown as ProductionSheet;
  const rootId = sheetRow.parent_sheet_id ?? id;
  const siblingsRes = await supabase
    .from("production_sheets")
    .select("id, title, colorway, parent_sheet_id")
    .eq("workspace_id", workspaceId)
    .or(`id.eq.${rootId},parent_sheet_id.eq.${rootId}`)
    .order("created_at");
  const siblings = ((siblingsRes.data ?? []) as { id: string; title: string; colorway: string | null }[])
    .filter((x) => x.id !== id);

  // Reçete (BOM) — malzemeyle birlikte; maliyet bundan hesaplanır.
  const bomResult = await supabase
    .from("production_sheet_materials")
    .select("*, material:workspace_materials(id, name, code, category, unit, unit_price, currency, width_cm)")
    .eq("sheet_id", id)
    .order("position");
  const bom = (bomResult.data ?? []) as unknown as SheetMaterialWithMaterial[];

  return (
    <ProductionSheetEditor
      sheet={data as unknown as ProductionSheet}
      memberNames={memberNames}
      manufacturers={manufacturers}
      seasons={seasons}
      materials={materials}
      bom={bom}
      siblings={siblings}
      isAdmin={isAdmin}
      currentUserId={user.id}
      categories={categories}
    />
  );
}
