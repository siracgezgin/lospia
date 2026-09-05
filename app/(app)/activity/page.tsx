import { createClient, getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { redirectToSignIn } from "@/lib/auth/session-redirect";
import { ActivityLogView } from "@/components/activity/ActivityLogView";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { canManageSettings } from "@/lib/auth/permissions";
import { fetchActivityPage } from "./activity-data";
import type { WorkspaceRole } from "@/types";

export const preferredRegion = "arn1";
export const metadata = { title: "Activity Log" };

// Workspace-wide audit feed (owner/admin only). Reads task_activity_logs, which
// records create/edit/status/participant/note events with the actor, the task,
// and (where relevant) the old → new values used to render change details —
// merged with workspace_activity_logs (downloads, deletions) into one stream.
// Sorgu + eşleme `activity-data.ts`'te; "daha fazla yükle" eylemi AYNI yerden
// okur, iki farklı kopya olmasın.
export default async function ActivityLogPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirectToSignIn();

  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!member) return <div className="p-8 text-[13.5px] text-muted">Çalışma alanı bulunamadı.</div>;
  // Üye için diğer yönetici modülleriyle AYNI 403 ekranı (önce ham amber kutu).
  if (!canManageSettings(member.role as WorkspaceRole)) return <AccessDenied />;

  const { rows, nextCursor } = await fetchActivityPage(member.workspace_id, null);

  return <ActivityLogView rows={rows} initialCursor={nextCursor} />;
}
