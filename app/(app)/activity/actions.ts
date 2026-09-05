"use server";

import { createClient, getAuthUser } from "@/lib/supabase/server";
import { canManageSettings } from "@/lib/auth/permissions";
import { fetchActivityPage, type ActivityPage } from "./activity-data";
import type { WorkspaceRole } from "@/types";

/**
 * "DAHA FAZLA YÜKLE" — hareket akışının bir sonraki turu.
 *
 * Akış 200 satırla kesiliyor ve orada BİTİYORDU: daha eskisine ulaşmanın hiçbir
 * yolu yoktu (sayfalama, tarih aralığı, hiçbir şey). Denetim günlüğünün en
 * temel işi "geçen ay ne oldu" sorusuna cevap vermek.
 *
 * Yetki sayfadakiyle AYNI kapıdan geçer: yönetici olmayan bu eylemi doğrudan
 * çağırsa bile veri alamaz (server action herkese açık bir uç noktadır).
 */
export async function loadMoreActivity(
  before: string,
): Promise<ActivityPage | { error: string }> {
  if (typeof before !== "string" || !before) return { error: "Geçersiz istek." };

  const user = await getAuthUser();
  if (!user) return { error: "Kimlik doğrulama gerekli." };

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!member) return { error: "Çalışma alanı bulunamadı." };
  if (!canManageSettings(member.role as WorkspaceRole)) {
    return { error: "Bu kayıtları görme yetkiniz yok." };
  }

  try {
    return await fetchActivityPage(member.workspace_id, before);
  } catch {
    return { error: "Kayıtlar yüklenemedi. Lütfen tekrar deneyin." };
  }
}
