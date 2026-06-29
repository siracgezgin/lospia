"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { canRenameWorkspace, canManageMembers, type AppRole } from "@/lib/auth/permissions";
import { validateUsername } from "@/lib/utils/username";

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
});

// A username is unavailable if any profile already claims it, or any OTHER
// pending grant in this workspace does. Returns true when the username is free
// for `email` (the same e-mail's own pending grant is ignored so re-adds work).
async function isUsernameTaken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  username: string,
  email: string
): Promise<boolean> {
  const { data: profileMatch } = await supabase
    .from("profiles")
    .select("id")
    .ilike("username", username)
    .maybeSingle();
  if (profileMatch) return true;

  const { data: grantMatch } = await supabase
    .from("workspace_invites")
    .select("id, email")
    .eq("workspace_id", workspaceId)
    .ilike("username", username)
    .is("accepted_at", null)
    .maybeSingle();
  if (grantMatch && grantMatch.email.toLowerCase() !== email.toLowerCase()) return true;

  return false;
}

export async function addTeamAccess(
  workspaceId: string,
  email: string,
  username: string,
  role: "admin" | "member" | "viewer"
): Promise<{ id: string } | { error: string }> {
  const parsed = AccessGrantSchema.safeParse({ workspaceId, email, role });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const usernameResult = validateUsername(username);
  if (!usernameResult.ok) return { error: usernameResult.error };
  const cleanUsername = usernameResult.value;

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

  if (await isUsernameTaken(supabase, workspaceId, cleanUsername, parsed.data.email)) {
    return { error: "Bu kullanıcı adı zaten kullanılıyor." };
  }

  // If a pending grant already exists for this e-mail, update its role + username
  // instead of creating a duplicate (the partial unique index would reject a
  // second one).
  const { data: existingGrant } = await supabase
    .from("workspace_invites")
    .select("id")
    .eq("workspace_id", workspaceId)
    .ilike("email", parsed.data.email)
    .is("accepted_at", null)
    .maybeSingle();

  if (existingGrant) {
    const { error: updErr } = await supabase
      .from("workspace_invites")
      .update({ role: parsed.data.role, username: cleanUsername })
      .eq("id", existingGrant.id);
    if (updErr) {
      if (updErr.code === "23505") return { error: "Bu kullanıcı adı zaten kullanılıyor." };
      return { error: "Erişim güncellenemedi. Lütfen tekrar deneyin." };
    }
    revalidatePath("/settings");
    return { id: existingGrant.id };
  }

  const { data, error } = await supabase
    .from("workspace_invites")
    .insert({
      workspace_id: workspaceId,
      email: parsed.data.email,
      role: parsed.data.role,
      invited_by: ctx.user.id,
      username: cleanUsername,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Either the e-mail or the username collides with an existing pending grant.
      return { error: "Bu e-posta veya kullanıcı adı zaten erişim listesinde." };
    }
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

// ── 4b. Rename a member's display name (owner only) ───────────────────────────
// Lets an admin correct a stale/placeholder profile name (e.g. `Test"`) without
// the person having to re-sign-up. Writes profiles.full_name for the member.
const MemberNameSchema = z.object({
  fullName: z.string().trim().min(1, "İsim gerekli").max(100, "İsim en fazla 100 karakter olabilir"),
});

export async function renameWorkspaceMember(
  memberId: string,
  fullName: string
): Promise<{ ok: true } | { error: string }> {
  const parsed = MemberNameSchema.safeParse({ fullName });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCallerRole(supabase);
  if (!ctx) return { error: "Kimlik doğrulama gerekli." };
  if (!canManageMembers(ctx.role)) return { error: PERM_DENIED };

  // profiles RLS only allows self-edits, so write through the SECURITY DEFINER
  // RPC, which re-verifies the caller manages the target member's workspace.
  const { error } = await supabase.rpc("admin_set_member_name", {
    p_member_id: memberId,
    p_full_name: parsed.data.fullName,
  });

  if (error) {
    if (error.message?.includes("yetkiniz")) return { error: PERM_DENIED };
    if (error.message?.includes("bulunamadı")) return { error: "Üye bulunamadı." };
    return { error: "İsim güncellenemedi. Lütfen tekrar deneyin." };
  }
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true };
}

// ── 4c. Set a member's username (owner only) ──────────────────────────────────
// profiles RLS only allows self-edits, so write through a SECURITY DEFINER RPC
// that re-verifies the caller manages the workspace and enforces format +
// uniqueness server-side.
export async function setMemberUsername(
  memberId: string,
  username: string
): Promise<{ ok: true } | { error: string }> {
  const usernameResult = validateUsername(username);
  if (!usernameResult.ok) return { error: usernameResult.error };

  const supabase = await createClient();
  const ctx = await getCallerRole(supabase);
  if (!ctx) return { error: "Kimlik doğrulama gerekli." };
  if (!canManageMembers(ctx.role)) return { error: PERM_DENIED };

  const { error } = await supabase.rpc("admin_set_member_username", {
    p_member_id: memberId,
    p_username: usernameResult.value,
  });

  if (error) {
    if (error.message?.includes("username_taken")) {
      return { error: "Bu kullanıcı adı zaten kullanılıyor." };
    }
    if (error.message?.includes("invalid_username")) {
      return { error: "Kullanıcı adı yalnızca harf, rakam, nokta, tire ve alt çizgi içerebilir." };
    }
    if (error.message?.includes("yetkiniz")) return { error: PERM_DENIED };
    if (error.message?.includes("bulunamadı")) return { error: "Üye bulunamadı." };
    return { error: "Kullanıcı adı güncellenemedi. Lütfen tekrar deneyin." };
  }
  revalidatePath("/settings");
  revalidatePath("/", "layout");
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
    .select("user_id, role, profiles!inner(email)")
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

  // Invalidate any team-access grants for this e-mail so the removed person
  // cannot silently re-attach on their next login. Their Supabase auth account
  // still exists (we don't touch it), but with no membership and no open grant
  // they hit the clean "AF Operasyon erişimi yok" screen. Re-adding the e-mail
  // in Settings creates a fresh grant that lets them back in. Task history is
  // preserved — we only delete grant rows, never tasks.
  const removedEmail =
    (targetMember as { profiles?: { email?: string | null } | null }).profiles?.email ?? null;
  if (removedEmail) {
    await supabase
      .from("workspace_invites")
      .delete()
      .eq("workspace_id", ctx.workspaceId)
      .ilike("email", removedEmail);
  }

  revalidatePath("/settings");
  return { ok: true };
}
