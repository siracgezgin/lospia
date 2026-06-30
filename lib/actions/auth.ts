"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

// Sign-in takes an identifier that is EITHER a username OR an e-mail, plus a
// non-empty password — the stored password may predate any length rule, so we
// must NOT reject short ones here or existing users could be locked out.
//
// Public self-signup has been REMOVED: accounts are created by an owner/admin in
// Settings → "Hesap oluştur" (see createMemberAccount). There is no signUp action
// and no public registration path; login is username/e-mail + password only.
const signInSchema = z.object({
  identifier: z.string().trim().min(1, "Kullanıcı adı veya e-posta gerekli."),
  password: z.string().min(1, "Şifre gerekli."),
});

export type AuthFormState = { error: string } | null;

export async function signIn(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  // The identifier is a username when it has no "@", otherwise an e-mail. A
  // username is resolved to its e-mail server-side (no public mapping exposed),
  // then we sign in with that e-mail. Keep the failure message generic so a bad
  // username and a bad password look the same — no enumeration.
  const identifier = parsed.data.identifier;
  let email = identifier.toLowerCase();
  if (!identifier.includes("@")) {
    const { data: resolved, error: resolveError } = await supabase.rpc(
      "resolve_username_to_email",
      { p_username: identifier }
    );
    if (resolveError || !resolved) {
      return { error: "Kullanıcı adı/e-posta veya şifre hatalı." };
    }
    email = (resolved as string).toLowerCase();
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });

  if (error) {
    const msg = error.message?.toLowerCase() ?? "";
    if (msg.includes("invalid login") || msg.includes("credentials")) {
      return { error: "Kullanıcı adı/e-posta veya şifre hatalı." };
    }
    if (msg.includes("rate limit")) {
      return { error: "Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin." };
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

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
