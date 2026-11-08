"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage, isMissingSchemaError } from "@/lib/utils/supabase-errors";
import { decodeEntities, WEBSITE_BASE } from "@/lib/collection/website";
import {
  DEFAULT_WELCOME, isMonday, NEWSLETTER_SELECT, NEWSLETTER_TEXT_FIELDS,
  type NewsletterProduct, type NewsletterWeek,
} from "@/lib/newsletter/model";

/**
 * BÜLTEN PLANI (20240369–20240370) — bir pazartesinin planını ALAN ALAN kaydeder.
 *
 * Satır ilk düzenlemede doğar (upsert, workspace + pazartesi tekil). Alan alan
 * kayıt: iki kişi aynı haftanın farklı alanlarını yazarsa biri ötekini ezmez.
 * 1. sürümde rol kısıtı yok — izleyici dışında herkes yazar.
 */

const AUTH_REQUIRED = "Kimlik doğrulama gerekli.";
const SETUP_PENDING = "Bülten planı için veritabanı güncellemesi bekleniyor (20240369–20240370).";

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

const ProductSchema = z.object({
  id: z.number().int(),
  name: z.string().max(300),
  url: z.string().max(1000),
  image_url: z.string().max(1000),
  in_stock: z.boolean(),
});

const text = z.string().max(4000);
const PatchSchema = z.object({
  status: z.enum(["taslak", "onayda", "onaylandi", "duzeltme", "gonderildi"]).optional(),
  products: z.array(ProductSchema).max(12).optional(),
  social_platform: z.enum(["instagram", "youtube", "linkedin", "x"]).optional(),
  ...Object.fromEntries(NEWSLETTER_TEXT_FIELDS.map((f) => [f, text.optional()])),
}).strict();

export type NewsletterPatch = Partial<Omit<NewsletterWeek, "id" | "send_date">>;

const SELECT = NEWSLETTER_SELECT;

export async function saveNewsletterWeek(
  sendDate: string,
  patch: NewsletterPatch,
): Promise<{ ok: true; week: NewsletterWeek } | { error: string }> {
  if (!isMonday(sendDate)) return { error: "Bülten tarihi pazartesi olmalı." };
  const parsed = PatchSchema.safeParse(patch);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Geçersiz alan." };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (ctx.role === "viewer") return { error: "İzleyici rolü planı değiştiremez." };

  /* Önce satır var mı? Varsa yalnız gelen alanlar yazılır; yoksa doğar.
     Tek upsert yapılmadı: upsert'te eksik alanlar varsayılana DÖNERDİ. */
  const { data: existing, error: readErr } = await supabase
    .from("newsletter_weeks")
    .select("id")
    .eq("workspace_id", ctx.workspaceId)
    .eq("send_date", sendDate)
    .maybeSingle();
  if (readErr) return { error: isMissingSchemaError(readErr) ? SETUP_PENDING : toActionErrorMessage(readErr) };

  const values = { ...parsed.data, updated_by: ctx.userId };
  const res = existing
    ? await supabase.from("newsletter_weeks").update(values).eq("id", existing.id).select(SELECT).single()
    : await supabase
        .from("newsletter_weeks")
        /* Yeni hafta ekranda gördüğü welcome metniyle doğar (emptyWeek ile aynı). */
        .insert({ welcome: DEFAULT_WELCOME, ...values, workspace_id: ctx.workspaceId, send_date: sendDate, created_by: ctx.userId })
        .select(SELECT)
        .single();
  if (res.error) return { error: isMissingSchemaError(res.error) ? SETUP_PENDING : toActionErrorMessage(res.error) };
  return { ok: true, week: res.data as unknown as NewsletterWeek };
}

/* ── Siteden ürün arama ───────────────────────────────────────────────────
   WooCommerce Store API — anahtarsız, salt okunur, sitede zaten herkese açık
   bilgi. `wmc-currency` HER İSTEKTE verilir: LiteSpeed önbelleği para birimini
   karıştırıyor ve parametresiz istek başka bir sürümü döndürebiliyor.
   Fiyat 1. sürümde gösterilmez. */

type StoreHit = {
  id: number;
  name?: string;
  permalink?: string;
  is_in_stock?: boolean;
  images?: { src?: string; thumbnail?: string }[];
};

export async function searchStoreProducts(
  query: string,
): Promise<{ ok: true; products: NewsletterProduct[] } | { error: string }> {
  const q = query.trim();
  if (q.length < 2) return { ok: true, products: [] };
  if (q.length > 100) return { error: "Arama çok uzun." };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const url = `${WEBSITE_BASE}/wp-json/wc/store/v1/products?search=${encodeURIComponent(q)}&per_page=20&wmc-currency=USD`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (!res.ok) return { error: `Site yanıt vermedi (HTTP ${res.status}).` };
    const hits = (await res.json()) as StoreHit[];
    return {
      ok: true,
      products: hits.map((p) => ({
        id: p.id,
        name: decodeEntities(p.name ?? "").trim(),
        url: p.permalink ?? "",
        image_url: p.images?.[0]?.src ?? "",
        in_stock: p.is_in_stock !== false,
      })),
    };
  } catch (e) {
    return { error: e instanceof Error && e.name === "TimeoutError" ? "Site zamanında yanıt vermedi." : "Siteye bağlanılamadı." };
  }
}
