import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardView } from "@/components/dashboard/DashboardView";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1);
  const workspaceId = memberRows?.[0]?.workspace_id;
  if (!workspaceId) return <div className="p-8 text-gray-500">No workspace found.</div>;

  // All aggregations via RPC — no raw task dumps to client
  const [statusResult, timeResult, dueSoonResult] = await Promise.all([
    supabase.rpc("get_tasks_by_status", { p_workspace_id: workspaceId }),
    supabase.rpc("get_time_logged_this_week", {
      p_workspace_id: workspaceId,
      p_user_id: user.id,
    }),
    supabase.rpc("get_due_soon_tasks", { p_workspace_id: workspaceId }),
  ]);

  return (
    <DashboardView
      tasksByStatus={statusResult.data ?? []}
      timeLoggedSeconds={timeResult.data ?? 0}
      dueSoonTasks={dueSoonResult.data ?? []}
    />
  );
}
