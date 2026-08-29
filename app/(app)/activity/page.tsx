import { createClient, getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getPersonDisplayName } from "@/lib/utils/person-display";
import { ActivityLogView, type ActivityRow } from "@/components/activity/ActivityLogView";
import { AccessDenied } from "@/components/modules/AccessDenied";

export const preferredRegion = "arn1";
export const metadata = { title: "Activity Log" };

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
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!member) return <div className="p-8 text-[13.5px] text-muted">Çalışma alanı bulunamadı.</div>;
  const isAdmin = member.role === "owner" || member.role === "admin";
  // Üye için diğer yönetici modülleriyle AYNI 403 ekranı (önce ham amber kutu).
  if (!isAdmin) return <AccessDenied />;

  /* İKİ GÜNLÜK, TEK AKIŞ (2026-08-29). `task_activity_logs` bir GÖREVİN
     geçmişidir (task_id NOT NULL); föy indirmek, kategori/klasör silmek gibi
     göreve bağlı olmayan olaylar `workspace_activity_logs`'ta tutulur.
     Denetim yaparken iki listeye bakmak istemezsiniz — burada birleşip
     zamana göre sıralanıyorlar. */
  const [{ data }, wsResult] = await Promise.all([
    supabase
    .from("task_activity_logs")
    .select("id, action, created_at, task_id, old_value, new_value, metadata, actor:profiles!task_activity_logs_actor_id_fkey(full_name, email), task:tasks(title)")
    .eq("workspace_id", member.workspace_id)
    .order("created_at", { ascending: false })
    .limit(200),
    supabase
      .from("workspace_activity_logs")
      .select("id, action, created_at, entity_type, entity_id, entity_label, metadata, actor:profiles!workspace_activity_logs_actor_id_fkey(full_name, email)")
      .eq("workspace_id", member.workspace_id)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

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

  /* Tablo henüz migrate edilmemişse (wsResult.error) akış yalnız görev
     günlüğünü gösterir — sayfa çökmez. */
  type WsRow = {
    id: string; action: string; created_at: string;
    entity_label: string | null; metadata: unknown;
    actor: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
  };
  const wsLogs = (wsResult.error ? [] : (wsResult.data ?? [])) as unknown as WsRow[];
  const wsRows: ActivityRow[] = wsLogs.map((r) => {
    const actor = one(r.actor);
    return {
      id: `w-${r.id}`,
      action: r.action,
      created_at: r.created_at,
      // Göreve bağlı değil: satır bir göreve LİNK VERMEZ, nesnenin adını yazar.
      task_id: null,
      old_value: null,
      new_value: null,
      metadata: r.metadata,
      actor_name: actor ? getPersonDisplayName(actor.full_name ?? actor.email) : null,
      task_title: r.entity_label,
    };
  });

  const merged = [...rows, ...wsRows].sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
  );

  return <ActivityLogView rows={merged} />;
}
