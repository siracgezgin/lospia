import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";
import type { Workspace, SavedView, Notification, WorkspaceRole } from "@/types";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // Verify session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch workspace membership
  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1);

  let workspaceId: string | null = memberRows?.[0]?.workspace_id ?? null;
  const userRole: WorkspaceRole = (memberRows?.[0]?.role as WorkspaceRole | undefined) ?? "member";

  // Provision profile + default workspace for new users who have no membership
  let provisionError: string | null = null;
  if (!workspaceId) {
    const fullName =
      (user.user_metadata?.full_name as string | undefined) ?? null;

    const { data: provisionedWs, error: rpcError } = await supabase.rpc(
      "provision_workspace",
      { p_full_name: fullName }
    );

    if (rpcError) {
      provisionError = rpcError.message;
    } else if (provisionedWs && typeof provisionedWs === "object") {
      workspaceId = (provisionedWs as { id: string }).id;
    } else {
      provisionError = "Workspace provisioning returned no data. Try refreshing.";
    }
  }

  let workspace: Workspace | null = null;
  let savedViews: SavedView[] = [];
  let unreadCount = 0;
  let notifications: Notification[] = [];

  if (workspaceId) {
    const [wsResult, viewsResult, notifResult] = await Promise.all([
      supabase
        .from("workspaces")
        .select("*")
        .eq("id", workspaceId)
        .single(),
      supabase
        .from("saved_views")
        .select("*")
        .eq("workspace_id", workspaceId)
        .or(`is_shared.eq.true,owner_id.eq.${user.id}`)
        .order("position"),
      supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    workspace = wsResult.data;
    savedViews = viewsResult.data ?? [];
    notifications = notifResult.data ?? [];
    unreadCount = notifications.filter((n: Notification) => !n.is_read).length;
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <AppSidebar
        workspace={workspace}
        savedViews={savedViews}
        userId={user.id}
        userRole={userRole}
      />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <AppHeader
          workspace={workspace}
          unreadCount={unreadCount}
          userId={user.id}
          notifications={notifications}
          userRole={userRole}
        />
        <main className="flex-1 overflow-auto">
          {provisionError ? (
            <div className="p-8">
              <div className="max-w-md mx-auto bg-red-50 border border-red-200 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-red-800 mb-2">
                  Çalışma alanı kurulumu başarısız
                </h2>
                <p className="text-sm text-red-700 mb-4">{provisionError}</p>
                <p className="text-xs text-red-500">
                  Sayfayı yenilemeyi deneyin. Sorun devam ederse yöneticinize başvurun.
                </p>
              </div>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
