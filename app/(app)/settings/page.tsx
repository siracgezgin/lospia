import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { WorkspaceNameEditor } from "@/components/settings/WorkspaceNameEditor";
import { MembersManager } from "@/components/settings/MembersManager";
import { CreateAccountPanel } from "@/components/settings/CreateAccountPanel";
import { DepartmentsManager } from "@/components/settings/DepartmentsManager";
import { canManageSettings, canRenameWorkspace, canManageMembers, canManageWorkspace } from "@/lib/auth/permissions";
import { roleLabel } from "@/lib/utils/roles";
import { getDisplayNotificationEmail } from "@/lib/utils/notification-email";
import { Card } from "@/components/ui/Card";
import type {
  Workspace, WorkspaceMember, Profile,
  WorkspaceRole, WorkspaceInvite,
  WorkspaceDepartment, DepartmentMember,
} from "@/types";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, id")
    .eq("user_id", user.id)
    .limit(1);
  const workspaceId = memberRows?.[0]?.workspace_id;
  const userRole = (memberRows?.[0]?.role ?? "member") as WorkspaceRole;
  if (!workspaceId) return <div className="p-8 text-muted">Çalışma alanı bulunamadı.</div>;

  if (!canManageSettings(userRole)) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-ink mb-6">Ayarlar</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
          Bu sayfayı düzenlemek için yetkiniz yok. Yöneticinize başvurun.
        </div>
      </div>
    );
  }

  const isOwner = canRenameWorkspace(userRole);
  const canManage = canManageMembers(userRole);          // owner-only (invites)
  const canManageDepts = canManageWorkspace(userRole);   // owner + admin (departments)

  const [wsResult, membersResult, profileResult, invitesResult,
         deptsResult, deptMembersResult] =
    await Promise.all([
      supabase.from("workspaces").select("*").eq("id", workspaceId).single(),
      supabase
        .from("workspace_members")
        .select("*, profiles(id, full_name, username, email, avatar_url)")
        .eq("workspace_id", workspaceId),
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      isOwner
        ? supabase
            .from("workspace_invites")
            .select("*")
            .eq("workspace_id", workspaceId)
            .is("accepted_at", null)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as WorkspaceInvite[] }),
      supabase
        .from("workspace_departments")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("position"),
      supabase
        .from("department_members")
        .select("*, workspace_members(profiles(id, full_name, email))")
        .eq("workspace_id", workspaceId),
    ]);

  const workspace: Workspace | null = wsResult.data;
  const profile: Profile | null = profileResult.data;
  const invites: WorkspaceInvite[] = (invitesResult.data ?? []) as WorkspaceInvite[];
  const departments: WorkspaceDepartment[] = (deptsResult.data ?? []) as WorkspaceDepartment[];
  // department_members.member_id → workspace_members → profiles. Flatten the
  // embed so each row carries a `profiles` shape the manager already expects.
  type DeptMemberRowRaw = DepartmentMember & {
    workspace_members?:
      | { profiles?: Partial<Profile> | Partial<Profile>[] | null }
      | { profiles?: Partial<Profile> | Partial<Profile>[] | null }[]
      | null;
  };
  const deptMembers = ((deptMembersResult.data ?? []) as unknown as DeptMemberRowRaw[]).map((r) => {
    const wm = Array.isArray(r.workspace_members) ? r.workspace_members[0] : r.workspace_members;
    const prof = wm && (Array.isArray(wm.profiles) ? wm.profiles[0] : wm.profiles);
    return { ...r, profiles: prof ?? null } as DepartmentMember & { profiles?: Partial<Profile> | null };
  });

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-ink">Ayarlar</h1>
        <p className="text-sm text-muted mt-1">
          Profiliniz, çalışma alanı, departmanlar ve ekip üyelerini buradan yönetin.
        </p>
      </div>

      {/* Profile + Workspace side by side on wider screens */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Profile */}
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-ink">Profiliniz</h2>
          <Card className="p-5 space-y-3 h-full">
            <div>
              <p className="text-xs text-muted">İsim</p>
              <p className="text-sm font-medium">{profile?.full_name ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted">E-posta</p>
              <p className="text-sm font-medium">{profile?.email}</p>
            </div>
          </Card>
        </section>

        {/* Workspace */}
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-ink">Çalışma alanı</h2>
          <Card className="p-5 space-y-3 h-full">
            <div>
              <p className="text-xs text-muted mb-1">İsim</p>
              {isOwner && workspace ? (
                <WorkspaceNameEditor workspaceId={workspaceId} currentName={workspace.name} />
              ) : (
                <p className="text-sm font-medium">{workspace?.name}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted">Kısa ad</p>
              <p className="text-sm font-mono text-muted">{workspace?.slug}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Rolünüz</p>
              <p className="text-sm font-medium">{roleLabel(userRole)}</p>
            </div>
          </Card>
        </section>
      </div>

      {/* Departmanlar */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-ink">Departmanlar</h2>
        <p className="text-xs text-subtle -mt-2">
          Görevleri departmanlara atayın. Üyeler birden fazla departmanda yer alabilir.
        </p>
        <DepartmentsManager
          departments={departments}
          deptMembers={deptMembers}
          workspaceMembers={
            (membersResult.data ?? []) as (WorkspaceMember & { profiles?: Partial<Profile> | null })[]
          }
          canManage={canManageDepts}
        />
      </section>

      {/* Account creation — admin-created accounts (owner + admin). Replaces the
          old self-signup flow: the person signs in directly with the username +
          password set here. */}
      {canManageDepts && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-ink">Hesap oluştur</h2>
          <CreateAccountPanel workspaceId={workspaceId} departments={departments} />
        </section>
      )}

      {/* Members */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-ink">Üyeler</h2>
        {canManage ? (
          <MembersManager
            workspaceId={workspaceId}
            currentUserId={user.id}
            userRole={userRole}
            initialMembers={
              (membersResult.data ?? []) as (WorkspaceMember & { profiles?: Partial<Profile> | null })[]
            }
            pendingGrants={invites}
            departments={departments}
            deptMembers={deptMembers}
          />
        ) : (
          <Card className="divide-y divide-hairline">
            {(membersResult.data ?? []).map(
              (m: WorkspaceMember & { profiles?: Partial<Profile> | null }) => {
                const display = getDisplayNotificationEmail(m);
                return (
                <div key={m.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium">
                      {m.profiles?.full_name ?? m.profiles?.email ?? "—"}
                    </p>
                    <p className={display.email ? "text-xs text-subtle" : "text-xs text-warning"}>
                      {display.email ?? "Bildirim e-postası eklenmedi"}
                    </p>
                  </div>
                  <span className="text-xs text-muted bg-surface-sunken px-2.5 py-0.5 rounded-full">
                    {roleLabel(m.role)}
                  </span>
                </div>
                );
              }
            )}
          </Card>
        )}
      </section>
    </div>
  );
}
