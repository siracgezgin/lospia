// Maliyet tablosu → tek Excel dosyası. GET /collection/maliyet/export
// Tüm arşivlenmemiş ürünlerin maliyetini kategori gruplu tek sayfa olarak döndürür.
import { NextResponse } from "next/server";
import { requireModuleMember } from "@/lib/modules/context";
import { buildCostWorkbook } from "@/lib/production/xlsx";
import type { ProductionSheet } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const { supabase, user, workspaceId, gate } = await requireModuleMember();
  if (gate !== "ok" || !workspaceId || !user) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("production_sheets")
    .select("id, title, product_kind, category, subcategory, pricing, size_distribution")
    .eq("workspace_id", workspaceId)
    .neq("status", "archived")
    .order("category", { ascending: true, nullsFirst: false })
    .order("title", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "Maliyet verisi okunamadı." }, { status: 500 });
  }
  const rows = (data ?? []) as unknown as Pick<
    ProductionSheet,
    "id" | "title" | "product_kind" | "category" | "subcategory" | "pricing" | "size_distribution"
  >[];
  if (rows.length === 0) {
    return NextResponse.json({ error: "İndirilecek ürün yok." }, { status: 404 });
  }

  const buffer = await buildCostWorkbook(rows);

  const today = new Date().toISOString().slice(0, 10);
  const asciiName = `Maliyet-${today}.xlsx`;
  const utf8Name = encodeURIComponent(`Maliyet ${today}.xlsx`);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
      "Cache-Control": "no-store",
    },
  });
}
