"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { toActionErrorMessage } from "@/lib/utils/supabase-errors";

/**
 * KENDİ PROFİLİNİ DÜZENLEME — rolden bağımsız, herkes için aynı.
 *
 * Sıraç (2026-08-29): "Profilimde sadece [fotoğraf] ekleme var. Bu kısım daha
 * iyileştirilebilir olmalı… bir de bu şu an admin, üyede nasıl olacak?"
 *
 * Profil sayfası bugüne kadar SALT OKUNURDU: tek yapılabilen fotoğraf
 * yüklemekti, geri kalan her şey (ad, ünvan) yalnız yöneticinin Ayarlar
 * ekranından değiştirilebiliyordu. Bir tasarımcı kendi ünvanını yazamıyordu.
 *
 * Bu eylem YALNIZ ÇAĞIRANIN KENDİ kaydını yazar — hedef kullanıcı parametresi
 * yoktur, dolayısıyla üye/yönetici ayrımı da gerekmez. Başkasının kimliğini
 * düzenlemek hâlâ Ayarlar'ın işi (saveMemberIdentity, yönetici).
 *
 * RLS ikinci savunma hattı: `profiles` üzerinde "users can update own profile"
 * (id = auth.uid()), `workspace_members` üzerinde kendi satırına yazma izni.
 */

const Schema = z.object({
  fullName: z.string().trim().min(1, "Ad gerekli.").max(80),
  /* ÜNVAN — kartın altındaki satır. Aslı Hanım (2026-08-28): "Bana da
     tasarımcı yazarsan; ben yönetici olmak istemiyorum çünkü."
     Boş bırakılırsa rolden türetilen etikete dönülür. */
  jobTitle: z.string().trim().max(60).nullable().optional(),
});

export type MyProfileInput = z.infer<typeof Schema>;

export async function updateMyProfile(
  input: MyProfileInput,
): Promise<{ ok: true } | { error: string }> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Kimlik doğrulama gerekli." };

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName })
    .eq("id", user.id);
  if (profileError) return { error: toActionErrorMessage(profileError) };

  const jobTitle = (parsed.data.jobTitle ?? "").trim() || null;
  const { error: memberError } = await supabase
    .from("workspace_members")
    .update({ job_title: jobTitle })
    .eq("user_id", user.id);
  /* job_title kolonu henüz migrate edilmemişse ad yine de kaydedilmiş olur —
     yarım kalan bir kayıt kullanıcıya "hiçbir şey olmadı" gibi görünmesin. */
  if (memberError && memberError.code !== "42703" && memberError.code !== "PGRST204") {
    return { error: toActionErrorMessage(memberError) };
  }

  // Kimlik her ekranda görünür.
  revalidatePath("/", "layout");
  return { ok: true };
}
