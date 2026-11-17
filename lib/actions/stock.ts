"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage, isMissingSchemaError } from "@/lib/utils/supabase-errors";
import { decodeEntities, WEBSITE_BASE } from "@/lib/collection/website";
import { normalizeSize } from "@/lib/stock/model";

/**
 * STOK (20240373) — ürün kaydı ve HAREKET defteri.
 *
 * Eldeki adet hiçbir yerde elle yazılmaz: her işlem bir hareket satırı ekler,
 * adet o satırların toplamıdır. Satış/çıkış/transfer eldekinden fazlasını
 * düşemez; rakam yanlışsa önce SAYIM yapılır (fark hareket olarak yazılır,
 * geçmiş kaybolmaz). Müşteri bilgisi tutulmaz (KVKK).
 */

const AUTH_REQUIRED = "Kimlik doğrulama gerekli.";
const READ_ONLY = "İzleyici rolü stoğu değiştiremez.";
const ADMIN_ONLY = "Bu işlem yöneticiye açık.";
const SETUP_PENDING = "Stok için veritabanı güncellemesi bekleniyor (20240373).";

type Sb = Awaited<ReturnType<typeof createClient>>;

async function getCtx(supabase: Sb) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!member) return null;
  const role = member.role as AppRole;
  return { userId: user.id, workspaceId: member.workspace_id as string, role, isAdmin: role === "owner" || role === "admin" };
}

const dbError = (e: { message?: string; code?: string }) =>
  isMissingSchemaError(e) ? SETUP_PENDING
  : e.code === "23505" ? "Bu ürün kodu zaten kayıtlı."
  : toActionErrorMessage(e);

/* Tohumlanmış kimlikler z.uuid()'den geçmiyor — biçim yerine uzunluk sınanır. */
const id = z.string().min(1).max(64);

/* ── Ürün ───────────────────────────────────────────────────────────────── */

const ProductSchema = z.object({
  name: z.string().trim().min(1, "Ürün adı boş olamaz.").max(300),
  code: z.string().trim().max(80).optional(),
  barcode: z.string().trim().max(80).optional(),
  price: z.number().min(0).max(99_999_999).nullable().optional(),
  image_url: z.string().trim().max(1000).optional(),
  web_url: z.string().trim().max(1000).optional(),
  web_product_id: z.number().int().nullable().optional(),
});

export type StockProductInput = z.input<typeof ProductSchema>;

export async function createStockProduct(input: StockProductInput): Promise<{ ok: true; id: string } | { error: string }> {
  const parsed = ProductSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Geçersiz alan." };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (ctx.role === "viewer") return { error: READ_ONLY };

  const { data, error } = await supabase
    .from("stock_products")
    .insert({ ...parsed.data, workspace_id: ctx.workspaceId, created_by: ctx.userId, updated_by: ctx.userId })
    .select("id")
    .single();
  if (error) return { error: dbError(error) };
  revalidatePath("/stock");
  return { ok: true, id: (data as { id: string }).id };
}

export async function updateStockProduct(
  productId: string,
  patch: Partial<StockProductInput> & { active?: boolean },
): Promise<{ ok: true } | { error: string }> {
  const parsed = ProductSchema.partial().extend({ active: z.boolean().optional() }).safeParse(patch);
  if (!parsed.success || !id.safeParse(productId).success) return { error: parsed.success ? "Geçersiz ürün." : parsed.error.issues[0]?.message ?? "Geçersiz alan." };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (ctx.role === "viewer") return { error: READ_ONLY };

  const { error } = await supabase
    .from("stock_products")
    .update({ ...parsed.data, updated_by: ctx.userId })
    .eq("id", productId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: dbError(error) };
  revalidatePath("/stock");
  return { ok: true };
}

/* ── Hareket ────────────────────────────────────────────────────────────── */

const MovementSchema = z.object({
  product_id: id,
  location_id: id,
  size: z.string().trim().min(1, "Beden seçin.").max(30),
  kind: z.enum(["giris", "satis", "iade", "transfer", "sayim", "cikis"]),
  /** Kullanıcının yazdığı adet. Sayımda SAYILAN rakam (0 olabilir). */
  qty: z.number().int().min(0).max(100_000),
  unit_price: z.number().min(0).max(99_999_999).nullable().optional(),
  note: z.string().trim().max(500).optional(),
  /** Yalnız transferde: stoğun gideceği yer. */
  to_location_id: id.optional(),
});

export type StockMovementInput = z.input<typeof MovementSchema>;

export async function recordStockMovement(input: StockMovementInput): Promise<{ ok: true } | { error: string }> {
  const parsed = MovementSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Geçersiz alan." };
  const m = parsed.data;
  const size = normalizeSize(m.size);
  if (m.kind !== "sayim" && m.qty < 1) return { error: "Adet en az 1 olmalı." };
  if (m.kind === "transfer" && (!m.to_location_id || m.to_location_id === m.location_id)) {
    return { error: "Transfer için farklı bir yer seçin." };
  }

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (ctx.role === "viewer") return { error: READ_ONLY };

  /* Eldeki adet — defterden. */
  const { data: level, error: levelErr } = await supabase
    .from("stock_levels")
    .select("qty")
    .eq("workspace_id", ctx.workspaceId)
    .eq("product_id", m.product_id)
    .eq("location_id", m.location_id)
    .eq("size", size)
    .maybeSingle();
  if (levelErr) return { error: dbError(levelErr) };
  const onHand = (level as { qty: number } | null)?.qty ?? 0;

  const base = {
    workspace_id: ctx.workspaceId, product_id: m.product_id, size, kind: m.kind,
    unit_price: m.unit_price ?? null, note: m.note ?? "", created_by: ctx.userId,
  };
  const tooMany = `Bu yerde ${size} bedenden ${onHand} adet var.`;
  let rows: Record<string, unknown>[];

  switch (m.kind) {
    case "giris":
    case "iade":
      rows = [{ ...base, location_id: m.location_id, qty: m.qty }];
      break;
    case "satis":
    case "cikis":
      if (m.qty > onHand) return { error: tooMany };
      rows = [{ ...base, location_id: m.location_id, qty: -m.qty }];
      break;
    case "transfer": {
      if (m.qty > onHand) return { error: tooMany };
      const transfer_id = randomUUID();
      rows = [
        { ...base, location_id: m.location_id, qty: -m.qty, transfer_id },
        { ...base, location_id: m.to_location_id, qty: m.qty, transfer_id },
      ];
      break;
    }
    case "sayim": {
      const diff = m.qty - onHand;
      if (diff === 0) return { ok: true }; // sayım tutuyor — yazılacak fark yok
      rows = [{ ...base, location_id: m.location_id, qty: diff }];
      break;
    }
  }

  const { error } = await supabase.from("stock_movements").insert(rows);
  if (error) return { error: dbError(error) };
  revalidatePath("/stock");
  return { ok: true };
}

/** Yanlış girilen hareketi geri alır (yönetici). Transferin iki bacağı birlikte gider. */
export async function deleteStockMovement(movementId: string): Promise<{ ok: true } | { error: string }> {
  if (!id.safeParse(movementId).success) return { error: "Geçersiz hareket." };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!ctx.isAdmin) return { error: ADMIN_ONLY };

  const { data: row, error: readErr } = await supabase
    .from("stock_movements")
    .select("id, transfer_id")
    .eq("id", movementId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (readErr) return { error: dbError(readErr) };
  if (!row) return { error: "Hareket bulunamadı." };
  const r = row as { id: string; transfer_id: string | null };

  const del = supabase.from("stock_movements").delete().eq("workspace_id", ctx.workspaceId);
  const { error } = r.transfer_id ? await del.eq("transfer_id", r.transfer_id) : await del.eq("id", r.id);
  if (error) return { error: dbError(error) };
  revalidatePath("/stock");
  return { ok: true };
}

/* ── Siteden ürün bilgisi ───────────────────────────────────────────────────
   Store API — anahtarsız, salt okunur. Yeni ürün açarken ad, kod (SKU),
   görsel ve bağlantı siteden dolsun; elle yazılan kod siteyle ayrışmasın. */

export interface SiteProductHit {
  id: number;
  name: string;
  sku: string;
  url: string;
  image_url: string;
}

export async function searchSiteProductsForStock(query: string): Promise<{ ok: true; products: SiteProductHit[] } | { error: string }> {
  const q = query.trim();
  if (q.length < 2) return { ok: true, products: [] };
  if (q.length > 100) return { error: "Arama çok uzun." };
  const supabase = await createClient();
  if (!(await getCtx(supabase))) return { error: AUTH_REQUIRED };
  try {
    const res = await fetch(
      `${WEBSITE_BASE}/wp-json/wc/store/v1/products?search=${encodeURIComponent(q)}&per_page=12&wmc-currency=USD`,
      { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(12000) },
    );
    if (!res.ok) return { error: `Site yanıt vermedi (HTTP ${res.status}).` };
    const hits = (await res.json()) as { id: number; name?: string; sku?: string; permalink?: string; images?: { src?: string }[] }[];
    return {
      ok: true,
      products: hits.map((p) => ({
        id: p.id,
        name: decodeEntities(p.name ?? "").trim(),
        sku: p.sku ?? "",
        url: p.permalink ?? "",
        image_url: p.images?.[0]?.src ?? "",
      })),
    };
  } catch {
    return { error: "Siteye bağlanılamadı." };
  }
}
