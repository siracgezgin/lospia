"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage } from "@/lib/utils/supabase-errors";

// Üretim Föyü — yapısal üretim föyleri (production_sheets). Her ürün bir föy;
// ekip üyeleri (Gül, Selen) AYNI föye veri girebilir. "Kim girdi" föy düzeyinde:
// created_by sabit kalır, updated_by her kaydetmede güncellenir. RLS bu izin
// modelinin DB-katmanı güvencesidir (bkz. 20240212000000_production_sheets.sql).

const AUTH_REQUIRED = "Kimlik doğrulama gerekli.";
const NOT_FOUND = "Föy bulunamadı.";
const PERM_DENIED = "Bu işlem için yetkiniz yok.";
const ADMIN_ROLES: AppRole[] = ["owner", "admin"];

const measurementRow = z.object({
  no: z.string().max(20).default(""),
  label: z.string().max(300).default(""),
  value: z.string().max(120).default(""),
});
const deliveredItemRow = z.object({
  no: z.string().max(20).default(""),
  label: z.string().max(300).default(""),
  qty: z.string().max(120).default(""),
});
const sizeDistribution = z.object({
  sizes: z.array(z.string().max(20)).max(12).default([]),
  rows: z
    .array(
      z.object({
        label: z.string().max(200).default(""),
        values: z.array(z.string().max(40)).max(12).default([]),
        total: z.string().max(40).default(""),
      }),
    )
    .max(20)
    .default([]),
  // Beden grubu satırı: beden adı → "1" | "2" | "3" | "OS" (Aslı Hanım, 2026-08-19).
  groups: z.record(z.string().max(20), z.string().max(8)).optional(),
});

const productionImage = z.object({
  url: z.string().max(2000),
  path: z.string().max(500),
  section: z.enum([
    "technical_drawing", "technical_drawing_front", "technical_drawing_back",
    "fabric", "accessories", "embellishments", "sewing", "general",
  ]),
  caption: z.string().max(300).optional(),
});

const longText = z.string().max(8000).optional().nullable();
const shortText = z.string().max(500).optional().nullable();

const costItem = z.object({
  key: z.enum(["kumas", "dikim", "fermuar", "utu_paket", "kalip", "aksesuar", "genel_gider", "diger"]),
  label: z.string().max(120).optional(),
  amount: z.string().max(40).default(""),
});

const pricing = z.object({
  unit_price: z.string().max(40).optional().default(""),
  purchase_cost: z.string().max(40).optional().default(""),
  web_sale_price: z.string().max(40).optional().default(""),
  currency: z.string().max(10).optional().default("TL"),
  notes: z.string().max(500).optional().default(""),
  // Kalem kalem maliyet + ustaya birim ödeme (Aslı Hanım, 2026-08-19):
  // "Bu maliyet değil, bu ödeme tablosu. Maliyet her ürünün bir maliyetini
  // hesaplamaktır." İkisi AYRI alanlarda yaşar.
  cost_items: z.array(costItem).max(20).optional(),
  usta_unit_payment: z.string().max(40).optional(),
});

const SheetSchema = z.object({
  title: z.string().min(1, "Föy başlığı (ürün adı) gerekli").max(300),
  status: z.enum(["draft", "active", "archived"]).default("active"),
  product_code: shortText,
  product_kind: shortText,
  producer: shortText,
  // Gerçek usta kaydı (20240307). producer metni geri uyum için korunur.
  manufacturer_id: z.string().uuid().optional().nullable(),
  description: longText,
  season: shortText,
  production_date: shortText,
  delivery_date: shortText,
  sewing_delivery_date: shortText,
  meterage: shortText,
  measurements: z.array(measurementRow).max(60).default([]),
  delivered_items: z.array(deliveredItemRow).max(60).default([]),
  size_distribution: sizeDistribution.default({ sizes: [], rows: [] }),
  photo_refs: z.array(productionImage).max(60).default([]),
  wash_instruction: longText,
  fabric_lining: longText,
  fabric_info: longText,
  accessories_info: longText,
  embellishments: longText,
  sewing_instruction: longText,
  workmanship_notes: longText,
  qc_revision: longText,
  revision_notes: longText,
  production_waste: longText,
  category: z.enum(["one_of_a_kind", "ready_to_wear", "shoes", "accessories"]).nullable().optional(),
  subcategory: shortText,
  pricing: pricing.default({ unit_price: "", purchase_cost: "", web_sale_price: "", currency: "TL", notes: "" }),
});

export type ProductionSheetInput = z.infer<typeof SheetSchema>;

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
  return {
    userId: user.id,
    workspaceId: member.workspace_id as string,
    role: member.role as AppRole,
  };
}

type Ctx = NonNullable<Awaited<ReturnType<typeof getCtx>>>;
const isAdmin = (ctx: Ctx) => ADMIN_ROLES.includes(ctx.role);

/** Boş string → null; trim'li. */
function nn(s?: string | null): string | null {
  const t = (s ?? "").trim();
  return t.length ? t : null;
}

function normalize(v: ProductionSheetInput) {
  return {
    title: v.title.trim(),
    status: v.status,
    product_code: nn(v.product_code),
    product_kind: nn(v.product_kind),
    producer: nn(v.producer),
    manufacturer_id: v.manufacturer_id || null,
    description: nn(v.description),
    season: nn(v.season),
    production_date: nn(v.production_date),
    delivery_date: nn(v.delivery_date),
    sewing_delivery_date: nn(v.sewing_delivery_date),
    meterage: nn(v.meterage),
    measurements: v.measurements,
    delivered_items: v.delivered_items,
    size_distribution: v.size_distribution,
    photo_refs: v.photo_refs,
    wash_instruction: nn(v.wash_instruction),
    fabric_lining: nn(v.fabric_lining),
    fabric_info: nn(v.fabric_info),
    accessories_info: nn(v.accessories_info),
    embellishments: nn(v.embellishments),
    sewing_instruction: nn(v.sewing_instruction),
    workmanship_notes: nn(v.workmanship_notes),
    qc_revision: nn(v.qc_revision),
    revision_notes: nn(v.revision_notes),
    production_waste: nn(v.production_waste),
    category: v.category ?? null,
    subcategory: nn(v.subcategory),
    pricing: v.pricing ?? {},
  };
}

export async function createProductionSheet(
  input: ProductionSheetInput,
): Promise<{ id: string } | { error: string }> {
  const parsed = SheetSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const data = normalize(parsed.data);
  // Non-admin bir üye arşiv statüsüyle föy oluşturamaz.
  if (!isAdmin(ctx) && data.status === "archived") data.status = "active";

  const { data: row, error } = await supabase
    .from("production_sheets")
    .insert({
      workspace_id: ctx.workspaceId,
      created_by: ctx.userId,
      updated_by: ctx.userId,
      archived_at: data.status === "archived" ? new Date().toISOString() : null,
      ...data,
    })
    .select("id")
    .single();

  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/production");
  revalidatePath("/collection");
  return { id: (row as { id: string }).id };
}

export async function updateProductionSheet(
  sheetId: string,
  input: ProductionSheetInput,
): Promise<{ ok: true } | { error: string }> {
  const parsed = SheetSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  // Föyün var olduğunu ve workspace'e ait olduğunu doğrula (RLS zaten kısıtlar).
  const { data: existing, error: loadErr } = await supabase
    .from("production_sheets")
    .select("id, status")
    .eq("id", sheetId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (loadErr) return { error: toActionErrorMessage(loadErr) };
  if (!existing) return { error: NOT_FOUND };

  const data = normalize(parsed.data);
  // Statü/arşiv geçişleri yalnızca admin'e; üye içerik günceller ama statüyü
  // olduğu gibi bırakır.
  if (!isAdmin(ctx)) data.status = existing.status as ProductionSheetInput["status"];

  const { error } = await supabase
    .from("production_sheets")
    .update({
      ...data,
      updated_by: ctx.userId,
      archived_at: data.status === "archived" ? new Date().toISOString() : null,
    })
    .eq("id", sheetId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/production");
  revalidatePath("/collection");
  revalidatePath(`/production/${sheetId}`);
  return { ok: true };
}

// Yalnızca fiyat güncelle — Koleksiyon → Maliyet tablosundan hızlı geri yazma.
// Föyün geri kalanını dokunmadan bırakır (tek kaynak: pricing alanı hem föyde
// hem maliyet tablosunda aynı satırı okur/yazar).
/**
 * Föyü konfirme et / konfirmasyonu kaldır.
 *
 * Aslı Hanım (2026-08-21): "Onlar föyü hazırladıktan sonra Nisa'yla beraber
 * konfirme ederek bana göstermenizi istiyorum. Bir tane daha üretim föyü
 * revizesi vermek istemiyorum çünkü."
 *
 * Her ÜYE konfirme edebilir — akıştaki konfirme eden Nisa, yönetici değil.
 * Kimin konfirme ettiği kaydedilir. Föy sonradan değişirse damga veritabanı
 * trigger'ıyla düşer (20240308); burada ayrıca bir şey yapmak gerekmez.
 */
export async function setProductionSheetConfirmed(
  sheetId: string,
  confirmed: boolean,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { error, count } = await supabase
    .from("production_sheets")
    .update(
      confirmed
        ? { confirmed_at: new Date().toISOString(), confirmed_by: ctx.userId }
        : { confirmed_at: null, confirmed_by: null },
      { count: "exact" },
    )
    .eq("id", sheetId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };
  if (count === 0) return { error: NOT_FOUND };

  revalidatePath("/collection");
  revalidatePath(`/production/${sheetId}`);
  return { ok: true };
}

export async function updateProductionSheetPricing(
  sheetId: string,
  input: z.infer<typeof pricing>,
): Promise<{ ok: true } | { error: string }> {
  const parsed = pricing.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { data: existing, error: loadErr } = await supabase
    .from("production_sheets")
    .select("id")
    .eq("id", sheetId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (loadErr) return { error: toActionErrorMessage(loadErr) };
  if (!existing) return { error: NOT_FOUND };

  const { error } = await supabase
    .from("production_sheets")
    .update({ pricing: parsed.data, updated_by: ctx.userId })
    .eq("id", sheetId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/collection");
  revalidatePath("/collection/maliyet");
  revalidatePath(`/production/${sheetId}`);
  return { ok: true };
}

// Yalnızca beden dağılımı güncelle — Maliyet tablosundan beden adedi girişi.
// Adet (beden dağılımı) da tek kaynak: maliyette değişince föyde de değişir.
export async function updateProductionSheetSizeDistribution(
  sheetId: string,
  input: z.infer<typeof sizeDistribution>,
): Promise<{ ok: true } | { error: string }> {
  const parsed = sizeDistribution.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { data: existing, error: loadErr } = await supabase
    .from("production_sheets")
    .select("id")
    .eq("id", sheetId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (loadErr) return { error: toActionErrorMessage(loadErr) };
  if (!existing) return { error: NOT_FOUND };

  const { error } = await supabase
    .from("production_sheets")
    .update({ size_distribution: parsed.data, updated_by: ctx.userId })
    .eq("id", sheetId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/collection");
  revalidatePath("/collection/maliyet");
  revalidatePath(`/production/${sheetId}`);
  return { ok: true };
}

// Arşivle (admin) — hard delete yerine tercih edilir.
export async function archiveProductionSheet(
  sheetId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdmin(ctx)) return { error: PERM_DENIED };

  const { error } = await supabase
    .from("production_sheets")
    .update({ status: "archived", archived_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq("id", sheetId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/production");
  return { ok: true };
}

// Hard delete: admin her şeyi; üye yalnızca kendi draft'ı (RLS de kısıtlar).
export async function deleteProductionSheet(
  sheetId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { error } = await supabase
    .from("production_sheets")
    .delete()
    .eq("id", sheetId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/production");
  return { ok: true };
}

// Yalnızca görselleri (photo_refs) anında kaydeder — kullanıcı bir görsel
// ekleyip/kaldırınca "Kaydet"i beklemeden DB ile depo tutarlı kalsın diye.
export async function updateProductionSheetImages(
  sheetId: string,
  images: unknown,
): Promise<{ ok: true } | { error: string }> {
  const parsed = z.array(productionImage).max(60).safeParse(images);
  if (!parsed.success) return { error: "Görsel listesi okunamadı." };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { error } = await supabase
    .from("production_sheets")
    .update({ photo_refs: parsed.data, updated_by: ctx.userId })
    .eq("id", sheetId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/production");
  revalidatePath(`/production/${sheetId}`);
  return { ok: true };
}

// ── Görsel yükleme (Supabase Storage: production-sheets bucket) ───────────────
// Yol: production-sheets/{workspace_id}/{sheet_id}/{uuid}. Public bucket → render
// publicUrl ile. Yükleme/silme RLS ile workspace üyesine kısıtlı.
const IMAGE_BUCKET = "production-sheets";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];

export async function uploadProductionSheetImage(
  sheetId: string,
  formData: FormData,
): Promise<{ url: string; path: string } | { error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Dosya bulunamadı." };
  if (file.size > MAX_IMAGE_BYTES) return { error: "Görsel 5 MB sınırını aşıyor." };
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { error: "Yalnızca görsel dosyaları (PNG, JPG, WEBP) yüklenebilir." };
  }

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  // "new" föy için henüz id yok — geçici klasör kullan (kaydedince URL taşınır değil,
  // sadece referans photo_refs içinde tutulur; dosya yerinde kalır).
  const scope = sheetId && sheetId !== "new" ? sheetId : "unassigned";
  const path = `${ctx.workspaceId}/${scope}/${crypto.randomUUID()}`;

  const { error: upErr } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { error: upErr.message };

  const { data: { publicUrl } } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
  return { url: publicUrl, path };
}

export async function deleteProductionSheetImage(
  path: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  // Path her zaman {workspace_id}/... ile başlar — kendi workspace'i dışına silme yok.
  if (!path.startsWith(`${ctx.workspaceId}/`)) return { error: PERM_DENIED };

  const { error } = await supabase.storage.from(IMAGE_BUCKET).remove([path]);
  if (error) return { error: error.message };
  return { ok: true };
}
