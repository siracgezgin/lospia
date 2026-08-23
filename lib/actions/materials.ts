"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage } from "@/lib/utils/supabase-errors";

// Hammadde kütüphanesi + Tedarikçi + Reçete (BOM) — 20240310.
// Aslı Hanım'ın "kumaşın fiyatına ayrı giriyorsun" isteğinin yapısal hâli:
// malzeme bir kez tanımlanır, föyler ona bağlanır, maliyet hesaplanır.

const AUTH_REQUIRED = "Kimlik doğrulama gerekli.";
const ADMIN_ONLY = "Bu listeyi yalnız yöneticiler düzenleyebilir.";
const NOT_FOUND = "Kayıt bulunamadı.";

const nn = (v?: string | null) => {
  const t = (v ?? "").trim();
  return t.length ? t : null;
};
/**
 * Serbest metin → sayı. Kural projedeki parseMoney ile AYNI:
 * nokta binlik ayracı SAYILMAZ, virgül varsa noktalar binliktir.
 *   "1.6"     → 1.6    (ondalık nokta — sayısal klavyeyle yazılan hâli)
 *   "1,6"     → 1.6    (Türkçe ondalık)
 *   "1.800,5" → 1800.5
 * İlk sürümde noktalar koşulsuz siliniyordu; "1.6" tüketim 16 olarak okunup
 * maliyet on kat çıkıyordu (2026-08-23 uçtan uca testte yakalandı).
 */
const nNum = (v?: string | number | null) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[^\d.,-]/g, "").trim();
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

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

/** Malzeme fiyatı değişince TÜM maliyet ekranları etkilenir. */
function revalidateAll(sheetId?: string) {
  revalidatePath("/collection");
  revalidatePath("/collection/maliyet");
  revalidatePath("/collection/odeme");
  revalidatePath("/settings");
  if (sheetId) revalidatePath(`/production/${sheetId}`);
}

// ── Tedarikçi ───────────────────────────────────────────────────────────────

const SupplierSchema = z.object({
  name: z.string().min(1, "Tedarikçi adı gerekli.").max(200),
  city: z.string().max(120).optional().nullable(),
  currency: z.string().max(10).default("TL"),
  lead_time_days: z.union([z.string(), z.number()]).optional().nullable(),
  contact_name: z.string().max(200).optional().nullable(),
  phone: z.string().max(60).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  is_active: z.boolean().default(true),
});
export type SupplierInput = z.infer<typeof SupplierSchema>;

export async function saveSupplier(
  id: string | null,
  input: SupplierInput,
): Promise<{ id: string } | { error: string }> {
  const parsed = SupplierSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdmin(ctx.role)) return { error: ADMIN_ONLY };

  const v = parsed.data;
  const payload = {
    name: v.name.trim(),
    city: nn(v.city),
    currency: (v.currency || "TL").trim(),
    lead_time_days: nNum(v.lead_time_days),
    contact_name: nn(v.contact_name),
    phone: nn(v.phone),
    email: nn(v.email),
    notes: nn(v.notes),
    is_active: v.is_active,
    updated_by: ctx.userId,
  };

  if (id) {
    const { error, count } = await supabase
      .from("workspace_suppliers")
      .update(payload, { count: "exact" })
      .eq("id", id).eq("workspace_id", ctx.workspaceId);
    if (error) return { error: error.code === "23505" ? "Bu adda bir tedarikçi zaten var (büyük/küçük harf farkı aynı sayılır)." : toActionErrorMessage(error) };
    if (count === 0) return { error: NOT_FOUND };
    revalidateAll();
    return { id };
  }

  const { data, error } = await supabase
    .from("workspace_suppliers")
    .insert({ workspace_id: ctx.workspaceId, ...payload, created_by: ctx.userId })
    .select("id").single();
  if (error) return { error: error.code === "23505" ? "Bu adda bir tedarikçi zaten var (büyük/küçük harf farkı aynı sayılır)." : toActionErrorMessage(error) };
  revalidateAll();
  return { id: (data as { id: string }).id };
}

export async function deleteSupplier(id: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdmin(ctx.role)) return { error: ADMIN_ONLY };

  const { count } = await supabase
    .from("workspace_materials")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", ctx.workspaceId).eq("supplier_id", id);
  if ((count ?? 0) > 0) {
    return { error: `Bu tedarikçiye bağlı ${count} malzeme var. Silmek yerine “Pasif” yapın.` };
  }
  const { error } = await supabase
    .from("workspace_suppliers").delete()
    .eq("id", id).eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };
  revalidateAll();
  return { ok: true };
}

// ── Hammadde ────────────────────────────────────────────────────────────────

const MaterialSchema = z.object({
  code: z.string().max(60).optional().nullable(),
  name: z.string().min(1, "Malzeme adı gerekli.").max(200),
  category: z.enum(["kumas", "aksesuar", "fermuar", "tela", "iplik", "etiket", "diger"]).default("kumas"),
  supplier_id: z.string().uuid().optional().nullable(),
  composition: z.string().max(500).optional().nullable(),
  width_cm: z.union([z.string(), z.number()]).optional().nullable(),
  unit: z.enum(["m", "adet", "kg", "takım", "paket"]).default("m"),
  unit_price: z.union([z.string(), z.number()]).optional().nullable(),
  currency: z.string().max(10).default("TL"),
  photo_url: z.string().max(2000).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  is_active: z.boolean().default(true),
});
export type MaterialInput = z.infer<typeof MaterialSchema>;

export async function saveMaterial(
  id: string | null,
  input: MaterialInput,
): Promise<{ id: string } | { error: string }> {
  const parsed = MaterialSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdmin(ctx.role)) return { error: ADMIN_ONLY };

  const v = parsed.data;
  const payload = {
    code: nn(v.code),
    name: v.name.trim(),
    category: v.category,
    supplier_id: v.supplier_id || null,
    composition: nn(v.composition),
    width_cm: nNum(v.width_cm),
    unit: v.unit,
    unit_price: nNum(v.unit_price),
    currency: (v.currency || "TL").trim(),
    photo_url: nn(v.photo_url),
    notes: nn(v.notes),
    is_active: v.is_active,
    updated_by: ctx.userId,
  };

  if (id) {
    const { error, count } = await supabase
      .from("workspace_materials")
      .update(payload, { count: "exact" })
      .eq("id", id).eq("workspace_id", ctx.workspaceId);
    if (error) return { error: error.code === "23505" ? "Bu adda bir malzeme zaten var (büyük/küçük harf farkı aynı sayılır)." : toActionErrorMessage(error) };
    if (count === 0) return { error: NOT_FOUND };
    revalidateAll();
    return { id };
  }

  const { data, error } = await supabase
    .from("workspace_materials")
    .insert({ workspace_id: ctx.workspaceId, ...payload, created_by: ctx.userId })
    .select("id").single();
  if (error) return { error: error.code === "23505" ? "Bu adda bir malzeme zaten var (büyük/küçük harf farkı aynı sayılır)." : toActionErrorMessage(error) };
  revalidateAll();
  return { id: (data as { id: string }).id };
}

export async function deleteMaterial(id: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdmin(ctx.role)) return { error: ADMIN_ONLY };

  // FK zaten `restrict` — ama ham hata yerine anlaşılır mesaj verelim.
  const { count } = await supabase
    .from("production_sheet_materials")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", ctx.workspaceId).eq("material_id", id);
  if ((count ?? 0) > 0) {
    return { error: `Bu malzeme ${count} föyün reçetesinde kullanılıyor. Silmek yerine “Pasif” yapın.` };
  }
  const { error } = await supabase
    .from("workspace_materials").delete()
    .eq("id", id).eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };
  revalidateAll();
  return { ok: true };
}

// ── Reçete (BOM) ────────────────────────────────────────────────────────────

export async function addSheetMaterial(
  sheetId: string,
  materialId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdmin(ctx.role)) return { error: ADMIN_ONLY };

  const { error } = await supabase.from("production_sheet_materials").insert({
    workspace_id: ctx.workspaceId,
    sheet_id: sheetId,
    material_id: materialId,
    consumption: 0,
    waste_pct: 0,
    created_by: ctx.userId,
  });
  if (error) {
    if (error.code === "23505") return { error: "Bu malzeme reçetede zaten var." };
    return { error: toActionErrorMessage(error) };
  }
  revalidateAll(sheetId);
  return { ok: true };
}

export async function updateSheetMaterial(
  id: string,
  patch: { consumption?: string | number; waste_pct?: string | number; note?: string | null },
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdmin(ctx.role)) return { error: ADMIN_ONLY };

  const payload: Record<string, unknown> = {};
  if (patch.consumption !== undefined) payload.consumption = nNum(patch.consumption) ?? 0;
  if (patch.waste_pct !== undefined) payload.waste_pct = nNum(patch.waste_pct) ?? 0;
  if (patch.note !== undefined) payload.note = nn(patch.note);

  const { data, error } = await supabase
    .from("production_sheet_materials")
    .update(payload)
    .eq("id", id).eq("workspace_id", ctx.workspaceId)
    .select("sheet_id").maybeSingle();
  if (error) return { error: toActionErrorMessage(error) };
  if (!data) return { error: NOT_FOUND };
  revalidateAll((data as { sheet_id: string }).sheet_id);
  return { ok: true };
}

export async function removeSheetMaterial(id: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdmin(ctx.role)) return { error: ADMIN_ONLY };

  const { data } = await supabase
    .from("production_sheet_materials")
    .select("sheet_id").eq("id", id).eq("workspace_id", ctx.workspaceId).maybeSingle();
  const { error } = await supabase
    .from("production_sheet_materials").delete()
    .eq("id", id).eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };
  revalidateAll((data as { sheet_id: string } | null)?.sheet_id);
  return { ok: true };
}
