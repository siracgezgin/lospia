"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const authSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type AuthFormState =
  | { error: string; success?: never; existing?: never }
  | { success: true; error?: never; existing?: never }
  | { existing: true; error?: never; success?: never }
  | null;

const VALID_ROLES = ["owner", "admin", "member", "viewer"];

export async function signIn(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = authSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    const msg = error.message?.toLowerCase() ?? "";
    if (msg.includes("invalid login") || msg.includes("credentials")) {
      return { error: "E-posta veya şifre hatalı." };
    }
    if (msg.includes("rate limit")) {
      return { error: "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin." };
    }
    return { error: "Giriş yapılamadı. Lütfen tekrar deneyin." };
  }

  revalidatePath("/", "layout");
  redirect("/board");
}

/**
 * Invited-user signup that does NOT depend on Supabase's outbound email.
 *
 * The previous flow called supabase.auth.signUp(), which queues a confirmation
 * email and is throttled by Supabase's low project-wide email rate limit
 * ("email rate limit exceeded"). For the invite-only pilot we instead create the
 * account server-side with the service_role admin API (email_confirm: true, no
 * email sent), attach it to the invited workspace, mark the invite accepted, and
 * sign the user in with their password.
 */
export async function signUp(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = authSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const email = parsed.data.email.trim().toLowerCase();
  const password = parsed.data.password;
  const fullName = (formData.get("full_name") as string | null)?.trim() || null;

  const admin = getAdminClient();
  if (!admin) {
    return { error: "Kayıt şu anda yapılandırılmamış. Lütfen yöneticinize başvurun." };
  }

  // 1. Require a pending invite for this email (invite-only).
  const { data: invite } = await admin
    .from("workspace_invites")
    .select("id, workspace_id, role")
    .eq("email", email)
    .is("accepted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!invite) {
    return { error: "Bu e-posta için bir davet bulunamadı. Erişim için yöneticinizden davet isteyin." };
  }

  // 2. Create the auth user with NO confirmation email.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });

  if (createErr) {
    const msg = createErr.message?.toLowerCase() ?? "";
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      return { existing: true };
    }
    return { error: "Hesap oluşturulamadı. Lütfen tekrar deneyin." };
  }

  const userId = created.user?.id;
  if (!userId) {
    return { error: "Hesap oluşturulamadı. Lütfen tekrar deneyin." };
  }

  // 3. Ensure profile carries the full name (trigger already created the row).
  await admin.from("profiles").upsert(
    { id: userId, email, full_name: fullName },
    { onConflict: "id" },
  );

  // 4. Attach to the invited workspace (validated role; duplicate-safe).
  const role = VALID_ROLES.includes(invite.role) ? invite.role : "member";
  await admin.from("workspace_members").upsert(
    { workspace_id: invite.workspace_id, user_id: userId, role },
    { onConflict: "workspace_id,user_id", ignoreDuplicates: true },
  );

  // 5. Mark the invite accepted.
  await admin
    .from("workspace_invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  // 6. Sign the user in (sets the session cookie); no email involved.
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    return { success: true }; // account ready; user can log in manually
  }

  revalidatePath("/", "layout");
  redirect("/board");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
