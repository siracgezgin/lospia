"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage } from "@/lib/utils/supabase-errors";

// Finans — Ödeme Takibi. Excel "Finans Ödeme Tablo" sekmesinin karşılığı.
// Tablo RLS'i zaten admin-only; buradaki rol kontrolü net hata mesajı için.

const AUTH_REQUIRED = "Kimlik doğrulama gerekli.";
const ADMIN_ONLY = "Finans kayıtları yalnız yöneticilere açık.";
/* Kayıt bulunamadı = ya silinmiş ya da başka bir çalışma alanına ait.
   Supabase 0 satırlık update/delete'i hata saymaz; sessiz "başarı" olmasın. */
const NOT_FOUND = "Ödeme kaydı bulunamadı — sayfayı yenileyin.";

const isAdminRole = (r: AppRole) => r === "owner" || r === "admin";

/**
 * Bugün — İSTANBUL günü ("yyyy-MM-dd").
 *
 * `new Date().toISOString()` UTC'ye çevirir: İstanbul UTC+3 olduğu için gece
 * 00:00–03:00 arasında "Ödendi" işaretlenen kayda BİR GÜN ÖNCE damgalanıyordu.
 * Sunucunun kendi saat dilimine de güvenilmez (dağıtım ortamı UTC'dir), bu
 * yüzden bölge açıkça yazılır — lib/planning/timezones.ts ile aynı desen.
 * `en-CA` biçimi zaten "yyyy-MM-dd" verir.
 */
const ISTANBUL_TODAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Istanbul",
  year: "numeric", month: "2-digit", day: "2-digit",
});
const todayInIstanbul = () => ISTANBUL_TODAY_FMT.format(new Date());

const PaymentSchema = z.object({
  id: z.string().max(64).optional().nullable(),
  title: z.string().min(1, "Başlık gerekli.").max(300),
  payee: z.string().max(300).optional().nullable(),
  /* Hata metinleri TÜRKÇE yazılır: zod varsayılanları ("Number must be greater
     than or equal to 0") doğrudan kullanıcıya çıkıyordu. */
  amount: z
    .number("Tutar sayı olmalı.")
    .min(0, "Tutar negatif olamaz.")
    .max(999_999_999, "Tutar çok büyük.")
    .optional()
    .nullable(),
  currency: z.string().min(1).max(8).default("TRY"),
  status: z.enum(["bekliyor", "odendi"]).default("bekliyor"),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Geçersiz vade tarihi.")
    .optional()
    .nullable(),
  category: z.string().max(120, "Etiket çok uzun.").optional().nullable(),
  notes: z.string().max(4000, "Not çok uzun.").optional().nullable(),
});
export type PaymentInput = z.infer<typeof PaymentSchema>;

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

const nn = (s?: string | null) => {
  const t = (s ?? "").trim();
  return t.length ? t : null;
};

/** Ödeme ekle/güncelle. Durum "odendi"ye çekilirse paid_at bugüne damgalanır. */
export async function savePayment(
  input: PaymentInput,
): Promise<{ id: string } | { error: string }> {
  const parsed = PaymentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdminRole(ctx.role)) return { error: ADMIN_ONLY };

  const v = parsed.data;
  const payload = {
    title: v.title.trim(),
    payee: nn(v.payee),
    amount: v.amount ?? null,
    currency: v.currency,
    status: v.status,
    due_date: v.due_date ?? null,
    paid_at: v.status === "odendi" ? todayInIstanbul() : null,
    category: nn(v.category),
    notes: nn(v.notes),
    updated_by: ctx.userId,
  };

  if (v.id) {
    // Zaten ödenmiş bir kaydın paid_at'i korunur (yeniden damgalanmaz).
    const { data: cur } = await supabase
      .from("finance_payments")
      .select("status, paid_at")
      .eq("id", v.id)
      .eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    if (cur?.status === "odendi" && v.status === "odendi" && cur.paid_at) {
      payload.paid_at = cur.paid_at as string;
    }
    const { data: updated, error } = await supabase
      .from("finance_payments")
      .update(payload)
      .eq("id", v.id)
      .eq("workspace_id", ctx.workspaceId)
      .select("id");
    if (error) return { error: toActionErrorMessage(error) };
    if (!updated || updated.length === 0) return { error: NOT_FOUND };
    revalidatePath("/finance");
    return { id: v.id };
  }

  const { data, error } = await supabase
    .from("finance_payments")
    .insert({ ...payload, workspace_id: ctx.workspaceId, created_by: ctx.userId })
    .select("id")
    .single();
  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/finance");
  return { id: (data as { id: string }).id };
}

/** Durumu hızlı değiştir (satırdaki tek tık). */
export async function setPaymentStatus(
  paymentId: string,
  status: "bekliyor" | "odendi",
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdminRole(ctx.role)) return { error: ADMIN_ONLY };
  const { data: updated, error } = await supabase
    .from("finance_payments")
    .update({
      status,
      paid_at: status === "odendi" ? todayInIstanbul() : null,
      updated_by: ctx.userId,
    })
    .eq("id", paymentId)
    .eq("workspace_id", ctx.workspaceId)
    .select("id");
  if (error) return { error: toActionErrorMessage(error) };
  if (!updated || updated.length === 0) return { error: NOT_FOUND };
  revalidatePath("/finance");
  return { ok: true };
}

export async function deletePayment(
  paymentId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdminRole(ctx.role)) return { error: ADMIN_ONLY };
  const { data: removed, error } = await supabase
    .from("finance_payments")
    .delete()
    .eq("id", paymentId)
    .eq("workspace_id", ctx.workspaceId)
    .select("id");
  if (error) return { error: toActionErrorMessage(error) };
  if (!removed || removed.length === 0) return { error: NOT_FOUND };
  revalidatePath("/finance");
  return { ok: true };
}
