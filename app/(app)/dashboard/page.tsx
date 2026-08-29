import { createClient, getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardView, type DueSoonTask, type ReportPerson } from "@/components/dashboard/DashboardView";
import { MemberDashboardView } from "@/components/dashboard/MemberDashboardView";
import { getMemberDashboardData } from "@/lib/points/queries";
import { assignPersonTones } from "@/lib/design/person-colors";
import type { Profile } from "@/types";

export const metadata = { title: "Reports" };

/**
 * Reports.
 *
 * Rapor iki şey gösterir: kişiler (kapı) ve açık işlerin TAMAMI (sıralanabilir
 * tablo). Kişi kartına tıklamak tek sayfalık kişi raporunu açar.
 *
 * Sayfa eskiden altı paralel sorgu atıyordu (durum sayımı, haftalık süre,
 * yaklaşanlar, departmanlar, aktif görev dökümü, son hareketler) ve puan
 * verisini de çekiyordu — hepsi grafik/sayaç beslemek içindi. Aslı Hanım
 * (2026-08-24) o yüzeyi kaldırttı ("boş hesap istemiyorum"), dolayısıyla
 * sorguların çoğu da gitti: geriye yaklaşan/geciken işler ve isimler kaldı.
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1);
  const workspaceId = memberRows?.[0]?.workspace_id;
  if (!workspaceId) return <div className="p-8 text-muted">No workspace found.</div>;
  const isAdmin = memberRows?.[0]?.role === "owner" || memberRows?.[0]?.role === "admin";

  // ── Üye raporu = kesinlikle kişisel. Ekip geneli hiçbir veri istemciye
  //    gönderilmez. ──────────────────────────────────────────────────────────
  if (!isAdmin) {
    const personal = await getMemberDashboardData(supabase, workspaceId, user.id);
    return <MemberDashboardView data={personal} />;
  }

  // ── Yönetici raporu = ekip görünümü. ──────────────────────────────────────
  const [dueSoonResult, membersResult] = await Promise.all([
    /* AÇIK İŞLERİN TAMAMI — yalnız "yaklaşan" değil.
       Sıraç (2026-08-29): "Sadece gecikenler değil, tüm görevler görünsün."
       `get_due_soon_tasks` RPC'si adı gereği yalnız teslim tarihi yaklaşan
       işleri döndürüyordu; tarihi uzak ya da HİÇ TARİHİ OLMAYAN iş rapora
       girmiyordu — sayfanın yarısının boş görünmesinin sebebi buydu. */
    supabase
      .from("tasks")
      .select("id, title, status, priority, due_date, assignee_id")
      .eq("workspace_id", workspaceId)
      .not("status", "in", "(done,archived)")
      .is("archived_at", null)
      .is("deleted_at", null)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("workspace_members")
      // Fotoğraf ve renk: rapor kartları Pano'daki kişi kartıyla AYNI kimliği
      // taşımalı — aynı kişi iki ekranda iki farklı renk göstermesin.
      .select("user_id, color_key, icon_key, profiles(id, full_name, email, avatar_url)")
      .eq("workspace_id", workspaceId),
  ]);

  type ProfileLite = Pick<Profile, "id" | "full_name" | "email" | "avatar_url">;
  type MemberRow = {
    user_id: string; color_key: string | null; icon_key: string | null;
    profiles: ProfileLite | ProfileLite[] | null;
  };
  const memberRowsData = (membersResult.data ?? []) as unknown as MemberRow[];

  /* Kişi renkleri — panodakiyle AYNI kaynak: ekip geneli atama + yöneticinin
     Ayarlar'daki seçimi. */
  const tones = assignPersonTones(
    memberRowsData.map((m) => m.user_id),
    Object.fromEntries(memberRowsData.map((m) => [m.user_id, { colorKey: m.color_key, iconKey: m.icon_key }])),
  );

  const nameOf: Record<string, string> = {};
  const people: ReportPerson[] = [];
  for (const m of memberRowsData) {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    if (!p) continue;
    const name = p.full_name || p.email || "—";
    nameOf[m.user_id] = name;
    people.push({
      id: m.user_id,
      name,
      avatarUrl: p.avatar_url ?? null,
      colorHex: tones[m.user_id]?.hex,
    });
  }
  people.sort((a, b) => a.name.localeCompare(b.name, "tr"));

  return (
    <DashboardView
      dueSoonTasks={(dueSoonResult.data ?? []) as DueSoonTask[]}
      nameOf={nameOf}
      people={people}
      isAdmin={isAdmin}
    />
  );
}
