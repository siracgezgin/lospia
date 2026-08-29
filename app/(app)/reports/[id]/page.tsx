import { redirect } from "next/navigation";
import { requireModuleMember } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { PersonReport } from "@/components/reports/PersonReport";
import { startOfWeek, addDays, format } from "date-fns";
import type { Task, Profile } from "@/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Person Report" };

/**
 * Kişi bazlı TEK SAYFA rapor.
 *
 * Aslı Hanım (2026-08-19): "Beş sayfa gönderince o insanlar o beş sayfayı
 * okumuyor bile, kendileriyle ilgili olanı bile… Tek sayfalık, kişi bazlı
 * böyle bir şey yapabiliriz — sadece bir sayfada kendisiyle ilgili detayları
 * okusun." Ve biçim için: "Instagram'da yapıyorlar ya, önce dikkati çekiyor,
 * daha fazlasını isteyince veriyor."
 *
 * Sayfa doğrudan işin kendisiyle açılır (gecikmiş → yaklaşan → toplantı →
 * tarihsiz); sayaç yok (Aslı Hanım, 2026-08-24: "İsmi, işi, tarihi bu
 * kadar"). Yazdırılabilir: A4 tek sayfa (bkz. globals.css @media print).
 */
export default async function PersonReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user, workspaceId, isAdmin, gate } = await requireModuleMember();
  if (gate === "login") redirect("/login");
  if (gate !== "ok" || !workspaceId || !user) return <AccessDenied />;

  // Üyeler yalnız KENDİ raporunu görür; yönetici herkesinkini.
  if (!isAdmin && id !== user.id) return <AccessDenied />;

  const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekStart = format(monday, "yyyy-MM-dd");
  const weekEnd = format(addDays(monday, 6), "yyyy-MM-dd");
  const today = format(new Date(), "yyyy-MM-dd");

  const [profileRes, membersRes, tasksRes, meetingsRes, deptRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, avatar_url").eq("id", id).maybeSingle(),
    // Kimlik seçimleri — raporun rengi panodakiyle AYNI olmalı. Tek kişilik
    // hesap yapılırsa takım geneli atamayla tutmaz, yöneticinin seçimini de
    // görmez; bu yüzden ekibin tamamı çekilir.
    supabase
      .from("workspace_members")
      .select("user_id, color_key, icon_key")
      .eq("workspace_id", workspaceId),
    // Kişinin işleri: sorumlu ya da iş birliği yapan.
    supabase
      .from("tasks")
      .select("id, title, status, priority, due_date, completed_at, department_id, custom_fields, visibility, assignee_id")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .is("deleted_at", null),
    supabase
      .from("planning_meetings")
      .select("id, meeting_date, time_slot, title, category, participant_ids, collaborator_ids")
      .eq("workspace_id", workspaceId)
      .gte("meeting_date", weekStart)
      .lte("meeting_date", weekEnd)
      .order("meeting_date")
      .order("time_slot"),
    supabase
      .from("department_members")
      .select("department_id, workspace_departments(name)")
      .eq("workspace_id", workspaceId),
  ]);

  const profile = profileRes.data as Pick<Profile, "id" | "full_name" | "email" | "avatar_url"> | null;
  if (!profile) return <AccessDenied />;

  // Görev sahipliği Pano'daki kuralla AYNI: sorumlu ∪ iş birliği.
  type T = Pick<Task, "id" | "title" | "status" | "priority" | "due_date" | "completed_at" | "department_id"> & {
    custom_fields?: Record<string, unknown> | null;
    visibility?: string | null;
  };
  const mine = ((tasksRes.data ?? []) as unknown as (T & { assignee_id?: string | null })[]).filter((t) => {
    if (!isAdmin && t.visibility === "admin_only") return false;
    if (t.assignee_id === id) return true;
    const c = (t.custom_fields as Record<string, unknown> | null)?.collaborators;
    return Array.isArray(c) && (c as string[]).includes(id);
  });

  const meetings = ((meetingsRes.data ?? []) as unknown as {
    id: string; meeting_date: string; time_slot: string; title: string | null;
    category: string; participant_ids: string[] | null; collaborator_ids: string[] | null;
  }[]).filter((m) =>
    (m.participant_ids ?? []).includes(id) || (m.collaborator_ids ?? []).includes(id),
  );

  const deptNames = ((deptRes.data ?? []) as unknown as {
    department_id: string; workspace_departments: { name: string } | { name: string }[] | null;
  }[]).map((d) => {
    const w = Array.isArray(d.workspace_departments) ? d.workspace_departments[0] : d.workspace_departments;
    return w?.name;
  }).filter((n): n is string => !!n);

  return (
    <PersonReport
      teamIdentity={((membersRes.data ?? []) as { user_id: string; color_key: string | null; icon_key: string | null }[])
        .map((m) => ({ id: m.user_id, colorKey: m.color_key, iconKey: m.icon_key }))}
      person={{
        id: profile.id,
        name: profile.full_name ?? profile.email ?? "—",
        avatarUrl: profile.avatar_url ?? null,
      }}
      tasks={mine}
      meetings={meetings}
      departments={[...new Set(deptNames)]}
      today={today}
    />
  );
}
