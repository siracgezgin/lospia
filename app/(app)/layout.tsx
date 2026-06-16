import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";
import type { Workspace, SavedView } from "@/types/database";

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

  // Fetch workspace (first workspace the user belongs to — V1 single workspace)
  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1);

  const workspaceId = memberRows?.[0]?.workspace_id ?? null;

  let workspace: Workspace | null = null;
  let savedViews: SavedView[] = [];
  let unreadCount = 0;

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
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false),
    ]);

    workspace = wsResult.data;
    savedViews = viewsResult.data ?? [];
    unreadCount = notifResult.count ?? 0;
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <AppSidebar
        workspace={workspace}
        savedViews={savedViews}
        userId={user.id}
      />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <AppHeader
          workspace={workspace}
          unreadCount={unreadCount}
          userId={user.id}
        />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
