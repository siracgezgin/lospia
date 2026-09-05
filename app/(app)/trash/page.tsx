import { createClient, getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { redirectToSignIn } from "@/lib/auth/session-redirect";
import { TrashView } from "@/components/task/TrashView";
import { canViewDestructivePages } from "@/lib/auth/permissions";
import type { Task, WorkspaceRole } from "@/types";

// Sekme adı uygulama çubuğuyla aynı (PAGE_TITLES ↔ registry).
export const metadata = { title: "Trash" };

export default async function TrashPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirectToSignIn();

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1);
  const workspaceId = memberRows?.[0]?.workspace_id;
  const userRole = (memberRows?.[0]?.role ?? "member") as WorkspaceRole;
  if (!workspaceId) redirect("/board");
  if (!canViewDestructivePages(userRole)) redirect("/board");

  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  const deletedTasks: Task[] = (data ?? []) as Task[];

  return (
    <TrashView tasks={deletedTasks} workspaceId={workspaceId} />
  );
}
