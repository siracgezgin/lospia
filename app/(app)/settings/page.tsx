import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ContactsManager } from "@/components/settings/ContactsManager";
import { WorkspaceNameEditor } from "@/components/settings/WorkspaceNameEditor";
import { MembersManager } from "@/components/settings/MembersManager";
import { DepartmentsManager } from "@/components/settings/DepartmentsManager";
import { canManageSettings, canRenameWorkspace, canManageMembers, canManageWorkspace } from "@/lib/auth/permissions";
import type {
  Workspace, WorkspaceMember, Profile, CustomFieldDefinition,
  WorkspaceContact, WorkspaceRole, WorkspaceInvite,
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
  if (!workspaceId) return <div className="p-8 text-gray-500">Çalışma alanı bulunamadı.</div>;

  if (!canManageSettings(userRole)) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Ayarlar</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
          Bu sayfayı düzenlemek için yetkiniz yok. Yöneticinize başvurun.
        </div>
      </div>
    );
  }

  const isOwner = canRenameWorkspace(userRole);
  const canManage = canManageMembers(userRole);          // owner-only (invites)
  const canManageDepts = canManageWorkspace(userRole);   // owner + admin (departments)

  const [wsResult, membersResult, profileResult, cfResult, contactsResult, invitesResult,
         deptsResult, deptMembersResult] =
    await Promise.all([
      supabase.from("workspaces").select("*").eq("id", workspaceId).single(),
      supabase
        .from("workspace_members")
        .select("*, profiles(id, full_name, email, avatar_url)")
        .eq("workspace_id", workspaceId),
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase
        .from("custom_field_definitions")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("position"),
      supabase
        .from("workspace_contacts")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at"),
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
  const customFields: CustomFieldDefinition[] = cfResult.data ?? [];
  const contacts: WorkspaceContact[] = (contactsResult.data ?? []) as WorkspaceContact[];
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

  const ROLE_DISPLAY: Record<string, string> = {
    owner: "Sahip", admin: "Yönetici", member: "Üye", viewer: "İzleyici",
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-10">
      <h1 className="text-2xl font-bold text-gray-900">Ayarlar</h1>

      {/* Profile */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-700">Profiliniz</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div>
            <p className="text-xs text-gray-500">İsim</p>
            <p className="text-sm font-medium">{profile?.full_name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">E-posta</p>
            <p className="text-sm font-medium">{profile?.email}</p>
          </div>
        </div>
      </section>

      {/* Workspace */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-700">Çalışma alanı</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div>
            <p className="text-xs text-gray-500 mb-1">İsim</p>
            {isOwner && workspace ? (
              <WorkspaceNameEditor workspaceId={workspaceId} currentName={workspace.name} />
            ) : (
              <p className="text-sm font-medium">{workspace?.name}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-500">Kısa ad</p>
            <p className="text-sm font-mono text-gray-600">{workspace?.slug}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Rolünüz</p>
            <p className="text-sm font-medium">{ROLE_DISPLAY[userRole] ?? userRole}</p>
          </div>
        </div>
      </section>

      {/* Departmanlar */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-700">Departmanlar</h2>
        <p className="text-xs text-gray-400 -mt-2">
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

      {/* Members */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-700">Üyeler</h2>
        {canManage ? (
          <MembersManager
            workspaceId={workspaceId}
            currentUserId={user.id}
            userRole={userRole}
            initialMembers={
              (membersResult.data ?? []) as (WorkspaceMember & { profiles?: Partial<Profile> | null })[]
            }
            initialInvites={invites}
            departments={departments}
            deptMembers={deptMembers}
          />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {(membersResult.data ?? []).map(
              (m: WorkspaceMember & { profiles?: Partial<Profile> | null }) => (
                <div key={m.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium">
                      {m.profiles?.full_name ?? m.profiles?.email ?? "—"}
                    </p>
                    <p className="text-xs text-gray-400">{m.profiles?.email}</p>
                  </div>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full">
                    {ROLE_DISPLAY[m.role] ?? m.role}
                  </span>
                </div>
              )
            )}
          </div>
        )}
      </section>

      {/* İş birliği kişileri */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-700">İş birliği kişileri</h2>
        <p className="text-xs text-gray-400 -mt-2">
          Görevlerde iş birliği kişisi olarak seçilebilen kişiler. Sisteme giriş yapmalarına gerek yoktur.
        </p>
        <ContactsManager workspaceId={workspaceId} initialContacts={contacts} />
      </section>

      {/* Custom fields */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-700">Özel alanlar</h2>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {customFields.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-400">Henüz özel alan tanımlanmamış.</p>
          ) : (
            customFields.map((cf: CustomFieldDefinition) => (
              <div key={cf.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium">{cf.name}</p>
                  <p className="text-xs text-gray-400 font-mono">{cf.field_key}</p>
                </div>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {cf.field_type}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
