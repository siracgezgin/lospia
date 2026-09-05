"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient as createRawClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { canManageWorkspace, type AppRole } from "@/lib/auth/permissions";

/**
 * ŞİFRE İŞLEMLERİ.
 *
 * Sisteme e-posta ile şifre sıfırlama YOK (hesaplar `<kullanıcı>@lospia.local`
 * iç yer tutucusuyla açılıyor, gerçek bir posta kutusu olmayabilir). Bu yüzden
 * iki kapı gerekiyor ve ikisi de bugüne kadar hiç yoktu:
 *
 *   1) Kişi KENDİ şifresini değiştirir (mevcut şifresini bilerek) — Profil.
 *   2) Yönetici bir üyenin şifresini SIFIRLAR — Ayarlar › Ekip › Düzenle.
 *      Şifresini unutan kişinin tek kurtuluşu buydu ve yoktu.
 *
 * Şifre hiçbir yerde saklanmaz; yalnız Supabase Auth'a geçirilir.
 */

const PERM_DENIED = "Bu işlem için yetkiniz yok.";
const MIN_LENGTH = 6;

/** Supabase'in İngilizce hata metnini Türkçeye çevirir. */
function passwordErrorMessage(raw: string | null | undefined): string {
  const msg = (raw ?? "").toLowerCase();
  if (msg.includes("different from the old") || msg.includes("should be different")) {
    return "Yeni şifre eskisiyle aynı olamaz.";
  }
  if (msg.includes("weak") || msg.includes("password should be at least")) {
    return `Şifre en az ${MIN_LENGTH} karakter olmalı ve tahmin edilmesi zor olmalı.`;
  }
  if (msg.includes("rate limit") || msg.includes("too many")) {
    return "Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin.";
  }
  return "Şifre değiştirilemedi. Lütfen tekrar deneyin.";
}

const ChangeSchema = z.object({
  currentPassword: z.string().min(1, "Mevcut şifrenizi girin."),
  newPassword: z
    .string()
    .min(MIN_LENGTH, `Yeni şifre en az ${MIN_LENGTH} karakter olmalı.`)
    .max(72, "Şifre en fazla 72 karakter olabilir."),
});

/**
 * KENDİ ŞİFREMİ DEĞİŞTİR.
 *
 * Mevcut şifre AYRI, oturumsuz bir istemciyle doğrulanır: oturum açan istemci
 * üzerinden denenirse başarısız/başarılı her denemede çerezler dönüyor ve
 * kullanıcı yanlış şifre yazdığında oturumundan düşme riski doğuyor.
 */
export async function changeMyPassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ ok: true } | { error: string }> {
  const parsed = ChangeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return { error: "Yeni şifre eskisiyle aynı olamaz." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Kimlik doğrulama gerekli." };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { error: "Sunucu yapılandırması eksik." };

  // Oturumsuz doğrulayıcı: yalnız "bu şifre doğru mu?" sorusunu sorar, hiçbir
  // çerez yazmaz.
  const verifier = createRawClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error: verifyError } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });
  if (verifyError) {
    const msg = verifyError.message?.toLowerCase() ?? "";
    if (msg.includes("rate limit") || msg.includes("too many")) {
      return { error: "Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin." };
    }
    return { error: "Mevcut şifreniz hatalı." };
  }
  // Doğrulama oturumunu hemen kapat — sunucuda açık kalmasın.
  await verifier.auth.signOut();

  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (error) return { error: passwordErrorMessage(error.message) };

  return { ok: true };
}

const hexUuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Geçersiz kayıt");

const ResetSchema = z.object({
  memberId: hexUuid,
  newPassword: z
    .string()
    .min(MIN_LENGTH, `Şifre en az ${MIN_LENGTH} karakter olmalı.`)
    .max(72, "Şifre en fazla 72 karakter olabilir."),
});

/**
 * ÜYENİN ŞİFRESİNİ SIFIRLA (yönetici).
 *
 * `memberId` = workspace_members.id — listedeki satırla aynı anahtar.
 * Çalışma alanı SAHİBİNİN şifresi buradan değiştirilemez (yöneticinin sahibi
 * kilitlemesinin önü kesilir); sahip kendi şifresini Profil'den değiştirir.
 * Kişinin kendi satırı da buradan geçmez — kendi şifresi için Profil.
 */
export async function resetMemberPassword(input: {
  memberId: string;
  newPassword: string;
}): Promise<{ ok: true } | { error: string }> {
  const parsed = ResetSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Kimlik doğrulama gerekli." };

  const { data: caller } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!caller) return { error: PERM_DENIED };
  if (!canManageWorkspace(caller.role as AppRole)) return { error: PERM_DENIED };

  const { data: target, error: targetError } = await supabase
    .from("workspace_members")
    .select("id, user_id, role, workspace_id")
    .eq("id", parsed.data.memberId)
    .maybeSingle();
  if (targetError || !target) return { error: "Üye bulunamadı." };
  if (target.workspace_id !== caller.workspace_id) return { error: PERM_DENIED };
  if (target.role === "owner") {
    return { error: "Çalışma alanı sahibinin şifresi buradan değiştirilemez." };
  }
  if (target.user_id === user.id) {
    return { error: "Kendi şifrenizi Profil sayfasından değiştirin." };
  }

  const admin = getAdminClient();
  if (!admin) {
    return { error: "Şifre sıfırlama sunucuda yapılandırılmamış (SUPABASE_SERVICE_ROLE_KEY eksik)." };
  }

  const { error } = await admin.auth.admin.updateUserById(target.user_id, {
    password: parsed.data.newPassword,
  });
  if (error) return { error: passwordErrorMessage(error.message) };

  revalidatePath("/settings");
  return { ok: true };
}
