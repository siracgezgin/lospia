import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatDateTimeTR } from "@/lib/utils/format-date";
import { getPersonDisplayName } from "@/lib/utils/person-display";

export const preferredRegion = "arn1";

// Workspace-wide audit feed (owner/admin only). Reads the existing
// task_activity_logs, which already records create/edit/status/participant/
// note events with the actor and timestamp.
const ACTION_LABELS: Record<string, string> = {
  task_created: "görev oluşturdu",
  title_changed: "başlığı değiştirdi",
  description_changed: "açıklamayı güncelledi",
  status_changed: "durumu değiştirdi",
  priority_changed: "önceliği değiştirdi",
  assignee_changed: "sorumluyu değiştirdi",
  due_date_changed: "teslim tarihini değiştirdi",
  category_changed: "konuyu değiştirdi",
  tags_changed: "etiketleri güncelledi",
  waiting_person_changed: "beklenen kişiyi değiştirdi",
  task_completed: "görevi tamamladı",
  task_reopened: "görevi yeniden açtı",
  task_archived: "görevi arşivledi",
  task_trashed: "görevi çöpe taşıdı",
  task_restored: "görevi geri yükledi",
  task_duplicated: "görevi çoğalttı",
  participant_completed: "kendi işini tamamladı",
  participant_uncompleted: "tamamlamayı geri aldı",
  auto_moved_to_review: "görevi Kontrol / Onay'a taşıdı (tüm sorumlular tamam)",
  note_added: "not ekledi",
};

type LogRow = {
  id: string;
  action: string;
  created_at: string;
  task_id: string | null;
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
    .select("id, action, created_at, task_id, actor:profiles!task_activity_logs_actor_id_fkey(full_name, email), task:tasks(title)")
    .eq("workspace_id", member.workspace_id)
    .order("created_at", { ascending: false })
    .limit(150);

  const rows = (data ?? []) as unknown as LogRow[];
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Aktivite Günlüğü</h1>
      <p className="text-sm text-gray-500 -mt-3">Çalışma alanındaki son işlemler (yalnızca yöneticiler görür).</p>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {rows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-400">Henüz kayıt yok.</p>
        ) : (
          rows.map((r) => {
            const actor = one(r.actor);
            const task = one(r.task);
            const actorName = getPersonDisplayName(actor?.full_name ?? actor?.email ?? null);
            const label = ACTION_LABELS[r.action] ?? "görevi güncelledi";
            return (
              <div key={r.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-900">{actorName}</span>{" "}
                  <span className="text-gray-600">{label}</span>
                  {task?.title && r.task_id && (
                    <>
                      {": "}
                      <Link href={`/tasks/${r.task_id}`} prefetch={false} className="text-blue-600 hover:underline">
                        {task.title}
                      </Link>
                    </>
                  )}
                </div>
                <span className="text-xs text-gray-400 shrink-0">{formatDateTimeTR(r.created_at)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
