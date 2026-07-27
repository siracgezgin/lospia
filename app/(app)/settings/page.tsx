import { createClient, getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { WorkspaceNameEditor } from "@/components/settings/WorkspaceNameEditor";
import { MembersManager } from "@/components/settings/MembersManager";
import { CreateAccountPanel } from "@/components/settings/CreateAccountPanel";
import { DepartmentsManager } from "@/components/settings/DepartmentsManager";
import { canManageSettings, canRenameWorkspace, canManageMembers, canManageWorkspace } from "@/lib/auth/permissions";
import { roleLabel } from "@/lib/utils/roles";
import { getDisplayNotificationEmail } from "@/lib/utils/notification-email";
import { pickDisplayEmail } from "@/lib/utils/display-identity";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Building2, Shield, Users } from "lucide-react";
import type {
  Workspace, WorkspaceMember, Profile,
  WorkspaceRole, WorkspaceInvite,
  WorkspaceDepartment, DepartmentMember,
} from "@/types";

export default async function SettingsPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, id, notification_email")
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

  // Canonical display e-mail — the SAME helper the AppHeader profile menu uses,
  // so the top-right menu and this card can never disagree. @lospia.local login
  // placeholders are never shown as the person's address.
  const displayEmail = pickDisplayEmail({
    profileEmail: profile?.email ?? null,
    authEmail: user.email,
    notificationEmail: memberRows?.[0]?.notification_email ?? null,
  });
  const memberCount = (membersResult.data ?? []).length;
  const profileName = profile?.full_name ?? "—";

  return (
    <div className="w-full p-4 sm:p-6 lg:p-8 space-y-8">
      {/* Page header: title + summary chips */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink tracking-tight">Ayarlar</h1>
          <p className="text-sm text-muted mt-1">
            Profilinizi, çalışma alanınızı, departmanları ve ekip üyelerini buradan yönetin.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted shadow-card">
            <Shield size={12} className="text-brand" />
            {roleLabel(userRole)}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted shadow-card tabular-nums">
            <Building2 size={12} className="text-brand" />
            {departments.length} departman
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted shadow-card tabular-nums">
            <Users size={12} className="text-brand" />
            {memberCount} ekip üyesi
          </span>
        </div>
      </div>

      {/* Tek hizalı iki sütun (xl): sol 2/3 = Profil + Hesap + Üyeler,
          sağ 1/3 = Çalışma alanı + Departmanlar. Ayrı grid'ler sağ sütunda
          boşluk bırakıyordu — tüm sayfa tek grid'de hizalanır. */}
      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-8 xl:col-span-2">
        {/* Profile */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-ink">Profiliniz</h2>
          <Card className="p-5 h-full space-y-4">
            <div className="flex items-center gap-3">
              <Avatar name={profileName} size="md" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink truncate">{profileName}</p>
                <p className="text-xs text-subtle">{roleLabel(userRole)}</p>
              </div>
            </div>
            <div className="space-y-3 border-t border-hairline pt-4">
              <div>
                <p className="text-xs text-subtle">E-posta</p>
                <p className={displayEmail ? "text-sm font-medium text-ink" : "text-sm text-subtle italic"}>
                  {displayEmail ?? "E-posta eklenmedi"}
                </p>
              </div>
              {profile?.username && (
                <div>
                  <p className="text-xs text-subtle">Kullanıcı adı</p>
                  <p className="text-sm font-medium text-ink">@{profile.username}</p>
                </div>
              )}
            </div>
          </Card>
        </section>

      {/* Account creation — admin-created accounts (owner + admin). Replaces the
          old self-signup flow: the person signs in directly with the username +
          password set here. */}
      {canManageDepts && (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Hesap oluştur</h2>
            <p className="text-[13px] text-muted mt-0.5">
              Yalnızca yöneticiler ve çalışma alanı sahibi yeni hesap oluşturabilir.
            </p>
          </div>
          <CreateAccountPanel workspaceId={workspaceId} departments={departments} />
        </section>
      )}

      {/* Members */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Üyeler</h2>
          <p className="text-[13px] text-muted mt-0.5">
            Ekip üyelerinin rollerini, kullanıcı adlarını ve bildirim e-postalarını yönetin.
          </p>
        </div>
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

        {/* Sağ sütun (1/3): Çalışma alanı + Departmanlar — sol sütunla aynı
            grid satırından başlar, boşluk kalmaz. */}
        <div className="min-w-0 space-y-8">
          {/* Workspace */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink">Çalışma alanı</h2>
            <Card className="p-5 space-y-4">
              <div>
                <p className="text-xs text-subtle mb-1">İsim</p>
                {isOwner && workspace ? (
                  <WorkspaceNameEditor workspaceId={workspaceId} currentName={workspace.name} />
                ) : (
                  <p className="text-sm font-medium text-ink">{workspace?.name}</p>
                )}
              </div>
              <div className="space-y-3 border-t border-hairline pt-4">
                <div>
                  <p className="text-xs text-subtle">Kısa ad</p>
                  <p className="text-sm font-mono text-muted">{workspace?.slug}</p>
                </div>
                <div>
                  <p className="text-xs text-subtle">Rolünüz</p>
                  <p className="text-sm font-medium text-ink">{roleLabel(userRole)}</p>
                </div>
              </div>
            </Card>
          </section>

          {/* Departmanlar */}
          <section className="space-y-3">
            <Card className="p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-ink">Departmanlar</h2>
                  <p className="text-[13px] text-muted mt-0.5">
                    Görevleri departmanlara atayın. Üyeler birden fazla departmanda yer alabilir.
                  </p>
                </div>
                <span className="text-xs text-muted bg-surface-sunken px-2.5 py-1 rounded-full tabular-nums shrink-0">
                  {departments.length} departman
                </span>
              </div>
              <DepartmentsManager
                departments={departments}
                deptMembers={deptMembers}
                workspaceMembers={
                  (membersResult.data ?? []) as (WorkspaceMember & { profiles?: Partial<Profile> | null })[]
                }
                canManage={canManageDepts}
              />
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
