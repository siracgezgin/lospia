// Föyün sunucudaki GÜNCEL hâli. GET /production/[id]/state
//
// Açık duran föy ekranı, başka bir oturumda (başka sekme, başka kişi, Maliyet
// tablosu) yapılan değişikliği buradan alır — bkz. ProductionSheetEditor'daki
// "ALAN ALAN KAYIT" notu. Server Action DEĞİL: Next eylemleri tarayıcıda sırayla
// işler, okuma kayıt kuyruğunun önüne geçmesin. Yetki föy sayfasınınkiyle aynı
// (oturum + çalışma alanı üyeliği; RLS ayrıca kısıtlar).
import { NextResponse } from "next/server";
import { requireModuleMember } from "@/lib/modules/context";

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
  if (error || !data) return NextResponse.json({ error: "Föy bulunamadı." }, { status: 404 });
  return NextResponse.json({ sheet: data }, { headers: { "Cache-Control": "no-store" } });
}
