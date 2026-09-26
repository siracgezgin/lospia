// Üretim Föyü → Excel indirme. GET /production/[id]/export
// Kaydedilmiş föyü ExcelJS ile biçimli .xlsx olarak döndürür (Aslı Hanım'ın
// alışkın olduğu föy düzeni). Erişim requireModuleMember ile korunur; föy her
// zaman kullanıcının workspace'i ile eşleştirilir (RLS ayrıca kısıtlar).
import { NextResponse } from "next/server";
import { requireModuleMember } from "@/lib/modules/context";
import { buildProductionSheetWorkbook } from "@/lib/production/xlsx";
import { logWorkspaceActivity, WORKSPACE_ACTIONS } from "@/lib/activity/log-workspace-activity";
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

  /* İNDİRME GÜNLÜĞE YAZILIR (2026-08-29). Dosya sistemin dışına çıkıyor ve
     maliyeti, üreticiyi, ölçüleri taşıyor; kim indirdi sorusunun cevabı
     olmalı. Günlük yazılamazsa indirme yine de sürer. */
  await logWorkspaceActivity(supabase, {
    workspaceId,
    actorId: user.id,
    action: WORKSPACE_ACTIONS.SHEET_DOWNLOADED,
    entityType: "production_sheet",
    entityId: sheet.id,
    entityLabel: sheet.title,
    metadata: { format: "xlsx" },
  });

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

  /* DOSYA ADINDA FÖYÜN SON DEĞİŞİKLİK ZAMANI. Ad yalnız föy başlığıydı; aynı
     föy ikinci kez indirilince tarayıcı üzerine yazmayıp "… (1).xlsx" diye
     kaydediyor, kullanıcı İndirilenler klasöründe ilk kopyayı açıp "güncel
     şeklinde indirmiyor" diyordu. Damga föyün KENDİ zamanı: değişmeyen föy
     tekrar indirilince ad da değişmez, değişen föyde hangi kopyanın yeni
     olduğu addan okunur. Saat İstanbul'dur (sunucu UTC) ve ":" yerine "."
     yazar — Windows dosya adında iki nokta yasak. */
  const at = new Date(sheet.updated_at ?? "");
  const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" })
    .format(Number.isNaN(at.getTime()) ? new Date() : at).replace(":", ".");
  // Dosya adı: Türkçe karakterler için RFC 5987 (filename*), ASCII fallback ayrı.
  const base = `${(sheet.title || "uretim-foyu").replace(/[\\/:*?"<>|]+/g, "-").trim()} ${stamp}`;
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
