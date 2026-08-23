import { redirect } from "next/navigation";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { SheetPrintSheet } from "@/components/production/SheetPrintSheet";
import type { ProductionSheet, SheetMaterialWithMaterial } from "@/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Production Sheet — Print" };

/**
 * Üretim föyünün TEK SAYFALIK çıktısı.
 *
 * Aslı Hanım (2026-08-23): "Üretim föyünü tek sayfada istiyorum, çıktı aldığın
 * zaman tek sayfada çıksın ve her şey görünsün… firmaya vereyim, zaten bütün
 * detayı görecek, resmi görecek."
 *
 * Editördeki dört sekme EKRAN içindir (uzun föyde 50 alanı bir arada görmek
 * yoruyordu); KÂĞIT tek parçadır. Bu yüzden ayrı bir görünüm — sekmeler
 * bölünmüş, çıktı bütün.
 *
 * Fiyat VARSAYILAN OLARAK BASILMAZ: kâğıt atölyeye gidiyor, web satış fiyatını
 * görmesi gerekmiyor. `?fiyat=1` ile açılır (ekranda tek düğme).
 */
export default async function ProductionSheetPrintPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fiyat?: string }>;
}) {
  const { id } = await params;
  const { fiyat } = await searchParams;
  const { supabase, workspaceId, gate } = await requireModuleMember();
  if (gate === "login") redirect("/login");
  if (gate !== "ok" || !workspaceId) return <AccessDenied />;

  const { data, error } = await supabase
    .from("production_sheets")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error || !data) redirect("/production");
  const sheet = data as unknown as ProductionSheet;

  // Reçete — atölyenin çekeceği malzeme; maliyet de bundan türer.
  const bomResult = await supabase
    .from("production_sheet_materials")
    .select("*, material:workspace_materials(id, name, code, category, unit, unit_price, currency, width_cm)")
    .eq("sheet_id", id)
    .order("position");
  const bom = (bomResult.data ?? []) as unknown as SheetMaterialWithMaterial[];

  // Üretici ve sezon: kayıt varsa o kazanır, yoksa eski serbest metne düşülür.
  let manufacturerName: string | null = null;
  if (sheet.manufacturer_id) {
    const m = await supabase
      .from("workspace_manufacturers")
      .select("name").eq("id", sheet.manufacturer_id).maybeSingle();
    manufacturerName = (m.data as { name: string } | null)?.name ?? null;
  }
  let seasonName: string | null = null;
  if (sheet.season_id) {
    const s = await supabase
      .from("workspace_seasons")
      .select("name").eq("id", sheet.season_id).maybeSingle();
    seasonName = (s.data as { name: string } | null)?.name ?? null;
  }

  return (
    <SheetPrintSheet
      sheet={sheet}
      bom={bom}
      manufacturerName={manufacturerName}
      seasonName={seasonName}
      showPricing={fiyat === "1"}
    />
  );
}
