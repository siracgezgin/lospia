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

  // Attach the user to AF Operasyon when they have no membership yet. This is the
  // team-access model: accept_workspace_access_grant() consumes a pending
  // allowed-email grant (added by an admin in Settings) and joins the user with
  // the granted role. It never creates a personal/random workspace. If the e-mail
  // has no grant and the user is not already a member it returns {"error":"no_access"}
  // and we show a clean "no access" screen instead of the old confusing message.
  let provisionError: string | null = null;
  let noAccess = false;
  if (!workspaceId) {
    const fullName =
      (user.user_metadata?.full_name as string | undefined) ?? null;

    const { data: grant, error: rpcError } = await supabase.rpc(
      "accept_workspace_access_grant",
      { p_full_name: fullName }
    );

    const grantObj =
      grant && typeof grant === "object" ? (grant as Record<string, unknown>) : null;

    if (rpcError) {
      provisionError = rpcError.message;
    } else if (grantObj?.error === "no_access") {
      noAccess = true;
    } else if (grantObj?.workspace_id) {
      workspaceId = grantObj.workspace_id as string;
    } else {
      provisionError = "Çalışma alanına bağlanılamadı. Sayfayı yenileyin.";
    }
  }

  let workspace: Workspace | null = null;
  let savedViews: SavedView[] = [];
  let unreadCount = 0;
  let notifications: Notification[] = [];

  let userName: string | null =
    (user.user_metadata?.full_name as string | undefined) ?? null;

  if (workspaceId) {
    const [wsResult, viewsResult, notifResult, profileResult] = await Promise.all([
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
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    workspace = wsResult.data;
    savedViews = viewsResult.data ?? [];
    notifications = notifResult.data ?? [];
    unreadCount = notifications.filter((n: Notification) => !n.is_read).length;
    userName = profileResult.data?.full_name ?? userName;
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
          userName={userName}
          userEmail={user.email ?? null}
          notifications={notifications}
          userRole={userRole}
        />
        {/* pb-14 ensures content isn't hidden behind the mobile bottom nav */}
        <main className="flex-1 overflow-auto pb-14 md:pb-0">
          {noAccess ? (
            <div className="min-h-full flex items-center justify-center p-8">
              <div className="max-w-md w-full bg-amber-50 border border-amber-200 rounded-xl p-8 text-center space-y-4">
                <div className="text-4xl">🔒</div>
                <h2 className="text-lg font-semibold text-amber-900">
                  AF Operasyon erişimi yok
                </h2>
                <p className="text-sm text-amber-800">
                  Bu e-posta adresi için AF Operasyon erişimi tanımlı değil.
                  Erişim için yöneticinizle iletişime geçin.
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
