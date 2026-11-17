"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage, isMissingSchemaError } from "@/lib/utils/supabase-errors";
import { decodeEntities, WEBSITE_BASE } from "@/lib/collection/website";
import { normalizeSize, SITE_NOTE } from "@/lib/stock/model";
import { fetchSiteStock, nameKey } from "@/lib/stock/site";

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
/** Stok şimdilik yalnız yöneticiye açık (17.11.2026) — ekibe açılırken false yapılır. */
const STOCK_ADMIN_ONLY = true;
const NOT_OPEN = "Stok şimdilik yalnız yöneticilere açık.";

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
  if (STOCK_ADMIN_ONLY && !ctx.isAdmin) return { error: NOT_OPEN };
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
  if (STOCK_ADMIN_ONLY && !ctx.isAdmin) return { error: NOT_OPEN };
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
  if (STOCK_ADMIN_ONLY && !ctx.isAdmin) return { error: NOT_OPEN };
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
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (STOCK_ADMIN_ONLY && !ctx.isAdmin) return { error: NOT_OPEN };
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

/* ── Site stoğu → "Online" ──────────────────────────────────────────────────
   Sitenin beden bazında eldeki adedi "Online" yerine yazılır. Site satınca
   adet sitede düşer; bir sonraki eşitlemede fark buraya SAYIM hareketi olarak
   iner ("Site" notuyla) — defter mantığı bozulmaz, geçmiş okunur kalır.

   EŞLEŞME sırası: (1) daha önce bağlanmış ürün (web_product_id), (2) sitedeki
   SKU = stok kodu, (3) birebir aynı ad (yalnız tek aday varsa). Hiçbiri
   tutmuyorsa ve sitede adedi varsa ürün stok listesine AÇILIR — sitede satılan
   ürünün stok kaydı olmalı. Eşleşen ürünün dolu alanları EZİLMEZ; yalnız boş
   bağlantı/görsel dolar. Adedi sitede tutulmayan beden (takip kapalı) atlanır. */

interface SyncProduct {
  id: string; code: string; name: string;
  web_product_id: number | null; web_url: string; image_url: string;
}

export async function syncSiteStock(): Promise<{ ok: true; opened: number; changed: number } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (STOCK_ADMIN_ONLY && !ctx.isAdmin) return { error: NOT_OPEN };
  if (ctx.role === "viewer") return { error: READ_ONLY };

  const { data: loc, error: locErr } = await supabase
    .from("stock_locations")
    .select("id")
    .eq("workspace_id", ctx.workspaceId)
    .eq("kind", "online")
    .order("position")
    .limit(1)
    .maybeSingle();
  if (locErr) return { error: dbError(locErr) };
  if (!loc) return { error: "Online stok yeri tanımlı değil." };
  const onlineId = (loc as { id: string }).id;

  let site;
  try {
    site = await fetchSiteStock();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Siteye bağlanılamadı." };
  }

  const PRODUCT_COLS = "id, code, name, web_product_id, web_url, image_url";
  async function readAll<T>(table: string, cols: string, order: string[], extra?: [string, string]): Promise<T[] | { error: string }> {
    const out: T[] = [];
    for (let from = 0; from < 50_000; from += 1000) {
      let q = supabase.from(table).select(cols).eq("workspace_id", ctx!.workspaceId);
      if (extra) q = q.eq(extra[0], extra[1]);
      for (const col of order) q = q.order(col);
      const { data, error } = await q.range(from, from + 999);
      if (error) return { error: dbError(error) };
      out.push(...((data ?? []) as T[]));
      if ((data ?? []).length < 1000) break;
    }
    return out;
  }

  const products = await readAll<SyncProduct>("stock_products", PRODUCT_COLS, ["id"]);
  if ("error" in products) return products;
  const levels = await readAll<{ product_id: string; size: string; qty: number }>(
    "stock_levels", "product_id, size, qty", ["product_id", "size"], ["location_id", onlineId],
  );
  if ("error" in levels) return levels;

  const byWeb = new Map<number, SyncProduct>();
  const byCode = new Map<string, SyncProduct>();
  const byName = new Map<string, SyncProduct[]>();
  for (const p of products) {
    if (p.web_product_id != null && !byWeb.has(Number(p.web_product_id))) byWeb.set(Number(p.web_product_id), p);
    const code = p.code.trim().toLocaleUpperCase("en-US");
    if (code) byCode.set(code, p);
    const key = nameKey(p.name);
    if (key) byName.set(key, [...(byName.get(key) ?? []), p]);
  }

  const matched = new Map<number, SyncProduct>();
  const toLink: { product: SyncProduct; siteId: number; url: string; image: string }[] = [];
  const toOpen: (typeof site)[number][] = [];

  for (const sp of site) {
    let hit = byWeb.get(sp.id);
    if (!hit) {
      const byCodeHit = sp.skus.map((k) => byCode.get(k)).find((p) => p && p.web_product_id == null);
      const nameHits = (byName.get(nameKey(sp.name)) ?? []).filter((p) => p.web_product_id == null);
      hit = byCodeHit ?? (nameHits.length === 1 ? nameHits[0] : undefined);
      if (hit) {
        hit.web_product_id = sp.id; // aynı kayıt ikinci bir site ürününe bağlanmasın
        toLink.push({ product: hit, siteId: sp.id, url: sp.url, image: sp.imageUrl });
      }
    }
    if (hit) { matched.set(sp.id, hit); continue; }
    if ([...sp.sizes.values()].some((q) => (q ?? 0) > 0)) toOpen.push(sp);
  }

  /* Bağlantılar — yalnız BOŞ alan dolar. */
  for (let i = 0; i < toLink.length; i += 10) {
    const results = await Promise.all(toLink.slice(i, i + 10).map(({ product, siteId, url, image }) =>
      supabase
        .from("stock_products")
        .update({
          web_product_id: siteId,
          ...(product.web_url ? {} : { web_url: url }),
          ...(product.image_url ? {} : { image_url: image }),
          updated_by: ctx.userId,
        })
        .eq("id", product.id)
        .eq("workspace_id", ctx.workspaceId)
        .is("web_product_id", null),
    ));
    const failed = results.find((r) => r.error);
    if (failed?.error) return { error: dbError(failed.error) };
  }

  /* Yeni ürünler. Aynı anda ikinci bir eşitleme aynı ürünü açmış olabilir —
     eklemeden hemen önce yeniden bakılır. */
  let opened = 0;
  if (toOpen.length) {
    const ids = toOpen.map((sp) => sp.id);
    const already = new Map<number, SyncProduct>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase
        .from("stock_products").select(PRODUCT_COLS)
        .eq("workspace_id", ctx.workspaceId).in("web_product_id", ids.slice(i, i + 200));
      if (error) return { error: dbError(error) };
      for (const p of (data ?? []) as SyncProduct[]) already.set(Number(p.web_product_id), p);
    }
    const usedCodes = new Set(byCode.keys());
    const fresh = toOpen.filter((sp) => !already.has(sp.id));
    for (const [siteId, p] of already) matched.set(siteId, p);
    for (let i = 0; i < fresh.length; i += 100) {
      const rows = fresh.slice(i, i + 100).map((sp) => {
        const code = sp.skus.length === 1 && !usedCodes.has(sp.skus[0]) ? sp.skus[0] : "";
        if (code) usedCodes.add(code);
        return {
          workspace_id: ctx.workspaceId, name: sp.name.slice(0, 300), code,
          web_product_id: sp.id, web_url: sp.url.slice(0, 1000), image_url: sp.imageUrl.slice(0, 1000),
          created_by: ctx.userId, updated_by: ctx.userId,
        };
      });
      const { data, error } = await supabase.from("stock_products").insert(rows).select(PRODUCT_COLS);
      if (error) return { error: dbError(error) };
      for (const p of (data ?? []) as SyncProduct[]) { matched.set(Number(p.web_product_id), p); opened++; }
    }
  }

  /* Adet farkları → sayım hareketi. `source_ref` aynı on dakikada aynı farkı
     iki kez yazdırmaz (iki yönetici aynı anda eşitlerse). */
  const onHand = new Map<string, number>();
  for (const l of levels) onHand.set(`${l.product_id}|${l.size}`, l.qty);
  const bucket = Math.floor(Date.now() / 600_000);
  const wanted = new Map<string, { product_id: string; size: string; qty: number; siteId: number }>();
  for (const sp of site) {
    const product = matched.get(sp.id);
    if (!product) continue;
    for (const [size, qty] of sp.sizes) {
      if (qty == null) continue;
      const key = `${product.id}|${size}`;
      const prev = wanted.get(key);
      wanted.set(key, { product_id: product.id, size, qty: (prev?.qty ?? 0) + qty, siteId: sp.id });
    }
  }
  const moves: Record<string, unknown>[] = [];
  for (const [key, w] of wanted) {
    const diff = w.qty - (onHand.get(key) ?? 0);
    if (diff === 0) continue;
    moves.push({
      workspace_id: ctx.workspaceId, product_id: w.product_id, location_id: onlineId, size: w.size,
      kind: "sayim", qty: diff, note: SITE_NOTE, created_by: ctx.userId,
      source_ref: `site:${w.siteId}:${w.size}:${w.qty}:${bucket}`,
    });
  }
  for (let i = 0; i < moves.length; i += 500) {
    const { error } = await supabase
      .from("stock_movements")
      .upsert(moves.slice(i, i + 500), { onConflict: "workspace_id,source_ref", ignoreDuplicates: true });
    if (error) return { error: dbError(error) };
  }

  if (opened || moves.length || toLink.length) revalidatePath("/stock");
  return { ok: true, opened, changed: moves.length };
}
