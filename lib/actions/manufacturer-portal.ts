"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage, isMissingSchemaError } from "@/lib/utils/supabase-errors";

/**
 * ÜRETİCİ PANELİ — föye özel dış erişim bağlantısı (20240339).
 *
 * Aslı Hanım (2026-09-07): "Sabri Bey bizim üreticimiz olacağı için ÜRETİCİYE
 * DE BİR PANEL verebilirsin. Çünkü ürünün detaylarını girip buradan alabilir
 * veya direkt mail gidebilir."
 *
 * Sabri Bey ekip üyesi DEĞİL. Ona bir hesap açmak, `is_workspace_member()`
 * üzerine kurulu bütün RLS'i (finans, pano, CRM…) ona açardı. Bu yüzden erişim
 * hesapla değil BAĞLANTIYLA verilir: tek föy, fiyatsız, süreli, iptal
 * edilebilir. Panelin kendisi iki SECURITY DEFINER fonksiyondan okur/yazar —
 * servis anahtarı kullanılmaz, tek bir RLS politikası gevşetilmez.
 *
 * Bağlantı üretmek YALNIZ yöneticide: dışarıya kapı açmak bir yönetim işidir.
 */

const AUTH_REQUIRED = "Kimlik doğrulama gerekli.";
const ADMIN_ONLY = "Üretici bağlantısını yalnız yöneticiler oluşturabilir.";
const SETUP_PENDING =
  "Üretici paneli için veritabanı güncellemesi bekleniyor (20240339).";

const isAdminRole = (r: AppRole) => r === "owner" || r === "admin";

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

const CreateSchema = z.object({
  manufacturer_name: z.string().trim().max(200).optional().nullable(),
  email: z.string().trim().email("Geçersiz e-posta").max(200).optional().or(z.literal("")).nullable(),
  can_write: z.boolean().default(true),
  /** Kaç gün geçerli olsun. 0 ya da boş → süresiz (yine iptal edilebilir). */
  days: z.number().int().min(0).max(365).default(30),
});
export type PortalLinkInput = z.input<typeof CreateSchema>;

/** URL'de taşınacak gizli anahtar — 32 bayt, base64url. */
function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createManufacturerLink(
  sheetId: string,
  input: PortalLinkInput,
): Promise<{ token: string } | { error: string }> {
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdminRole(ctx.role)) return { error: ADMIN_ONLY };

  /* Föy bu çalışma alanına mı ait? RLS zaten koruyor ama hata mesajı
     "bulunamadı" olsun diye açıkça sorulur. */
  const { data: sheet } = await supabase
    .from("production_sheets")
    .select("id, confirmed_at")
    .eq("id", sheetId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!sheet) return { error: "Föy bulunamadı." };

  /* KONFİRME ŞARTI — mail yolundaki kuralın aynısı. Aslı Hanım (2026-08-21):
     "Üreticiye gidecek dosyanın EKSİKSİZ olmasını istiyorum." Panel de dışarı
     açılan bir kapıdır; eksik föy oradan da çıkmaz. */
  if (!(sheet as { confirmed_at: string | null }).confirmed_at) {
    return { error: "Föy konfirme edilmeden üretici paneli açılamaz. Önce föyü kontrol edip konfirme edin." };
  }

  const v = parsed.data;
  const token = newToken();
  const expires =
    v.days && v.days > 0
      ? new Date(Date.now() + v.days * 86_400_000).toISOString()
      : null;

  const { error } = await supabase.from("production_portal_links").insert({
    workspace_id: ctx.workspaceId,
    sheet_id: sheetId,
    token,
    manufacturer_name: v.manufacturer_name?.trim() || null,
    email: v.email?.trim() || null,
    can_write: v.can_write,
    expires_at: expires,
    created_by: ctx.userId,
  });
  if (error) {
    if (isMissingSchemaError(error)) return { error: SETUP_PENDING };
    return { error: toActionErrorMessage(error) };
  }

  revalidatePath(`/production/${sheetId}`);
  return { token };
}

/** Bağlantıyı KAPATIR. Silmek yerine iptal: kimin ne zaman açtığı iz kalır. */
export async function revokeManufacturerLink(
  linkId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdminRole(ctx.role)) return { error: ADMIN_ONLY };

  const { data, error } = await supabase
    .from("production_portal_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId)
    .eq("workspace_id", ctx.workspaceId)
    .select("sheet_id")
    .maybeSingle();
  if (error) {
    if (isMissingSchemaError(error)) return { error: SETUP_PENDING };
    return { error: toActionErrorMessage(error) };
  }
  const sheetId = (data as { sheet_id: string } | null)?.sheet_id;
  if (sheetId) revalidatePath(`/production/${sheetId}`);
  return { ok: true };
}

/* ── PANELİN KENDİSİ — token ile okur/yazar ─────────────────────────────────
   Bu iki fonksiyon OTURUMSUZ çağrılır (üreticinin hesabı yok). Yetki
   kontrolünü SECURITY DEFINER fonksiyonlar yapar: geçersiz, iptal edilmiş ya
   da süresi dolmuş token hiçbir veri döndürmez. */

export type PortalPayload = {
  ok: true;
  can_write: boolean;
  manufacturer_name: string | null;
  sheet: Record<string, unknown>;
  bom: Record<string, unknown>[];
  notes: { body: string; author: string | null; at: string }[];
};
export type PortalDenied = { ok: false; reason: "not_found" | "revoked" | "expired" | "setup" };

export async function openManufacturerPortal(token: string): Promise<PortalPayload | PortalDenied> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("production_portal_open", { p_token: token });
  if (error) {
    return { ok: false, reason: isMissingSchemaError(error) ? "setup" : "not_found" };
  }
  const payload = data as PortalPayload | PortalDenied | null;
  if (!payload) return { ok: false, reason: "not_found" };
  return payload;
}

export async function addManufacturerNote(
  token: string,
  body: string,
  author?: string | null,
): Promise<{ ok: true } | { error: string }> {
  const trimmed = (body ?? "").trim();
  if (!trimmed) return { error: "Boş not gönderilemez." };
  if (trimmed.length > 4000) return { error: "Not çok uzun (en fazla 4000 karakter)." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("production_portal_add_note", {
    p_token: token,
    p_body: trimmed,
    p_author: (author ?? "").trim() || null,
  });
  if (error) {
    return { error: isMissingSchemaError(error) ? SETUP_PENDING : toActionErrorMessage(error) };
  }
  const res = data as { ok: boolean; reason?: string } | null;
  if (!res?.ok) {
    return {
      error:
        res?.reason === "denied"
          ? "Bu bağlantı kapatılmış ya da süresi dolmuş. Lütfen ekiple iletişime geçin."
          : "Not kaydedilemedi.",
    };
  }
  return { ok: true };
}
