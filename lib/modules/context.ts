import { createClient } from "@/lib/supabase/server";
import type { WorkspaceRole } from "@/types";

/**
 * Resolve the caller's workspace + role for the new Operasyon Modülleri pages.
 * Mirrors the membership lookup used across the app (layout, list, rules) so the
 * new routes stay consistent with the existing auth/workspace model — no new
 * auth system, no service-role, all under RLS.
 */
export async function getWorkspaceContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, workspaceId: null as string | null, role: "member" as WorkspaceRole, isAdmin: false };
  }

  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const workspaceId = (member?.workspace_id as string | undefined) ?? null;
  const role = (member?.role as WorkspaceRole | undefined) ?? "member";
  return { supabase, user, workspaceId, role, isAdmin: role === "owner" || role === "admin" };
}

/**
 * Admin gate for the Operasyon Modülleri routes. These are owner/admin-only in
 * Phase 1 — a member/viewer must not see them even via a direct URL. Returns the
 * same context as getWorkspaceContext plus a `gate`:
 *   "login"  → no session, page should redirect("/login")
 *   "denied" → signed in but not owner/admin, page should render <AccessDenied/>
 *   "ok"     → owner/admin, proceed
 */
export async function requireModuleAdmin() {
  const ctx = await getWorkspaceContext();
  let gate: "ok" | "login" | "denied" = "ok";
  if (!ctx.user) gate = "login";
  else if (!ctx.workspaceId || !ctx.isAdmin) gate = "denied";
  return { ...ctx, gate };
}
