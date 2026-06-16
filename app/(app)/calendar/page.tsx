import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CalendarView } from "@/components/calendar/CalendarView";
import type { Task } from "@/types";

export default async function CalendarPage() {
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

  // Only tasks with dates — no full dump
  const { data } = await supabase
    .from("tasks")
    .select("id, title, status, priority, due_date, start_date")
    .eq("workspace_id", workspaceId)
    .neq("status", "archived")
    .or("due_date.not.is.null,start_date.not.is.null");

  const tasks = (data ?? []) as Pick<Task, "id" | "title" | "status" | "priority" | "due_date" | "start_date">[];

  return <CalendarView tasks={tasks} />;
}
