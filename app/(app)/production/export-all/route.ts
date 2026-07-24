// Tüm üretim föyleri → tek Excel dosyası. GET /production/export-all
// Workspace'teki arşivlenmemiş föyleri her biri ayrı sekme olacak şekilde tek
// .xlsx olarak döndürür. Erişim requireModuleMember ile korunur.
import { NextResponse } from "next/server";
import { requireModuleMember } from "@/lib/modules/context";
import { buildAllProductionSheetsWorkbook } from "@/lib/production/xlsx";
import type { ProductionSheet } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const { supabase, user, workspaceId, gate } = await requireModuleMember();
  if (gate !== "ok" || !workspaceId || !user) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("production_sheets")
    .select("*")
    .eq("workspace_id", workspaceId)
    .neq("status", "archived")
    .order("title", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "Föyler okunamadı." }, { status: 500 });
  }
  const sheets = (data ?? []) as unknown as ProductionSheet[];
  if (sheets.length === 0) {
    return NextResponse.json({ error: "İndirilecek föy yok." }, { status: 404 });
  }

  // Üye adları — alt bilgideki "oluşturan / son giren" için.
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

  const buffer = await buildAllProductionSheetsWorkbook(sheets, memberNames);

  const today = new Date().toISOString().slice(0, 10);
  const asciiName = `Uretim-Foyleri-${today}.xlsx`;
  const utf8Name = encodeURIComponent(`Üretim Föyleri ${today}.xlsx`);

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
