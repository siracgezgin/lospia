"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";

const PERM = "Bu işlem için yetkiniz yok.";
const isAdmin = (r: AppRole) => r === "owner" || r === "admin";

/**
 * Admin-only backfill: write missing "earned" ledger rows for already-completed
 * tasks (participants ∪ assignee fallback). Idempotent — a second run inserts
 * nothing. The heavy lifting + authorisation live in the SECURITY DEFINER
 * repair_missing_task_points() function; here we resolve the workspace and gate
 * on role. The repaired ledger rows carry metadata.repair = true as their audit
 * trail (task_activity_logs requires a task id, so we don't log there).
 */
export async function repairMissingPoints(): Promise<
  { ok: true; scannedTasks: number; insertedRows: number } | { error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Kimlik doğrulama gerekli." };

  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!member) return { error: "Çalışma alanı bulunamadı." };
  if (!isAdmin(member.role as AppRole)) return { error: PERM };

  const workspaceId = member.workspace_id as string;
  const { data, error } = await supabase.rpc("repair_missing_task_points", {
    p_workspace_id: workspaceId,
  });
  if (error) return { error: error.message };

  const res = (data ?? {}) as { scanned_tasks?: number; inserted_rows?: number };
  revalidatePath("/dashboard");
  return {
    ok: true,
    scannedTasks: res.scanned_tasks ?? 0,
    insertedRows: res.inserted_rows ?? 0,
  };
}
