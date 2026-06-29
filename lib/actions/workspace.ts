"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { canRenameWorkspace, canManageMembers, type AppRole } from "@/lib/auth/permissions";

const hexUuid = (msg: string) =>
  z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, msg);

const PERM_DENIED = "Bu işlem için yetkiniz yok.";

// ── Helper: resolve caller's workspace role ──────────────────────────────────
async function getCallerRole(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!member) return null;
  return { user, workspaceId: member.workspace_id, role: member.role as AppRole };
}

// ── 1. Rename workspace (owner only) ────────────────────────────────────────
const RenameSchema = z.object({
  workspaceId: hexUuid("Geçersiz çalışma alanı"),
  name: z.string().min(1, "İsim gerekli").max(100, "İsim en fazla 100 karakter olabilir").trim(),
});

export async function updateWorkspaceName(
  workspaceId: string,
  name: string
): Promise<{ ok: true } | { error: string }> {
  const parsed = RenameSchema.safeParse({ workspaceId, name });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCallerRole(supabase);
  if (!ctx) return { error: "Kimlik doğrulama gerekli." };
  if (!canRenameWorkspace(ctx.role)) return { error: PERM_DENIED };
  if (ctx.workspaceId !== workspaceId) return { error: PERM_DENIED };

  const { error } = await supabase
    .from("workspaces")
    .update({ name: parsed.data.name })
    .eq("id", workspaceId);

  if (error) return { error: error.message };
  revalidatePath("/settings");
  revalidatePath("/board");
  return { ok: true };
}

// ── 2. Add an allowed e-mail to the team-access list (owner only) ─────────────
// The allowlist is stored in workspace_invites (reused). No e-mail is sent and
// no link is generated — the person signs up themselves with the allowed e-mail.
const AccessGrantSchema = z.object({
  workspaceId: hexUuid("Geçersiz çalışma alanı"),
  email: z.string().email("Geçersiz e-posta adresi").toLowerCase(),
  role: z.enum(["admin", "member", "viewer"], { error: "Geçersiz rol" }),
  fullName: z.string().trim().max(100, "İsim en fazla 100 karakter olabilir").optional(),
});

export async function addTeamAccess(
  workspaceId: string,
  email: string,
  role: "admin" | "member" | "viewer",
  fullName?: string
): Promise<{ id: string } | { error: string }> {
  const parsed = AccessGrantSchema.safeParse({ workspaceId, email, role, fullName });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCallerRole(supabase);
  if (!ctx) return { error: "Kimlik doğrulama gerekli." };
  if (!canManageMembers(ctx.role)) return { error: PERM_DENIED };
  if (ctx.workspaceId !== workspaceId) return { error: PERM_DENIED };

  // Check via profiles join if email already belongs to a member
  const { data: memberByEmail } = await supabase
    .from("profiles")
    .select("id, workspace_members!inner(workspace_id)")
    .eq("email", parsed.data.email)
    .eq("workspace_members.workspace_id", workspaceId)
    .maybeSingle();

  if (memberByEmail) {
    return { error: "Bu e-posta adresi zaten ekip üyesi." };
  }

  const { data, error } = await supabase
    .from("workspace_invites")
    .insert({
      workspace_id: workspaceId,
      email: parsed.data.email,
      role: parsed.data.role,
      invited_by: ctx.user.id,
      full_name: parsed.data.fullName || null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "Bu e-posta zaten erişim listesinde." };
    return { error: error.message };
  }

  revalidatePath("/settings");
  return { id: data.id };
}

// ── 3. Remove a pending team-access grant (owner only) ────────────────────────
export async function revokeTeamAccess(
  grantId: string
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCallerRole(supabase);
  if (!ctx) return { error: "Kimlik doğrulama gerekli." };
  if (!canManageMembers(ctx.role)) return { error: PERM_DENIED };

  const { error } = await supabase
    .from("workspace_invites")
    .delete()
    .eq("id", grantId)
    .eq("workspace_id", ctx.workspaceId)
    .is("accepted_at", null);

  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

// ── 4. Change member role (owner only) ───────────────────────────────────────
export async function changeWorkspaceMemberRole(
  memberId: string,
  newRole: "admin" | "member" | "viewer"
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCallerRole(supabase);
  if (!ctx) return { error: "Kimlik doğrulama gerekli." };
  if (!canManageMembers(ctx.role)) return { error: PERM_DENIED };

  // Prevent changing own role
  const { data: targetMember } = await supabase
    .from("workspace_members")
    .select("user_id, role")
    .eq("id", memberId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  if (!targetMember) return { error: "Üye bulunamadı." };
  if (targetMember.user_id === ctx.user.id) return { error: "Kendi rolünüzü değiştiremezsiniz." };
  if (targetMember.role === "owner") return { error: "Sistem admini rolü değiştirilemez." };

  const { error } = await supabase
    .from("workspace_members")
    .update({ role: newRole })
    .eq("id", memberId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

// ── 5. Remove workspace member (owner only) ───────────────────────────────────
export async function removeWorkspaceMember(
  memberId: string
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCallerRole(supabase);
  if (!ctx) return { error: "Kimlik doğrulama gerekli." };
  if (!canManageMembers(ctx.role)) return { error: PERM_DENIED };

  const { data: targetMember } = await supabase
    .from("workspace_members")
    .select("user_id, role")
    .eq("id", memberId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  if (!targetMember) return { error: "Üye bulunamadı." };
  if (targetMember.user_id === ctx.user.id) return { error: "Kendinizi çalışma alanından çıkaramazsınız." };
  if (targetMember.role === "owner") return { error: "Sistem admini çalışma alanından çıkarılamaz." };

  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("id", memberId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}
