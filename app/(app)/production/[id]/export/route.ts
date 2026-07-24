// Üretim Föyü → Excel indirme. GET /production/[id]/export
// Kaydedilmiş föyü ExcelJS ile biçimli .xlsx olarak döndürür (Aslı Hanım'ın
// alışkın olduğu föy düzeni). Erişim requireModuleMember ile korunur; föy her
// zaman kullanıcının workspace'i ile eşleştirilir (RLS ayrıca kısıtlar).
import { NextResponse } from "next/server";
import { requireModuleMember } from "@/lib/modules/context";
import { buildProductionSheetWorkbook } from "@/lib/production/xlsx";
import type { ProductionSheet } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, user, workspaceId, gate } = await requireModuleMember();
  if (gate !== "ok" || !workspaceId || !user) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("production_sheets")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Föy bulunamadı." }, { status: 404 });
  }

  const sheet = data as unknown as ProductionSheet;

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

  const buffer = await buildProductionSheetWorkbook(sheet, memberNames);

  // Dosya adı: Türkçe karakterler için RFC 5987 (filename*), ASCII fallback ayrı.
  const base = (sheet.title || "uretim-foyu").replace(/[\\/:*?"<>|]+/g, "-").trim();
  const asciiName = base.replace(/[^\x20-\x7E]/g, "_") + ".xlsx";
  const utf8Name = encodeURIComponent(base + ".xlsx");

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
