import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ArchiveView } from "@/components/task/ArchiveView";
import type { Task } from "@/types";

export default async function ArchivePage() {
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

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dow = now.getDay();
  const currentMonday = new Date(now);
  currentMonday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  const currentMondayIso = currentMonday.toISOString();

  const [manuallyArchivedResult, oldCompletedResult] = await Promise.all([
    supabase
      .from("tasks")
      .select("*")
      .eq("workspace_id", workspaceId)
      .not("archived_at", "is", null)
      .is("deleted_at", null)
      .order("archived_at", { ascending: false }),
    supabase
      .from("tasks")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("status", "done")
      .lt("completed_at", currentMondayIso)
      .is("archived_at", null)
      .is("deleted_at", null)
      .order("completed_at", { ascending: false }),
  ]);

  const manuallyArchived: Task[] = (manuallyArchivedResult.data ?? []) as Task[];
  const oldCompleted: Task[] = (oldCompletedResult.data ?? []) as Task[];

  return (
    <ArchiveView
      manuallyArchived={manuallyArchived}
      oldCompleted={oldCompleted}
      workspaceId={workspaceId}
    />
  );
}
