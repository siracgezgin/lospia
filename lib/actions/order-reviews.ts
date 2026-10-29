"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage } from "@/lib/utils/supabase-errors";
import { nextCode, ORDER_REVIEW_BUCKET, photoPrefix } from "@/lib/order-review/model";
import type { OrderReviewItem, OrderReviewNote, OrderReviewPhoto } from "@/types";

/**
 * SİPARİŞ DEĞERLENDİRME — bütün yazma işleri (20240365).
 *
 * Nisa Hanım (29.10.2026): "Bu sistemi takvim gibi rica etsem operasyon
 * sistemine entegre edebilir miyiz?" Excel'in birebir karşılığı: bir
 * değerlendirme + ürün satırları. Her üye yazar; silme yönetici ya da kaydı
 * açan kişi (RLS aynı kuralı veritabanında da uygular).
 *
 * FOTOĞRAF BAYTLARI BURADAN GEÇMEZ: tarayıcı kendi oturumuyla doğrudan
 * Storage'a yükler (Vercel'in 4,5 MB'lık gövde sınırı — bkz. DriveBrowser).
 * Buraya yalnız YOL gelir; adres sunucuda yoldan yeniden üretilir, yol da
 * kendi değerlendirmesinin klasöründe olmak zorundadır.
 */

const AUTH_REQUIRED = "Kimlik doğrulama gerekli.";
const NOT_FOUND = "Değerlendirme bulunamadı.";
const ITEM_NOT_FOUND = "Ürün satırı bulunamadı.";
const DELETE_DENIED = "Bu kaydı yalnız açan kişi ya da yönetici silebilir.";
const IMPORT_BUCKET = "documents";

const ROOT = "/collection/siparis";

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

function revalidate(reviewId?: string) {
  revalidatePath(ROOT);
  if (reviewId) revalidatePath(`${ROOT}/${reviewId}`);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const uuid = z.string().regex(/^[0-9a-f-]{36}$/i, "Geçersiz kimlik");

// ── DEĞERLENDİRME ───────────────────────────────────────────────────────────

const ReviewSchema = z.object({
  title: z.string().trim().max(300).optional(),
  season_id: uuid.nullable().optional(),
  review_date: z.string().regex(DATE_RE, "Geçersiz tarih").nullable().optional(),
});

export async function createOrderReview(
  input: z.input<typeof ReviewSchema> = {},
): Promise<{ id: string } | { error: string }> {
  const parsed = ReviewSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("order_reviews")
    .insert({
      workspace_id: ctx.workspaceId,
      title: parsed.data.title ?? "",
      season_id: parsed.data.season_id ?? null,
      review_date: parsed.data.review_date ?? today,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) return { error: toActionErrorMessage(error) };
  revalidate();
  return { id: (data as { id: string }).id };
}

export async function updateOrderReview(
  id: string,
  patch: z.input<typeof ReviewSchema>,
): Promise<{ ok: true } | { error: string }> {
  const parsed = ReviewSchema.safeParse(patch);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  /* Yalnız GÖNDERİLEN alan yazılır — gönderilmeyen alan silinmez. */
  const payload: Record<string, unknown> = { updated_by: ctx.userId };
  if (parsed.data.title !== undefined) payload.title = parsed.data.title;
  if (parsed.data.season_id !== undefined) payload.season_id = parsed.data.season_id;
  if (parsed.data.review_date !== undefined) payload.review_date = parsed.data.review_date;

  const { error, count } = await supabase
    .from("order_reviews")
    .update(payload, { count: "exact" })
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };
  if (count === 0) return { error: NOT_FOUND };
  revalidate(id);
  return { ok: true };
}

/** Klasördeki bütün fotoğrafları siler (best effort — kayıt zaten gitti). */
async function removeFolder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  prefix: string,
) {
  const folder = prefix.replace(/\/$/, "");
  for (let i = 0; i < 20; i++) {
    const { data } = await supabase.storage.from(ORDER_REVIEW_BUCKET).list(folder, { limit: 100 });
    const paths = (data ?? []).filter((f) => f.id !== null).map((f) => `${folder}/${f.name}`);
    if (!paths.length) return;
    const { error } = await supabase.storage.from(ORDER_REVIEW_BUCKET).remove(paths);
    if (error) return;
  }
}

export async function deleteOrderReview(id: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { data: row } = await supabase
    .from("order_reviews")
    .select("id, created_by")
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!row) return { error: NOT_FOUND };
  if (!isAdmin(ctx.role) && (row as { created_by: string | null }).created_by !== ctx.userId) {
    return { error: DELETE_DENIED };
  }

  const { error, count } = await supabase
    .from("order_reviews")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };
  if (count === 0) return { error: DELETE_DENIED };
  await removeFolder(supabase, photoPrefix(ctx.workspaceId, id));
  revalidate();
  return { ok: true };
}

// ── ÜRÜN SATIRLARI ──────────────────────────────────────────────────────────

const PhotoSchema = z.object({ path: z.string().min(1).max(500), url: z.string().max(2000).optional() });
const NoteSchema = z.object({
  id: z.string().min(1).max(60),
  date: z.string().regex(DATE_RE, "Geçersiz not tarihi"),
  text: z.string().max(8000),
});

const ItemPatchSchema = z.object({
  code: z.string().max(120).optional(),
  product_group: z.string().max(500).optional(),
  critique: z.string().max(8000).optional(),
  meeting_notes: z.array(NoteSchema).max(200).optional(),
  fabric: z.string().max(1000).optional(),
  colors: z.string().max(1000).optional(),
  planned_qty: z.number().int().min(0).max(100_000_000).nullable().optional(),
  unit_price: z.number().min(0).max(1_000_000_000).nullable().optional(),
  currency: z.enum(["TL", "USD", "EUR", "GBP"]).optional(),
  decision: z.enum(["degerlendirmede", "onaylandi", "revize", "reddedildi"]).optional(),
  original_photos: z.array(PhotoSchema).max(30).optional(),
  sample_photos: z.array(PhotoSchema).max(30).optional(),
});
export type OrderReviewItemPatch = z.input<typeof ItemPatchSchema>;

const ITEM_COLUMNS =
  "id, workspace_id, review_id, position, code, product_group, critique, meeting_notes, fabric, colors, " +
  "planned_qty, unit_price, currency, decision, original_photos, sample_photos, created_by, updated_by, created_at, updated_at";

/** Fotoğraf listesi: yol kendi klasöründe olmalı, adres yoldan üretilir. */
function cleanPhotos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  list: { path: string }[],
  prefix: string,
): OrderReviewPhoto[] | null {
  const out: OrderReviewPhoto[] = [];
  for (const p of list) {
    if (!p.path.startsWith(prefix) || p.path.includes("..")) return null;
    const { data } = supabase.storage.from(ORDER_REVIEW_BUCKET).getPublicUrl(p.path);
    out.push({ path: p.path, url: data.publicUrl });
  }
  return out;
}

export async function addOrderReviewItem(
  reviewId: string,
): Promise<{ item: OrderReviewItem } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { data: review } = await supabase
    .from("order_reviews")
    .select("id")
    .eq("id", reviewId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!review) return { error: NOT_FOUND };

  const { data: existing } = await supabase
    .from("order_review_items")
    .select("position, code")
    .eq("review_id", reviewId)
    .order("position", { ascending: true });
  const rows = (existing ?? []) as { position: number; code: string }[];
  const position = rows.length ? Math.max(...rows.map((r) => r.position)) + 1 : 0;

  const { data, error } = await supabase
    .from("order_review_items")
    .insert({
      workspace_id: ctx.workspaceId,
      review_id: reviewId,
      position,
      code: nextCode(rows.map((r) => r.code)),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select(ITEM_COLUMNS)
    .single();
  if (error) return { error: toActionErrorMessage(error) };
  await supabase.from("order_reviews").update({ updated_by: ctx.userId }).eq("id", reviewId);
  revalidate(reviewId);
  return { item: data as unknown as OrderReviewItem };
}

export async function updateOrderReviewItem(
  itemId: string,
  patch: OrderReviewItemPatch,
): Promise<{ item: OrderReviewItem } | { error: string }> {
  const parsed = ItemPatchSchema.safeParse(patch);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { data: current } = await supabase
    .from("order_review_items")
    .select("id, review_id")
    .eq("id", itemId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!current) return { error: ITEM_NOT_FOUND };
  const reviewId = (current as { review_id: string }).review_id;
  const prefix = photoPrefix(ctx.workspaceId, reviewId);

  /* Yalnız GÖNDERİLEN alanlar yazılır. Fotoğraf ve not dizileri BÜTÜN olarak
     gelir (ekran listenin tamamını tutuyor); gönderilmeyen dizi yerinde kalır. */
  const v = parsed.data;
  const payload: Record<string, unknown> = { updated_by: ctx.userId };
  for (const k of ["code", "product_group", "critique", "fabric", "colors", "planned_qty", "unit_price", "currency", "decision"] as const) {
    if (v[k] !== undefined) payload[k] = typeof v[k] === "string" ? (v[k] as string).trim() : v[k];
  }
  if (v.meeting_notes !== undefined) {
    payload.meeting_notes = v.meeting_notes.map((n): OrderReviewNote => ({ id: n.id, date: n.date, text: n.text.trim() }));
  }
  for (const k of ["original_photos", "sample_photos"] as const) {
    if (v[k] === undefined) continue;
    const photos = cleanPhotos(supabase, v[k], prefix);
    if (!photos) return { error: "Fotoğraf bu değerlendirmeye ait değil." };
    payload[k] = photos;
  }

  const { data, error } = await supabase
    .from("order_review_items")
    .update(payload)
    .eq("id", itemId)
    .eq("workspace_id", ctx.workspaceId)
    .select(ITEM_COLUMNS)
    .maybeSingle();
  if (error) return { error: toActionErrorMessage(error) };
  if (!data) return { error: ITEM_NOT_FOUND };
  revalidate(reviewId);
  return { item: data as unknown as OrderReviewItem };
}

export async function deleteOrderReviewItem(itemId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { data: row } = await supabase
    .from("order_review_items")
    .select("id, review_id, created_by, original_photos, sample_photos")
    .eq("id", itemId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!row) return { error: ITEM_NOT_FOUND };
  const item = row as Pick<OrderReviewItem, "id" | "review_id" | "created_by" | "original_photos" | "sample_photos">;
  if (!isAdmin(ctx.role) && item.created_by !== ctx.userId) return { error: DELETE_DENIED };

  const { error, count } = await supabase
    .from("order_review_items")
    .delete({ count: "exact" })
    .eq("id", itemId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };
  if (count === 0) return { error: DELETE_DENIED };

  const prefix = photoPrefix(ctx.workspaceId, item.review_id);
  const paths = [...(item.original_photos ?? []), ...(item.sample_photos ?? [])]
    .map((p) => p.path)
    .filter((p) => p.startsWith(prefix));
  if (paths.length) await supabase.storage.from(ORDER_REVIEW_BUCKET).remove(paths);
  revalidate(item.review_id);
  return { ok: true };
}

/**
 * Hücreden kaldırılan fotoğrafın baytı. Kayıttan çıkarma `updateOrderReviewItem`
 * ile ÖNCE yapılır; bu yalnız depoyu temizler. Başka bir satır aynı yolu hâlâ
 * kullanıyorsa (içe aktarmada aynı fotoğraf iki satırda olabilir) silinmez.
 */
export async function removeOrderReviewPhoto(
  reviewId: string,
  path: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  const prefix = photoPrefix(ctx.workspaceId, reviewId);
  if (!path.startsWith(prefix) || path.includes("..")) return { error: "Fotoğraf bu değerlendirmeye ait değil." };

  const { data: users } = await supabase
    .from("order_review_items")
    .select("original_photos, sample_photos")
    .eq("review_id", reviewId);
  const stillUsed = ((users ?? []) as Pick<OrderReviewItem, "original_photos" | "sample_photos">[])
    .some((i) => [...(i.original_photos ?? []), ...(i.sample_photos ?? [])].some((p) => p.path === path));
  if (stillUsed) return { ok: true };

  const { error } = await supabase.storage.from(ORDER_REVIEW_BUCKET).remove([path]);
  if (error) return { error: toActionErrorMessage(error) };
  return { ok: true };
}

// ── EXCEL'DEN İÇE AKTARMA ───────────────────────────────────────────────────

/**
 * Tarayıcı .xlsx'i önce `documents/{ws}/_imports/…` altına yükler (gövde
 * sınırı yüzünden dosya buradan geçmez); bu eylem onu okur, değerlendirmeyi
 * ve satırları açar, fotoğrafları kendi klasörüne taşır, geçici dosyayı siler.
 */
export async function importOrderReview(
  tempPath: string,
  fileName: string,
): Promise<{ id: string; warnings: string[] } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!tempPath.startsWith(`${ctx.workspaceId}/_imports/`) || tempPath.includes("..")) {
    return { error: "Geçersiz dosya yolu." };
  }

  try {
    const { data: blob, error: dlErr } = await supabase.storage.from(IMPORT_BUCKET).download(tempPath);
    if (dlErr || !blob) return { error: "Dosya okunamadı." };
    const buf = Buffer.from(await blob.arrayBuffer());

    const { parseOrderReviewWorkbook } = await import("@/lib/order-review/xlsx-import");
    let parsed;
    try {
      parsed = await parseOrderReviewWorkbook(buf);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Excel okunamadı." };
    }
    if (parsed.items.length === 0) return { error: "Dosyada aktarılacak ürün satırı bulunamadı." };

    /* Sezon ADIYLA eşlenir (Koleksiyon'daki sezonlar). Eşleşmezse sezonsuz
       açılır ve metin kaybolmasın diye başlığa yazılır. */
    let seasonId: string | null = null;
    if (parsed.meta.season) {
      const { data: seasons } = await supabase
        .from("workspace_seasons")
        .select("id, name")
        .eq("workspace_id", ctx.workspaceId);
      const want = parsed.meta.season.toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();
      seasonId = ((seasons ?? []) as { id: string; name: string }[])
        .find((s) => s.name.toLocaleLowerCase("tr").replace(/\s+/g, " ").trim() === want)?.id ?? null;
    }
    const baseName = fileName.replace(/\.(xlsx|xlsm)$/i, "").replace(/_/g, " ").trim();
    const title = (
      parsed.meta.reference ||
      (parsed.meta.season && !seasonId ? parsed.meta.season : "") ||
      baseName ||
      "Sipariş değerlendirme"
    ).slice(0, 300);

    const { data: created, error: insErr } = await supabase
      .from("order_reviews")
      .insert({
        workspace_id: ctx.workspaceId,
        title,
        season_id: seasonId,
        review_date: parsed.meta.date ?? new Date().toISOString().slice(0, 10),
        created_by: ctx.userId,
        updated_by: ctx.userId,
      })
      .select("id")
      .single();
    if (insErr) return { error: toActionErrorMessage(insErr) };
    const reviewId = (created as { id: string }).id;
    const prefix = photoPrefix(ctx.workspaceId, reviewId);

    /* Fotoğraflar — aynı bayt bir kez yüklenir (içerik özetiyle adlanır). */
    const warnings = [...parsed.notes];
    const photoOf = new Map<string, OrderReviewPhoto>();
    let failed = 0;
    const queue = [...parsed.images.entries()];
    const worker = async () => {
      for (;;) {
        const next = queue.shift();
        if (!next) return;
        const [key, img] = next;
        const ext = img.ext === "jpg" ? "jpeg" : img.ext.replace(/[^a-z0-9]/g, "") || "png";
        const sha = createHash("sha256").update(img.buffer).digest("hex").slice(0, 32);
        const path = `${prefix}${sha}.${ext}`;
        const { error } = await supabase.storage
          .from(ORDER_REVIEW_BUCKET)
          .upload(path, img.buffer, { contentType: `image/${ext}`, upsert: false });
        if (error && !/exists|duplicate|409/i.test(error.message ?? "")) { failed++; continue; }
        const { data } = supabase.storage.from(ORDER_REVIEW_BUCKET).getPublicUrl(path);
        photoOf.set(key, { path, url: data.publicUrl });
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    if (failed) warnings.push(`${failed} fotoğraf yüklenemedi.`);

    const pick = (keys: string[]) => keys.map((k) => photoOf.get(k)).filter((p): p is OrderReviewPhoto => !!p);
    const rows = parsed.items.map((it, i) => ({
      workspace_id: ctx.workspaceId,
      review_id: reviewId,
      position: i,
      code: it.code,
      product_group: it.product_group,
      critique: it.critique,
      meeting_notes: it.notes.map((n) => ({ id: crypto.randomUUID(), date: n.date, text: n.text })),
      fabric: it.fabric,
      colors: it.colors,
      planned_qty: it.planned_qty,
      unit_price: it.unit_price,
      currency: it.currency,
      decision: it.decision,
      original_photos: pick(it.original),
      sample_photos: pick(it.sample),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    }));
    const { error: itemsErr } = await supabase.from("order_review_items").insert(rows);
    if (itemsErr) {
      /* Yarım kayıt bırakılmaz: değerlendirme ve fotoğraflar geri alınır. */
      await supabase.from("order_reviews").delete().eq("id", reviewId);
      await removeFolder(supabase, prefix);
      return { error: toActionErrorMessage(itemsErr) };
    }

    revalidate(reviewId);
    return { id: reviewId, warnings };
  } catch (err) {
    console.error("[siparis] Excel aktarımı başarısız", { tempPath, err });
    return { error: "Excel aktarılamadı. Dosya bozuk ya da parola korumalı olabilir." };
  } finally {
    await supabase.storage.from(IMPORT_BUCKET).remove([tempPath]);
  }
}
