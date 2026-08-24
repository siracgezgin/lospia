import { createClient, getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardView, type DueSoonTask, type ReportPerson } from "@/components/dashboard/DashboardView";
import { MemberDashboardView } from "@/components/dashboard/MemberDashboardView";
import { getMemberDashboardData } from "@/lib/points/queries";
import type { Profile } from "@/types";

export const metadata = { title: "Reports" };

/**
 * Reports.
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
    supabase.rpc("get_due_soon_tasks", { p_workspace_id: workspaceId }),
    supabase
      .from("workspace_members")
      .select("user_id, profiles(id, full_name, email)")
      .eq("workspace_id", workspaceId),
  ]);

  type ProfileLite = Pick<Profile, "id" | "full_name" | "email">;
  type MemberRow = { user_id: string; profiles: ProfileLite | ProfileLite[] | null };

  const nameOf: Record<string, string> = {};
  const people: ReportPerson[] = [];
  for (const m of (membersResult.data ?? []) as unknown as MemberRow[]) {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    if (!p) continue;
    const name = p.full_name || p.email || "—";
    nameOf[m.user_id] = name;
    people.push({ id: m.user_id, name });
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
