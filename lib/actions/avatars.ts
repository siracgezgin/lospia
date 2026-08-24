"use server";

/**
 * Profil fotoğrafı yükleme / kaldırma.
 *
 * Aslı Hanım (2026-08-24): "İkon kalkıp herkesin resmi gelecek."
 * profiles.avatar_url kolonu vardı ama onu dolduran hiçbir yol yoktu.
 *
 * Yetki: kişi kendi fotoğrafını, yönetici herkesinkini değiştirebilir
 * (Aslı Hanım ekibin fotoğraflarını kendisi girecek). Aynı kural storage
 * politikalarında da yazılı — sunucu tarafı tek başına da güvenli.
 */

import { revalidatePath } from "next/cache";
import { createClient, getAuthUser, getMembership } from "@/lib/supabase/server";

const BUCKET = "avatars";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

type Result = { url: string } | { error: string };

async function ctx() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return null;
  const membership = await getMembership(user.id);
  if (!membership?.workspace_id) return null;
  const isAdmin = membership.role === "owner" || membership.role === "admin";
  return { supabase, userId: user.id, workspaceId: membership.workspace_id, isAdmin };
}

/** Hedef kişinin fotoğrafını değiştirebilir miyiz? */
async function canManage(c: NonNullable<Awaited<ReturnType<typeof ctx>>>, targetUserId: string) {
  if (c.userId === targetUserId) return true;
  if (!c.isAdmin) return false;
  // Yönetici yalnız KENDİ çalışma alanındaki birinin fotoğrafını değiştirir.
  const { data } = await c.supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", c.workspaceId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  return !!data;
}

export async function uploadAvatar(targetUserId: string, formData: FormData): Promise<Result> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Dosya bulunamadı." };
  if (file.size > MAX_BYTES) return { error: "Fotoğraf 5 MB sınırını aşıyor." };
  if (!ALLOWED.includes(file.type)) {
    return { error: "Yalnızca fotoğraf yükleyebilirsiniz (PNG, JPG, WEBP)." };
  }

  const c = await ctx();
  if (!c) return { error: "Kimlik doğrulama gerekli." };
  if (!(await canManage(c, targetUserId))) {
    return { error: "Bu kişinin fotoğrafını değiştirme yetkiniz yok." };
  }

  /* Yol kullanıcının KENDİ id'siyle başlar — storage politikası bu klasör
     adına bakıyor. Dosya adı rastgele: eski fotoğrafın önbelleğe alınmış
     URL'si yenisiyle karışmasın. */
  const path = `${targetUserId}/${crypto.randomUUID()}`;

  const { error: upErr } = await c.supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { error: upErr.message };

  const { data: { publicUrl } } = c.supabase.storage.from(BUCKET).getPublicUrl(path);

  const { error: dbErr } = await c.supabase
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", targetUserId);
  if (dbErr) {
    // Kayıt yazılamadıysa yüklenen dosyayı bırakma — yetim dosya biriktirmesin.
    await c.supabase.storage.from(BUCKET).remove([path]);
    return { error: dbErr.message };
  }

  revalidateSurfaces();
  return { url: publicUrl };
}

export async function removeAvatar(targetUserId: string): Promise<{ ok: true } | { error: string }> {
  const c = await ctx();
  if (!c) return { error: "Kimlik doğrulama gerekli." };
  if (!(await canManage(c, targetUserId))) {
    return { error: "Bu kişinin fotoğrafını değiştirme yetkiniz yok." };
  }

  const { error } = await c.supabase
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", targetUserId);
  if (error) return { error: error.message };

  /* Depodaki dosya BİLEREK silinmiyor: aynı fotoğrafa başka bir kayıt
     (eski bir ekran görüntüsü, önbellek) bakıyor olabilir ve birkaç KB
     yer için veri kaybı riski almaya değmez. */
  revalidateSurfaces();
  return { ok: true };
}

/** Kişi çizen tüm yüzeyler — fotoğraf değişince hepsi tazelenmeli. */
function revalidateSurfaces() {
  for (const p of ["/settings", "/profile", "/board", "/planning", "/home", "/list", "/dashboard"]) {
    revalidatePath(p);
  }
}
