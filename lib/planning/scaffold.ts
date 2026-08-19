import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Haftanın iskeletini şablonlardan OTOMATİK kurar.
 *
 * Aslı Hanım (2026-08-20):
 *   "Calendar kısmı hepsinde, tüm haftalarda aynı mantıkta olacak — saat ve
 *    başlık vs. O yüzden diğer haftalara da uyarla, ben tek tek uğraşmayayım."
 *
 * Eskiden her hafta için "Haftayı kur" düğmesine basmak gerekiyordu; boş bir
 * haftaya girildiğinde ızgara bomboş açılıyordu. Artık boş bir hafta
 * görüntülendiğinde şablon satırları sessizce yazılır — her hafta aynı
 * saatlerle ve aynı gün başlıklarıyla açılır.
 *
 * Güvenlik ve idempotenlik:
 *   • YALNIZ yönetici tetikler. Yazma zaten RLS'te admin-only (20240226); üye
 *     görüntülemesi sessizce atlanır, hata üretmez.
 *   • YALNIZ tamamen boş haftada çalışır. Haftada tek bir toplantı bile varsa
 *     dokunulmaz — yönetici bir satırı sildiyse geri gelmez.
 *   • Eşzamanlı iki istek yarışırsa ikincisi hafta artık boş olmadığı için
 *     hiçbir şey eklemez.
 *
 * Dönüş: eklenen toplantı sayısı (0 = zaten kurulu ya da şablon yok).
 */
export async function ensureWeekScaffold(
  supabase: SupabaseClient,
  opts: { workspaceId: string; userId: string; isAdmin: boolean; weekStart: string; weekEnd: string },
): Promise<number> {
  const { workspaceId, userId, isAdmin, weekStart, weekEnd } = opts;
  if (!isAdmin) return 0;

  // Hafta boş mu? Tek satır yeter — dolu haftada hiçbir sorgu daha yapılmaz.
  const { data: any1, error: probeErr } = await supabase
    .from("planning_meetings")
    .select("id")
    .eq("workspace_id", workspaceId)
    .gte("meeting_date", weekStart)
    .lte("meeting_date", weekEnd)
    .limit(1);
  if (probeErr || (any1 && any1.length > 0)) return 0;

  const { data: templates, error: tErr } = await supabase
    .from("planning_templates")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("active", true)
    .order("weekday", { ascending: true })
    .order("time_slot", { ascending: true })
    .order("position", { ascending: true });
  if (tErr || !templates?.length) return 0;

  const rows = templates.map((t) => ({
    workspace_id: workspaceId,
    meeting_date: addDaysIso(weekStart, t.weekday as number),
    time_slot: t.time_slot,
    category: t.category,
    title: t.title,
    content: t.content,
    participant_ids: t.participant_ids ?? [],
    position: t.position ?? 0,
    template_id: t.id,
    created_by: userId,
    updated_by: userId,
  }));

  const { error } = await supabase.from("planning_meetings").insert(rows);
  // Hata yutulur: iskelet kurulamasa da takvim açılmalı (üye görünümü, RLS
  // reddi, yarış durumu…). Kullanıcı boş ızgara görür, sayfa çökmez.
  return error ? 0 : rows.length;
}

/** "2026-08-17" + 3 → "2026-08-20" (UTC, saat dilimi kaymasız). */
function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
