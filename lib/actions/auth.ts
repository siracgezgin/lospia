"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

// Sign-in only needs a well-formed e-mail and a non-empty password — the stored
// password may predate any length rule, so we must NOT reject short ones here or
// existing users could be locked out.
const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email("Geçerli bir e-posta adresi girin."),
  password: z.string().min(1, "Şifre gerekli."),
});

// Sign-up is strict: a real name, a valid e-mail and a password that satisfies
// the Supabase minimum (config.toml minimum_password_length = 6).
const signUpSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Ad soyad alanı zorunludur.")
    .min(3, "Lütfen geçerli bir ad soyad girin.")
    .max(100, "Ad soyad en fazla 100 karakter olabilir."),
  email: z.string().trim().toLowerCase().email("Geçerli bir e-posta adresi girin."),
  password: z.string().min(6, "Şifre en az 6 karakter olmalıdır."),
});

/** Normalize a display name: collapse internal whitespace and drop stray leading
 *  or trailing quote characters (the source of placeholder names like `Test"`). */
function sanitizeName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/\s+/g, " ")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

export type AuthFormState =
  | { error: string; success?: never; existing?: never }
  | { success: true; error?: never; existing?: never }
  | { existing: true; error?: never; success?: never }
  | null;

export async function signIn(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({
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

  // Attach the user to AF Operasyon if a team-access grant exists but no
  // membership has been created yet (e.g. the grant was added after the account
  // already existed). No-op for users who are already members. Errors are
  // swallowed — login should never fail because of the attach step.
  await supabase.rpc("accept_workspace_access_grant", { p_full_name: null });

  revalidatePath("/", "layout");
  redirect("/board");
}

/**
 * Self-service signup gated by the team-access allowlist (no outbound email,
 * no service_role).
 *
 * The person enters Ad Soyad / E-posta / Şifre. Flow:
 *   1. check_email_access_grant(email) — block non-allowed e-mails before we
 *      create anything.
 *   2. supabase.auth.signUp() — Confirm Email is OFF in the dashboard, so this
 *      returns an authenticated session immediately, with NO e-mail sent and no
 *      project-wide email rate limit to hit.
 *   3. accept_workspace_access_grant(full_name) — runs as the new user, upserts
 *      the profile with the latest display name, attaches the user to AF
 *      Operasyon with the granted role, and marks the grant accepted.
 *
 * If the account already exists we try to sign in with the supplied password;
 * a correct password logs the person in (and updates their display name), a
 * wrong one returns { existing: true } so the UI prompts them to log in.
 */
export async function signUp(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  // 0. Validate name + e-mail + password BEFORE any Supabase auth call, so an
  //    invalid/empty submission never reaches the auth server (and never burns
  //    the auth rate limit).
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("full_name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const email = parsed.data.email;
  const password = parsed.data.password;
  const formName = sanitizeName(parsed.data.fullName);
  if (!formName) {
    return { error: "Ad soyad alanı zorunludur." };
  }

  const supabase = await createClient();

  // 1. Require an active team-access grant (allowlist row) for this email.
  //    Gate BEFORE auth.signUp so non-allowed e-mails create nothing.
  const { data: allowed, error: gateError } = await supabase.rpc("check_email_access_grant", {
    p_email: email,
  });
  if (gateError) {
    return { error: "Bu işlem şu anda tamamlanamadı. Lütfen tekrar deneyin." };
  }
  if (!allowed) {
    return { error: "Bu e-posta adresi için AF Operasyon erişimi tanımlı değil." };
  }

  // 2. Create the account. Confirm Email is OFF → an active session is returned
  //    and no e-mail is sent. For an already-registered e-mail, Supabase returns
  //    an obfuscated user with no session (or an "already registered" error).
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: formName ? { full_name: formName } : undefined },
  });

  let hasSession = !!signUpData?.session;

  if (signUpError) {
    const msg = signUpError.message?.toLowerCase() ?? "";
    if (msg.includes("rate limit")) {
      return { error: "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin." };
    }
    if (!(msg.includes("already") || msg.includes("registered") || msg.includes("exists"))) {
      return { error: "Hesap oluşturulamadı. Lütfen tekrar deneyin." };
    }
    // fall through to the existing-account sign-in attempt below.
  }

  // 3. If no fresh session (account already existed), try to sign in. A correct
  //    password attaches them and refreshes their name; otherwise prompt login.
  if (!hasSession) {
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      return { existing: true };
    }
    hasSession = true;
  }

  // 4. Attach to AF Operasyon and persist the latest display name.
  await supabase.rpc("accept_workspace_access_grant", { p_full_name: formName });

  revalidatePath("/", "layout");
  redirect("/board");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
