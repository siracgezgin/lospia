import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Workspace, WorkspaceMember, Profile, CustomFieldDefinition } from "@/types";

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
  if (!workspaceId) return <div className="p-8 text-gray-500">No workspace found.</div>;

  const [wsResult, membersResult, profileResult, cfResult] = await Promise.all([
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
  ]);

  const workspace: Workspace | null = wsResult.data;
  const profile: Profile | null = profileResult.data;
  const customFields: CustomFieldDefinition[] = cfResult.data ?? [];

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-10">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {/* Profile */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-700">Your profile</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div>
            <p className="text-xs text-gray-500">Name</p>
            <p className="text-sm font-medium">{profile?.full_name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Email</p>
            <p className="text-sm font-medium">{profile?.email}</p>
          </div>
        </div>
      </section>

      {/* Workspace */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-700">Workspace</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div>
            <p className="text-xs text-gray-500">Name</p>
            <p className="text-sm font-medium">{workspace?.name}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Slug</p>
            <p className="text-sm font-mono text-gray-600">{workspace?.slug}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Your role</p>
            <p className="text-sm font-medium capitalize">{userRole}</p>
          </div>
        </div>
      </section>

      {/* Members */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-700">Members</h2>
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

      {/* Custom fields */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-700">Custom fields</h2>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {customFields.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-400">No custom fields defined yet.</p>
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
