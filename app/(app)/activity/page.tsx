import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getPersonDisplayName } from "@/lib/utils/person-display";
import { ActivityLogView, type ActivityRow } from "@/components/activity/ActivityLogView";

export const preferredRegion = "arn1";

// Workspace-wide audit feed (owner/admin only). Reads task_activity_logs, which
// records create/edit/status/participant/note events with the actor, the task,
// and (where relevant) the old → new values used to render change details.
type LogRow = {
  id: string;
  action: string;
  created_at: string;
  task_id: string | null;
  old_value: unknown;
  new_value: unknown;
  metadata: unknown;
  actor: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
  task: { title: string | null } | { title: string | null }[] | null;
};

export default async function ActivityLogPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!member) return <div className="p-8 text-gray-500">Çalışma alanı bulunamadı.</div>;
  const isAdmin = member.role === "owner" || member.role === "admin";
  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Aktivite Günlüğü</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
          Bu sayfa yalnızca yöneticiler içindir.
        </div>
      </div>
    );
  }

  const { data } = await supabase
    .from("task_activity_logs")
    .select("id, action, created_at, task_id, old_value, new_value, metadata, actor:profiles!task_activity_logs_actor_id_fkey(full_name, email), task:tasks(title)")
    .eq("workspace_id", member.workspace_id)
    .order("created_at", { ascending: false })
    .limit(200);

  const logs = (data ?? []) as unknown as LogRow[];
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

  const rows: ActivityRow[] = logs.map((r) => {
    const actor = one(r.actor);
    const task = one(r.task);
    return {
      id: r.id,
      action: r.action,
      created_at: r.created_at,
      task_id: r.task_id,
      old_value: r.old_value,
      new_value: r.new_value,
      metadata: r.metadata,
      actor_name: actor ? getPersonDisplayName(actor.full_name ?? actor.email) : null,
      task_title: task?.title ?? null,
    };
  });

  return <ActivityLogView rows={rows} />;
}
