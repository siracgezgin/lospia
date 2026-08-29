"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { PERSON_TONES, PERSON_ICONS } from "@/lib/design/person-colors";
import { toActionErrorMessage } from "@/lib/utils/supabase-errors";

/**
 * Kişi kimliği — renk ve ikon seçimi (20240313 migration).
 *
 * Aslı Hanım (2026-08-19): "Herkesin bir rengi olsa da herkes kendi rengini
 * takip etse" / "Herkese ikon koy. Sevdikleri ikonları da seçtirebilirsin."
 *
 * Seçimi YÖNETİCİ yapar (Ayarlar → Kişi Kimliği). Boş bırakılan alan otomatik
 * atamaya döner; sistem hiçbir zaman renksiz kişi göstermez.
 *
 * 20240323'ten beri ÜNVAN da buradan yazılır — kartın altında sistem rolü
 * ("Yönetici") değil, kişinin kendi ünvanı ("Tasarımcı") görünsün diye.
 */

const AUTH_REQUIRED = "Kimlik doğrulama gerekli.";
const ADMIN_ONLY = "Kişi rengini ve ikonunu yalnız yöneticiler değiştirebilir.";
const COLOR_TAKEN = "Bu renk başka bir kişide kullanılıyor. Önce onu değiştirin.";

const COLOR_KEYS = PERSON_TONES.map((t) => t.key);
const ICON_KEYS = PERSON_ICONS.map((i) => i.key);

const HEX = /^#[0-9a-fA-F]{6}$/;

const IdentitySchema = z.object({
  /* Hazır palet anahtarı VEYA serbest hex (#rrggbb). Aslı Hanım (2026-08-23):
     "Her kişi için renk paleti çıksa, mesela hexadecimal." Hex küçük harfe
     indirgenir ki "#AABBCC" ile "#aabbcc" iki ayrı renk sayılmasın — tekil
     indeks metin karşılaştırıyor. "" → otomatik atamaya dön. */
  colorKey: z.union([
    z.enum(COLOR_KEYS as [string, ...string[]]),
    z.string().regex(HEX, "Renk #rrggbb biçiminde olmalı.").transform((v) => v.toLowerCase()),
    z.literal(""),
  ]).nullable(),
  iconKey: z.union([z.enum(ICON_KEYS as [string, ...string[]]), z.literal("")]).nullable(),
  /* ÜNVAN — kartın altındaki satır (20240323). Aslı Hanım (2026-08-28):
     "Bana da tasarımcı yazarsan; ben yönetici olmak istemiyorum çünkü."
     "" → rolden türetilen eski etikete dön. */
  jobTitle: z.string().max(60).nullable().optional(),
});

export type MemberIdentityInput = z.infer<typeof IdentitySchema>;

async function getCtx(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!member) return null;
  return { userId: user.id, workspaceId: member.workspace_id as string, role: member.role as AppRole };
}

const isAdmin = (r: AppRole) => r === "owner" || r === "admin";

export async function saveMemberIdentity(
  memberId: string,
  input: MemberIdentityInput,
): Promise<{ ok: true } | { error: string }> {
  const parsed = IdentitySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdmin(ctx.role)) return { error: ADMIN_ONLY };

  const color_key = parsed.data.colorKey ? parsed.data.colorKey : null;
  const icon_key = parsed.data.iconKey ? parsed.data.iconKey : null;
  const job_title = (parsed.data.jobTitle ?? "").trim() || null;

  const { error } = await supabase
    .from("workspace_members")
    .update({ color_key, icon_key, job_title })
    .eq("id", memberId)
    .eq("workspace_id", ctx.workspaceId); // başka alanın üyesine yazılmasın

  if (error) {
    // Kısmi tekil indeks (workspace_id, color_key) — çakışmayı okunur anlat.
    if (error.code === "23505") return { error: COLOR_TAKEN };
    return { error: toActionErrorMessage(error) };
  }

  // Kimlik her yerde görünür: pano, liste, takvim, raporlar, ayarlar.
  for (const p of ["/board", "/admin-board", "/list", "/calendar", "/home", "/settings", "/dashboard"]) {
    revalidatePath(p);
  }
  return { ok: true };
}
