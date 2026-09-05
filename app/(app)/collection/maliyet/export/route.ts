// Maliyet tablosu → tek Excel dosyası. GET /collection/maliyet/export
// Tüm arşivlenmemiş ürünlerin maliyetini kategori gruplu tek sayfa olarak döndürür.
import { NextResponse } from "next/server";
import { requireModuleMember } from "@/lib/modules/context";
import { buildCostWorkbook, type CostBomLite } from "@/lib/production/xlsx";
import { getCategoryTree } from "@/lib/collection/category-tree";
import { resolveSeasonId } from "@/lib/collection/season";
import type { ProductionSheet } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { supabase, user, workspaceId, gate } = await requireModuleMember();
  if (gate !== "ok" || !workspaceId || !user) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 403 });
  }

  /* SEZON BAĞLAMI — dosya EKRANDAKİ tabloyla aynı olsun. Rota sezonu hiç
     okumuyordu: ekran "2026 RESORT" süzülüyken indirilen dosyada bütün
     sezonlar çıkıyor, iki toplam tutmuyordu. */
  const sezon = new URL(req.url).searchParams.get("sezon") ?? undefined;
  const seasonsRes = await supabase
    .from("workspace_seasons")
    .select("id, name, is_current")
    .eq("workspace_id", workspaceId)
    .order("is_current", { ascending: false })
    .order("position")
    .order("name", { ascending: false });
  const seasons = (seasonsRes.data ?? []) as { id: string; name: string; is_current: boolean }[];
  const seasonId = resolveSeasonId(sezon, seasons);
  const seasonName = seasonId ? (seasons.find((s) => s.id === seasonId)?.name ?? null) : null;

  const query = supabase
    .from("production_sheets")
    .select("id, title, product_code, product_kind, producer, category, subcategory, pricing, size_distribution")
    .eq("workspace_id", workspaceId)
    .neq("status", "archived")
    .order("category", { ascending: true, nullsFirst: false })
    .order("title", { ascending: true });
  // Sezonsuz föyler her sezon bağlamında görünür (ekranla aynı kural).
  if (seasonId) query.or(`season_id.eq.${seasonId},season_id.is.null`);
  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Maliyet verisi okunamadı." }, { status: 500 });
  }
  const rows = (data ?? []) as unknown as Pick<
    ProductionSheet,
    "id" | "title" | "product_code" | "product_kind" | "producer" | "category" | "subcategory" | "pricing" | "size_distribution"
  >[];
  if (rows.length === 0) {
    return NextResponse.json({ error: "İndirilecek ürün yok." }, { status: 404 });
  }

  /* REÇETE — birim maliyetin malzeme kalemleri buradan gelir. Rota reçeteyi
     hiç okumadığı için kumaş/fermuar/aksesuar tutarları dosyada eksik
     kalıyordu ve Excel toplamı ekrandaki toplamdan düşük çıkıyordu. */
  const bomRes = await supabase
    .from("production_sheet_materials")
    .select("sheet_id, consumption, waste_pct, material:workspace_materials(id, category, unit_price)")
    .eq("workspace_id", workspaceId);
  const bomBySheet: Record<string, CostBomLite[]> = {};
  for (const r of (bomRes.data ?? []) as unknown as (CostBomLite & { sheet_id: string })[]) {
    (bomBySheet[r.sheet_id] ??= []).push(r);
  }

  // Kategori adları düzenlenebilir taksonomiden — kullanıcının açtığı
  // kategoriler dosyada "Kategorisiz" görünmesin.
  const categories = await getCategoryTree(supabase, workspaceId);

  const buffer = await buildCostWorkbook(rows, { bomBySheet, categories, seasonName });

  const today = new Date().toISOString().slice(0, 10);
  const suffix = seasonName ? ` ${seasonName}` : "";
  const asciiBase = `Maliyet${suffix}-${today}`.replace(/[^\x20-\x7E]/g, "_").replace(/[\\/:*?"<>|]+/g, "-");
  const utf8Name = encodeURIComponent(`Maliyet${suffix} ${today}.xlsx`);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${asciiBase}.xlsx"; filename*=UTF-8''${utf8Name}`,
      "Cache-Control": "no-store",
    },
  });
}
