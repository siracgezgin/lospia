import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ContactsManager } from "@/components/settings/ContactsManager";
import type { Workspace, WorkspaceMember, Profile, CustomFieldDefinition, WorkspaceContact } from "@/types";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1);
  const workspaceId = memberRows?.[0]?.workspace_id;
  const userRole = memberRows?.[0]?.role ?? "member";
  if (!workspaceId) return <div className="p-8 text-gray-500">Çalışma alanı bulunamadı.</div>;

  const [wsResult, membersResult, profileResult, cfResult, contactsResult] = await Promise.all([
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
  ]);

  const workspace: Workspace | null = wsResult.data;
  const profile: Profile | null = profileResult.data;
  const customFields: CustomFieldDefinition[] = cfResult.data ?? [];
  const contacts: WorkspaceContact[] = (contactsResult.data ?? []) as WorkspaceContact[];

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
            <p className="text-xs text-gray-500">İsim</p>
            <p className="text-sm font-medium">{workspace?.name}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Kısa ad</p>
            <p className="text-sm font-mono text-gray-600">{workspace?.slug}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Rolünüz</p>
            <p className="text-sm font-medium capitalize">{userRole}</p>
          </div>
        </div>
      </section>

      {/* Members */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-700">Üyeler</h2>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {(membersResult.data ?? []).map((m: WorkspaceMember & { profiles?: Partial<Profile> | null }) => (
            <div key={m.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-medium">{m.profiles?.full_name ?? m.profiles?.email ?? "Unknown"}</p>
                <p className="text-xs text-gray-400">{m.profiles?.email}</p>
              </div>
              <span className="text-xs capitalize text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                {m.role}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Kişiler */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-700">Kişiler</h2>
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
