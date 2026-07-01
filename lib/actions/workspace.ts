"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { canRenameWorkspace, canManageMembers, canManageWorkspace, type AppRole } from "@/lib/auth/permissions";
import { validateUsername } from "@/lib/utils/username";

// Admin-created accounts use an internal auth e-mail derived from the username.
// The person never sees or types this; they sign in with username + password.
const INTERNAL_EMAIL_DOMAIN = "lospia.local";

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

// ── 5b. Hard-delete a member's account (owner only) ───────────────────────────
// Fully removes a person from the system — workspace membership, department
// assignments, pending grants, AND the underlying Supabase Auth user (deleting
// the auth user cascades their profile → membership → dept memberships). Real
// work is preserved: the NOT-NULL / RESTRICT authorship columns
// (tasks.created_by, task_activity.user_id, attachments.uploaded_by,
// workspaces.created_by) are re-attributed to the acting owner first, otherwise
// those foreign keys would block the cascade. Requires the server-only
// service_role key (admin client). If the auth user still can't be removed (an
// FK we don't reassign), we fall back to a soft-disable: the membership is
// dropped so the person can no longer reach the workspace, and we return a clear
// message so the UI can explain that access was revoked but history kept.
export async function removeWorkspaceMemberAccount(
  memberId: string,
): Promise<{ ok: true; hardDeleted: boolean } | { error: string }> {
  const parsed = hexUuid("Geçersiz üye").safeParse(memberId);
  if (!parsed.success) return { error: "Geçersiz üye." };

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
  if (targetMember.user_id === ctx.user.id) return { error: "Kendi hesabınızı silemezsiniz." };
  // Extra protection for the system admin / owner: never deletable this way.
  if (targetMember.role === "owner") return { error: "Sistem admini silinemez." };

  const targetUserId = targetMember.user_id as string;
  const removedEmail =
    (targetMember as { profiles?: { email?: string | null } | null }).profiles?.email ?? null;

  async function revokeAccessOnly() {
    await supabase
      .from("workspace_members")
      .delete()
      .eq("id", memberId)
      .eq("workspace_id", ctx!.workspaceId);
    if (removedEmail) {
      await supabase
        .from("workspace_invites")
        .delete()
        .eq("workspace_id", ctx!.workspaceId)
        .ilike("email", removedEmail);
    }
  }

  const admin = getAdminClient();

  // No service role → we cannot touch Supabase Auth. Still revoke access so the
  // person can't reach the workspace (soft-disable), and say so honestly.
  if (!admin) {
    await revokeAccessOnly();
    revalidatePath("/settings");
    revalidatePath("/", "layout");
    return { ok: true, hardDeleted: false };
  }

  // Re-attribute the RESTRICT / NOT-NULL authorship refs to the acting owner so
  // the auth-user cascade isn't blocked. Tasks and history are preserved.
  await admin.from("tasks").update({ created_by: ctx.user.id }).eq("created_by", targetUserId);
  await admin.from("task_activity").update({ user_id: ctx.user.id }).eq("user_id", targetUserId);
  await admin.from("attachments").update({ uploaded_by: ctx.user.id }).eq("uploaded_by", targetUserId);
  await admin.from("workspaces").update({ created_by: ctx.user.id }).eq("created_by", targetUserId);

  // Drop pending grants for this e-mail so they can't silently re-attach later.
  if (removedEmail) {
    await admin
      .from("workspace_invites")
      .delete()
      .eq("workspace_id", ctx.workspaceId)
      .ilike("email", removedEmail);
  }

  // Delete the auth user → cascades profile → workspace_members → dept members.
  const { error: delErr } = await admin.auth.admin.deleteUser(targetUserId);
  if (delErr) {
    // Hard delete blocked by an FK we don't reassign — revoke access instead.
    await revokeAccessOnly();
    revalidatePath("/settings");
    revalidatePath("/", "layout");
    return {
      error:
        "Kullanıcı görev geçmişinde kullanıldığı için tamamen silinemedi; erişimi kaldırıldı.",
    };
  }

  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true, hardDeleted: true };
}

// ── 6. Admin-created account (username + password) ────────────────────────────
// Replaces the old self-signup flow. An owner/admin creates a working account
// for a person directly: the person never registers — they just sign in with the
// username + password the admin set. We never store the password (it's passed
// only to Supabase Auth at createUser), and we derive an internal auth e-mail
// (`<username>@lospia.local`) the user never sees. Requires the server-only
// service_role key (admin client); fails cleanly with a clear message if absent.
const CreateAccountSchema = z.object({
  workspaceId: hexUuid("Geçersiz çalışma alanı"),
  fullName: z
    .string()
    .trim()
    .min(2, "Ad soyad gerekli.")
    .max(100, "Ad soyad en fazla 100 karakter olabilir."),
  role: z.enum(["admin", "member"], { error: "Geçersiz rol" }),
  departmentId: hexUuid("Geçersiz departman").nullable().optional(),
});

export async function createMemberAccount(input: {
  workspaceId: string;
  fullName: string;
  username: string;
  password: string;
  role: "admin" | "member";
  departmentId?: string | null;
}): Promise<{ ok: true; userId: string } | { error: string }> {
  const parsed = CreateAccountSchema.safeParse({
    workspaceId: input.workspaceId,
    fullName: input.fullName,
    role: input.role,
    departmentId: input.departmentId ?? null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const usernameResult = validateUsername(input.username);
  if (!usernameResult.ok) return { error: usernameResult.error };
  const username = usernameResult.value;

  if (typeof input.password !== "string" || input.password.length < 6) {
    return { error: "Şifre en az 6 karakter olmalıdır." };
  }

  const supabase = await createClient();
  const ctx = await getCallerRole(supabase);
  if (!ctx) return { error: "Kimlik doğrulama gerekli." };
  // Owner + admin may create accounts (not plain members / viewers).
  if (!canManageWorkspace(ctx.role)) return { error: PERM_DENIED };
  if (ctx.workspaceId !== parsed.data.workspaceId) return { error: PERM_DENIED };

  const admin = getAdminClient();
  if (!admin) {
    return {
      error:
        "Hesap oluşturma sunucuda yapılandırılmamış (SUPABASE_SERVICE_ROLE_KEY eksik).",
    };
  }

  // Username uniqueness is global + case-insensitive. Check via the admin client
  // so RLS visibility can't let a duplicate slip through.
  const { data: dupProfile } = await admin
    .from("profiles")
    .select("id")
    .ilike("username", username)
    .maybeSingle();
  if (dupProfile) return { error: "Bu kullanıcı adı zaten kullanılıyor." };

  const { data: dupGrant } = await admin
    .from("workspace_invites")
    .select("id")
    .ilike("username", username)
    .is("accepted_at", null)
    .maybeSingle();
  if (dupGrant) return { error: "Bu kullanıcı adı zaten kullanılıyor." };

  const email = `${username}@${INTERNAL_EMAIL_DOMAIN}`;

  // 1. Create the auth user (already confirmed → can sign in immediately).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName, username },
  });
  if (createErr || !created?.user) {
    const msg = createErr?.message?.toLowerCase() ?? "";
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      return { error: "Bu kullanıcı adı için hesap zaten var." };
    }
    return { error: "Hesap oluşturulamadı. Lütfen tekrar deneyin." };
  }
  const userId = created.user.id;

  // 2. Profile (carries display name + username + the internal e-mail, which MUST
  //    match the auth e-mail so username→email login resolves correctly).
  const { error: profileErr } = await admin
    .from("profiles")
    .upsert(
      { id: userId, email, full_name: parsed.data.fullName, username },
      { onConflict: "id" },
    );
  if (profileErr) {
    await admin.auth.admin.deleteUser(userId);
    return { error: "Profil oluşturulamadı. Lütfen tekrar deneyin." };
  }

  // 3. Workspace membership with the chosen role.
  const { data: member, error: memberErr } = await admin
    .from("workspace_members")
    .insert({ workspace_id: ctx.workspaceId, user_id: userId, role: parsed.data.role })
    .select("id")
    .single();
  if (memberErr || !member) {
    await admin.auth.admin.deleteUser(userId);
    return { error: "Üyelik oluşturulamadı. Lütfen tekrar deneyin." };
  }

  // 4. Optional department assignment (best-effort; non-fatal).
  if (parsed.data.departmentId) {
    await admin.from("department_members").insert({
      workspace_id: ctx.workspaceId,
      department_id: parsed.data.departmentId,
      member_id: member.id,
    });
  }

  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true, userId };
}
