import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultRuntimeBands, type RuntimeBand } from "@/lib/planning/bands";

/**
 * Haftanın iskeletini OTOMATİK kurar (kaynak: PLANNING_BANDS).
 *
 * Aslı Hanım (2026-08-20):
 *   "Calendar kısmı hepsinde, tüm haftalarda aynı mantıkta olacak — saat ve
 *    başlık vs. O yüzden diğer haftalara da uyarla, ben tek tek uğraşmayayım."
 *
 * Eskiden önce "Haftayı kur" düğmesine basmak, sonra da Şablonlar ekranını
 * doldurmak gerekiyordu; şablon yoksa hafta bomboş açılıyordu. Artık iskelet
 * KODDA sabit (AF_Work "Toplantı Takvimi" sayfasının birebir karşılığı) ve boş
 * bir hafta görüntülendiğinde sessizce yazılır — her hafta aynı saatler, aynı
 * gün başlıkları.
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
  opts: {
    workspaceId: string; userId: string; isAdmin: boolean;
    weekStart: string; weekEnd: string;
    /** Sol sütun (20240326). Verilmezse kod varsayılanları. */
    bands?: RuntimeBand[];
  },
): Promise<number> {
  const { workspaceId, userId, isAdmin, weekStart, weekEnd } = opts;
  const bands = opts.bands?.length ? opts.bands : defaultRuntimeBands();
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

  /* İskelet KODDAN gelir, şablon tablosundan değil.
     Aslı Hanım (2026-08-24): "Şablonları kaldır, olmasına gerek yok; zaten
     elden giriyoruz biz." Şablonlar ayrı bir ekranda yönetiliyor, boş
     bırakılınca hafta bomboş açılıyordu. Artık haftanın saatleri ve gün
     başlıkları ŞERİTLERDEN okunur: yönetici sol sütunu düzenlediyse
     (planning_bands, 20240326) onun saatleri, düzenlemediyse kod
     varsayılanları geçerli — her hafta birebir aynı. */
  const rows = bands.flatMap((band) =>
    band.columns.flatMap((title, weekday) => {
      if (!title.trim()) return []; // o gün o şeritte toplantı yok
      return [{
        workspace_id: workspaceId,
        meeting_date: addDaysIso(weekStart, weekday),
        time_slot: band.slot,
        category: band.category,
        title,
        content: null,
        participant_ids: [] as string[],
        position: weekday,
        created_by: userId,
        updated_by: userId,
      }];
    }),
  );
  if (!rows.length) return 0;

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
