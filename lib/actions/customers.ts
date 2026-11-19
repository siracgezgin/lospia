"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCustomerAccess } from "@/lib/customers/access";
import { toActionErrorMessage, isMissingSchemaError } from "@/lib/utils/supabase-errors";

/**
 * MÜŞTERİ CRM'i (20240379) — kişi ekleme ve düzeltme.
 *
 * Kapı her eylemde yeniden sorulur (izin listesi); RLS de aynı kapıyı tutar.
 * SİLME YOK: hatalı adres ve abonelikten çıkan kişi kayıtta işaretlenir.
 * A+ katmanını yalnız yetkili kişi verir — burada ve veritabanı tetikleyicisinde.
 */

const DENIED = "Bu alan size açık değil.";
const SETUP_PENDING = "Müşteri listesi için veritabanı güncellemesi bekleniyor (20240379).";
const TOP_ONLY = "A+ katmanını yalnız yetkili kişi değiştirebilir.";

const text = (max: number) => z.string().trim().max(max);
const Schema = z.object({
  full_name: text(200),
  email: text(320).transform((v) => v.toLowerCase()).refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "E-posta adresi geçersiz."),
  phone: text(60),
  city: text(120),
  tier: z.enum(["A+", "A", "B", "C", "D"]),
  source: z.enum(["site", "magaza", "elle"]),
  last_activity: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  email_consent: z.enum(["var", "yok", "bilinmiyor"]),
  email_status: z.enum(["ok", "hatali", "cikti"]),
  note: text(4000),
});
export type CustomerInput = z.input<typeof Schema>;

const dbError = (e: { message?: string; code?: string }) =>
  isMissingSchemaError(e) ? SETUP_PENDING
  : e.code === "23505" ? "Bu e-posta adresi zaten kayıtlı."
  : e.code === "42501" && /A\+/.test(e.message ?? "") ? TOP_ONLY
  : toActionErrorMessage(e);

export async function createCustomer(input: CustomerInput): Promise<{ ok: true; id: string } | { error: string }> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Geçersiz alan." };
  if (!parsed.data.full_name && !parsed.data.email && !parsed.data.phone) return { error: "Ad, e-posta ya da telefon yazın." };
  const ctx = await requireCustomerAccess();
  if (ctx.gate !== "ok" || !ctx.user || !ctx.workspaceId) return { error: DENIED };
  if (parsed.data.tier === "A+" && !ctx.canMarkTop) return { error: TOP_ONLY };

  const { data, error } = await ctx.supabase
    .from("customers")
    .insert({ ...parsed.data, workspace_id: ctx.workspaceId, created_by: ctx.user.id, updated_by: ctx.user.id })
    .select("id")
    .single();
  if (error) return { error: dbError(error) };
  revalidatePath("/customers");
  return { ok: true, id: (data as { id: string }).id };
}

export async function updateCustomer(id: string, patch: Partial<CustomerInput>): Promise<{ ok: true } | { error: string }> {
  if (!z.string().min(1).max(64).safeParse(id).success) return { error: "Geçersiz kayıt." };
  const parsed = Schema.partial().safeParse(patch);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Geçersiz alan." };
  const ctx = await requireCustomerAccess();
  if (ctx.gate !== "ok" || !ctx.user || !ctx.workspaceId) return { error: DENIED };

  if (parsed.data.tier !== undefined && !ctx.canMarkTop) {
    const { data: cur } = await ctx.supabase.from("customers").select("tier").eq("id", id).eq("workspace_id", ctx.workspaceId).maybeSingle();
    const was = (cur as { tier: string } | null)?.tier;
    if ((was === "A+") !== (parsed.data.tier === "A+")) return { error: TOP_ONLY };
  }

  const { data, error } = await ctx.supabase
    .from("customers")
    .update({ ...parsed.data, updated_by: ctx.user.id })
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .select("id");
  if (error) return { error: dbError(error) };
  if (!data?.length) return { error: "Kayıt bulunamadı." };
  revalidatePath("/customers");
  return { ok: true };
}
