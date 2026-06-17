import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TrashView } from "@/components/task/TrashView";
import type { Task } from "@/types";

export default async function TrashPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1);
  const workspaceId = memberRows?.[0]?.workspace_id;
  if (!workspaceId) redirect("/board");

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
