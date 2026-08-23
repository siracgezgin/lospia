"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage } from "@/lib/utils/supabase-errors";

// Üretici (Usta) — Aslı Hanım'ın "Cihan Usta, Hakan Usta" isteğinin veri
// karşılığı. Okuma tüm üyelere açık, yazma yalnız yönetici (RLS 20240307 ile
// aynı model; burada da guard var — savunma iki katmanlı).

const AUTH_REQUIRED = "Kimlik doğrulama gerekli.";
const ADMIN_ONLY = "Üretici listesini yalnız yöneticiler düzenleyebilir.";
const NOT_FOUND = "Üretici bulunamadı.";

const nn = (v?: string | null) => {
  const t = (v ?? "").trim();
  return t.length ? t : null;
};
/** Boş metin → null; sayı değilse null (form alanları serbest metin gelir). */
const nInt = (v?: string | number | null) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};

const ManufacturerSchema = z.object({
  name: z.string().min(1, "Usta adı gerekli.").max(200),
  photo_url: z.string().max(2000).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  country: z.string().max(120).optional().nullable(),
  currency: z.string().max(10).default("TL"),
  lead_time_days: z.union([z.string(), z.number()]).optional().nullable(),
  min_order_qty: z.union([z.string(), z.number()]).optional().nullable(),
  contact_name: z.string().max(200).optional().nullable(),
  phone: z.string().max(60).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  is_active: z.boolean().default(true),
});
export type ManufacturerInput = z.infer<typeof ManufacturerSchema>;

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

function payloadOf(v: ManufacturerInput) {
  return {
    name: v.name.trim(),
    photo_url: nn(v.photo_url),
    city: nn(v.city),
    country: nn(v.country),
    currency: (v.currency || "TL").trim(),
    lead_time_days: nInt(v.lead_time_days),
    min_order_qty: nInt(v.min_order_qty),
    contact_name: nn(v.contact_name),
    phone: nn(v.phone),
    email: nn(v.email),
    notes: nn(v.notes),
    is_active: v.is_active,
  };
}

/** Föy ve Ödeme Tablosu aynı listeyi görsün diye ortak revalidate seti. */
function revalidateAll() {
  revalidatePath("/collection");
  revalidatePath("/collection/odeme");
  revalidatePath("/collection/maliyet");
  revalidatePath("/settings");
}

export async function createManufacturer(
  input: ManufacturerInput,
): Promise<{ id: string } | { error: string }> {
  const parsed = ManufacturerSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdmin(ctx.role)) return { error: ADMIN_ONLY };

  const { data, error } = await supabase
    .from("workspace_manufacturers")
    .insert({
      workspace_id: ctx.workspaceId,
      ...payloadOf(parsed.data),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();
  // Aynı ad benzersiz (workspace_id, name) — kullanıcıya anlaşılır mesaj ver.
  if (error) {
    if (error.code === "23505") return { error: "Bu adda bir usta zaten var (büyük/küçük harf farkı aynı sayılır)." };
    return { error: toActionErrorMessage(error) };
  }
  revalidateAll();
  return { id: (data as { id: string }).id };
}

export async function updateManufacturer(
  id: string,
  input: ManufacturerInput,
): Promise<{ ok: true } | { error: string }> {
  const parsed = ManufacturerSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdmin(ctx.role)) return { error: ADMIN_ONLY };

  const { error, count } = await supabase
    .from("workspace_manufacturers")
    .update({ ...payloadOf(parsed.data), updated_by: ctx.userId }, { count: "exact" })
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId);
  if (error) {
    if (error.code === "23505") return { error: "Bu adda bir usta zaten var (büyük/küçük harf farkı aynı sayılır)." };
    return { error: toActionErrorMessage(error) };
  }
  if (count === 0) return { error: NOT_FOUND };
  revalidateAll();
  return { ok: true };
}

/**
 * Usta silme. Föye bağlıysa SİLMEZ — pasife almayı önerir. Böylece geçmiş
 * ödeme kayıtları ve föy geçmişi kopmaz (FK zaten `set null`, ama sessizce
 * kopmasındansa kullanıcıya söylemek doğru).
 */
export async function deleteManufacturer(
  id: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdmin(ctx.role)) return { error: ADMIN_ONLY };

  const { count } = await supabase
    .from("production_sheets")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", ctx.workspaceId)
    .eq("manufacturer_id", id);
  if ((count ?? 0) > 0) {
    return {
      error: `Bu ustaya bağlı ${count} föy var. Silmek yerine “Pasif” yapın — geçmiş kayıtlar korunur.`,
    };
  }

  const { error } = await supabase
    .from("workspace_manufacturers")
    .delete()
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };
  revalidateAll();
  return { ok: true };
}

/**
 * Föy düzenleyicisindeki "yeni usta" kısayolu: ad verilir, varsa mevcut kayıt
 * döner, yoksa oluşturulur. Ödeme Tablosu'nun aynı ustayı iki kez göstermesini
 * engelleyen tek nokta burasıdır.
 */
export async function ensureManufacturer(
  name: string,
): Promise<{ id: string } | { error: string }> {
  const clean = name.trim();
  if (!clean) return { error: "Usta adı gerekli." };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdmin(ctx.role)) return { error: ADMIN_ONLY };

  const { data: existing } = await supabase
    .from("workspace_manufacturers")
    .select("id")
    .eq("workspace_id", ctx.workspaceId)
    .eq("name", clean)
    .maybeSingle();
  if (existing) return { id: (existing as { id: string }).id };

  return createManufacturer({ name: clean, currency: "TL", is_active: true });
}
