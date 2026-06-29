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
 * Self-service signup gated by the team-access allowlist (no outbound email).
 *
 * The person enters Ad Soyad / E-posta / Şifre. We first confirm the e-mail is
 * on the AF Operasyon team-access list (workspace_access_grants, stored in the
 * workspace_invites table). Only then do we create the account server-side with
 * the service_role admin API (email_confirm: true, so NO confirmation e-mail is
 * sent and there is no project-wide email rate limit to hit), attach it to the
 * AF Operasyon workspace with the configured role, mark the grant accepted, and
 * sign the user in. Non-allowed e-mails never create an account or a workspace.
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
  const formName = (formData.get("full_name") as string | null)?.trim() || null;

  const admin = getAdminClient();
  if (!admin) {
    return { error: "Hesap kurulumu henüz yapılandırılmamış. Lütfen sistem yöneticisine başvurun." };
  }

  // 1. Require an active team-access grant (allowlist row) for this email.
  const { data: grant } = await admin
    .from("workspace_invites")
    .select("id, workspace_id, role, full_name")
    .eq("email", email)
    .is("accepted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!grant) {
    return { error: "Bu e-posta adresi için AF Operasyon erişimi tanımlı değil." };
  }

  // Prefer the name the person typed; otherwise the one the admin configured.
  const fullName = formName || ((grant as { full_name?: string | null }).full_name ?? null);

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

  // 4. Attach to the AF Operasyon workspace (validated role; duplicate-safe).
  //    Role mapping comes from the grant: Yönetici → admin, Üye → member.
  const role = VALID_ROLES.includes(grant.role) ? grant.role : "member";
  await admin.from("workspace_members").upsert(
    { workspace_id: grant.workspace_id, user_id: userId, role },
    { onConflict: "workspace_id,user_id", ignoreDuplicates: true },
  );

  // 5. Mark the team-access grant accepted (so it leaves the pending list).
  await admin
    .from("workspace_invites")
    .update({ accepted_at: new Date().toISOString(), accepted_user_id: userId })
    .eq("id", grant.id);

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
