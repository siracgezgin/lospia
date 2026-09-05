import { createClient, getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { redirectToSignIn } from "@/lib/auth/session-redirect";
import { TaskListView } from "@/components/list/TaskListView";
import type { Task, SavedView, Profile, WorkspaceContact, WorkspaceDepartment, WorkspaceRole } from "@/types";

export const metadata = { title: "List" };

export default async function ListPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string; view?: string }>;
}) {
  const params = await searchParams;
  const initialPerson = typeof params.person === "string" ? params.person : "";
  const initialView = typeof params.view === "string" ? params.view : "";
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirectToSignIn();

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1);
  const workspaceId = memberRows?.[0]?.workspace_id;
  if (!workspaceId) return <div className="p-8 text-muted">Çalışma alanı bulunamadı.</div>;
  const role = (memberRows?.[0]?.role ?? "member") as WorkspaceRole;
  const isAdmin = role === "owner" || role === "admin";

  // Non-admins never see admin_only tasks (RLS + explicit filter as backstop).
  const tasksQuery = supabase
    .from("tasks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .neq("status", "archived")
    .is("archived_at", null)
    .is("deleted_at", null);
  if (!isAdmin) tasksQuery.eq("visibility", "workspace");

  const [
    tasksResult, viewsResult, membersResult, contactsResult, deptsResult, deptMembersResult,
    completionsResult,
  ] = await Promise.all([
    tasksQuery.order("created_at", { ascending: false }),
    supabase
      .from("saved_views")
      .select("*")
      .eq("workspace_id", workspaceId)
      .or(`is_shared.eq.true,owner_id.eq.${user.id}`)
      .order("position"),
    supabase
      .from("workspace_members")
      /* color_key + avatar_url: süzgeç şeridindeki kişi baloncukları kişinin
         KENDİ rengini ve fotoğrafını taşır (Pano ile aynı kimlik). Yeni bir
         sorgu değil, aynı turda iki sütun daha. */
      .select("id, user_id, role, color_key, profiles(id, full_name, email, avatar_url)")
      .eq("workspace_id", workspaceId),
    supabase
      .from("workspace_contacts")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at"),
    supabase
      .from("workspace_departments")
      .select("id, parent_id, name, color_key")
      .eq("workspace_id", workspaceId)
      .order("position"),
    supabase
      .from("department_members")
      .select("department_id, member_id")
      .eq("workspace_id", workspaceId),
    /* Kişi bazlı tamamlama satırları = KATILIMCILAR. Pano ve görev detayı
       sorumluyu "katılımcılar ∪ atanan" diye okuyor; liste bunu bilmediği için
       sorumluları yalnız katılımcı olarak tanımlanmış görevlerde "—" yazıyor,
       üstelik durum açılır kutusunu yetkisi olmayana da açıyordu. Yeni bir
       sıralı tur değil — aynı paralel turun bir sorgusu daha. */
    supabase
      .from("task_member_completions")
      .select("task_id, workspace_members(id, profiles(id, full_name, email))")
      .eq("workspace_id", workspaceId),
  ]);

  /* Görev sorgusu hata verdiğinde ekran BOŞ bir liste gösteriyordu: kullanıcı
     "hiç görevim yok" sanıyordu. Hata artık görünür ve ne yapacağını söyler. */
  if (tasksResult.error) {
    console.error("[list] tasks query failed:", tasksResult.error.message);
    return (
      <div className="w-full px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-md rounded-card border border-danger/25 bg-danger/10 p-5 text-center">
          <p className="text-[14px] font-medium text-danger">Görevler yüklenemedi.</p>
          <p className="mt-1 text-[13px] text-muted">
            Bağlantı kurulamadı. Sayfayı yenileyin; sorun sürerse yöneticinize bildirin.
          </p>
        </div>
      </div>
    );
  }

  const tasks: Task[] = tasksResult.data ?? [];
  const savedViews: SavedView[] = viewsResult.data ?? [];
  type ProfileLite = Pick<Profile, "id" | "full_name" | "email" | "avatar_url">;
  type MemberRow = {
    id: string; user_id: string; role: string; color_key: string | null;
    profiles: ProfileLite | ProfileLite[] | null;
  };
  const memberRowsData = (membersResult.data ?? []) as unknown as MemberRow[];
  const profiles: ProfileLite[] = memberRowsData
    .flatMap((m) => (Array.isArray(m.profiles) ? m.profiles : m.profiles ? [m.profiles] : []));
  const members = memberRowsData.map((m) => {
    const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return {
      memberId: m.id, userId: m.user_id, name: prof?.full_name ?? prof?.email ?? "—",
      isAdmin: m.role === "owner" || m.role === "admin",
    };
  });
  /* Süzgeç baloncukları — ekip üyeleri, kimlikleriyle (ad · fotoğraf · renk). */
  const people = memberRowsData.map((m) => {
    const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return {
      userId: m.user_id,
      name: prof?.full_name ?? prof?.email ?? "—",
      photoUrl: prof?.avatar_url ?? null,
      colorKey: m.color_key,
    };
  });
  const deptMembers = (deptMembersResult.data ?? []) as { department_id: string; member_id: string }[];
  /* task → katılımcılar (kimlik + ad). Panodaki `participantsByTask` ile aynı
     şekil, aynı kaynak. */
  type CompRow = {
    task_id: string;
    workspace_members:
      | { id: string; profiles: ProfileLite | ProfileLite[] | null }
      | { id: string; profiles: ProfileLite | ProfileLite[] | null }[]
      | null;
  };
  const participantsByTask: Record<string, { userId: string; name: string }[]> = {};
  for (const row of (completionsResult.data ?? []) as unknown as CompRow[]) {
    const wm = Array.isArray(row.workspace_members) ? row.workspace_members[0] : row.workspace_members;
    const prof = wm && (Array.isArray(wm.profiles) ? wm.profiles[0] : wm.profiles);
    if (!prof) continue;
    (participantsByTask[row.task_id] ??= []).push({
      userId: prof.id,
      name: prof.full_name ?? prof.email ?? "—",
    });
  }
  const contacts: WorkspaceContact[] = (contactsResult.data ?? []) as WorkspaceContact[];
  const departments = (deptsResult.data ?? []) as WorkspaceDepartment[];

  return (
    <TaskListView
      tasks={tasks}
      savedViews={savedViews}
      workspaceId={workspaceId}
      userId={user.id}
      profiles={profiles}
      contacts={contacts}
      departments={departments}
      members={members}
      people={people}
      deptMembers={deptMembers}
      participantsByTask={participantsByTask}
      role={role}
      isAdmin={isAdmin}
      initialPerson={initialPerson}
      initialView={initialView}
    />
  );
}
