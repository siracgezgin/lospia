import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";
import { MobileNav } from "@/components/layout/MobileNav";
import type { Workspace, SavedView, Notification, WorkspaceRole } from "@/types";

// Co-locate serverless functions with the Supabase project (eu-north-1, Stockholm).
// Vercel's "arn1" is Stockholm; this removes the cross-region (fra1↔eu-north-1)
// latency that was being added to every Supabase round-trip. Falls back
// gracefully if the region is unavailable on the current plan.
export const preferredRegion = "arn1";

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

  // Provision profile + workspace for new users who have no membership.
  // If the user has a pending invite, provision_workspace() joins them to the
  // invited workspace. If there is no invite, it returns {"error":"no_invite"}
  // and we show the pilot gate message instead of creating a personal workspace.
  let provisionError: string | null = null;
  let noInvite = false;
  if (!workspaceId) {
    const fullName =
      (user.user_metadata?.full_name as string | undefined) ?? null;

    const { data: provisionedWs, error: rpcError } = await supabase.rpc(
      "provision_workspace",
      { p_full_name: fullName }
    );

    if (rpcError) {
      provisionError = rpcError.message;
    } else if (
      provisionedWs &&
      typeof provisionedWs === "object" &&
      "error" in (provisionedWs as Record<string, unknown>) &&
      (provisionedWs as Record<string, unknown>).error === "no_invite"
    ) {
      noInvite = true;
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
        {/* pb-14 ensures content isn't hidden behind the mobile bottom nav */}
        <main className="flex-1 overflow-auto pb-14 md:pb-0">
          {noInvite ? (
            <div className="min-h-full flex items-center justify-center p-8">
              <div className="max-w-md w-full bg-amber-50 border border-amber-200 rounded-xl p-8 text-center space-y-4">
                <div className="text-4xl">🔒</div>
                <h2 className="text-lg font-semibold text-amber-900">
                  Davet gerekli
                </h2>
                <p className="text-sm text-amber-800">
                  Bu sistem şu anda davet ile kullanılmaktadır. Erişim için yöneticinizden davet isteyin.
                </p>
                <p className="text-xs text-amber-600">
                  Giriş yaptığınız hesap: {user.email}
                </p>
                <form action="/api/auth/signout" method="post">
                  <button
                    type="submit"
                    className="mt-2 text-sm text-amber-700 underline hover:text-amber-900"
                  >
                    Çıkış yap
                  </button>
                </form>
              </div>
            </div>
          ) : provisionError ? (
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
      <MobileNav />
    </div>
  );
}
