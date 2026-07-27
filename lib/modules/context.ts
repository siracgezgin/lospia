import { createClient, getAuthUser, getMembership } from "@/lib/supabase/server";
import type { WorkspaceRole } from "@/types";

/**
 * Resolve the caller's workspace + role for the new Operasyon Modülleri pages.
 * Mirrors the membership lookup used across the app (layout, list, rules) so the
 * new routes stay consistent with the existing auth/workspace model — no new
 * auth system, no service-role, all under RLS.
 */
export async function getWorkspaceContext() {
  // Auth + üyelik istek başına önbellekli (lib/supabase/server) — kabuk zaten
  // ikisini de çekiyor, sayfa aynı sonucu tekrar sormaz.
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) {
    return { supabase, user: null, workspaceId: null as string | null, role: "member" as WorkspaceRole, isAdmin: false };
  }

  const member = await getMembership(user.id);

  const workspaceId = member?.workspace_id ?? null;
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

/**
 * Member gate for the Office Center routes (Doküman Merkezi, Şablon
 * Kütüphanesi, Tablo Merkezi). Unlike requireModuleAdmin these are open to
 * every approved workspace member — RLS + server actions keep members limited
 * to approved records and their own drafts. Same gate contract as above.
 */
export async function requireModuleMember() {
  const ctx = await getWorkspaceContext();
  let gate: "ok" | "login" | "denied" = "ok";
  if (!ctx.user) gate = "login";
  else if (!ctx.workspaceId) gate = "denied";
  return { ...ctx, gate };
}
