"use server";

import { randomUUID } from "crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage, isMissingSchemaError } from "@/lib/utils/supabase-errors";
import { decodeEntities, WEBSITE_BASE } from "@/lib/collection/website";
import {
  defaultBlocks, isMonday, MAX_BLOCKS,
  type NewsletterProduct, type NewsletterWeek,
} from "@/lib/newsletter/model";

/**
 * BÜLTEN PLANI (20240369 → 20240372) — bir pazartesinin planını kaydeder.
 *
 * Satır ilk düzenlemede doğar (workspace + pazartesi tekil). Konu satırı,
 * tema, not ve durum alan alan; bloklar (sıra dahil) tek parça kaydedilir.
 * Rol kısıtı yok — izleyici dışında herkes yazar.
 */

const AUTH_REQUIRED = "Kimlik doğrulama gerekli.";
const SETUP_PENDING = "Bülten planı için veritabanı güncellemesi bekleniyor (20240372).";

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

const s = (max: number) => z.string().max(max);
const BlockSchema = z.object({
  id: s(64).min(1),
  type: z.enum(["gorsel", "metin", "urun", "kategori", "story", "sosyal"]),
  title: s(300),
  link: s(1000),
  text: s(4000),
  image_url: s(1000),
  image_path: s(500),
  products: z.array(ProductSchema).max(8),
  platform: z.enum(["instagram", "youtube", "linkedin", "x", ""]),
  button: s(120),
  ref: s(64),
});

const PatchSchema = z.object({
  status: z.enum(["taslak", "onayda", "onaylandi", "duzeltme", "gonderildi"]).optional(),
  subject: s(300).optional(),
  theme: s(300).optional(),
  notes: s(4000).optional(),
  blocks: z.array(BlockSchema).max(MAX_BLOCKS).optional(),
}).strict();

export type NewsletterPatch = Partial<Pick<NewsletterWeek, "status" | "subject" | "theme" | "notes" | "blocks">>;

export async function saveNewsletterWeek(
  sendDate: string,
  patch: NewsletterPatch,
): Promise<{ ok: true; id: string } | { error: string }> {
  if (!isMonday(sendDate)) return { error: "Bülten tarihi pazartesi olmalı." };
  const parsed = PatchSchema.safeParse(patch);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Geçersiz alan." };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (ctx.role === "viewer") return { error: "İzleyici rolü planı değiştiremez." };

  const { data: existing, error: readErr } = await supabase
    .from("newsletter_weeks")
    .select("id")
    .eq("workspace_id", ctx.workspaceId)
    .eq("send_date", sendDate)
    .maybeSingle();
  if (readErr) return { error: isMissingSchemaError(readErr) ? SETUP_PENDING : toActionErrorMessage(readErr) };

  const values = { ...parsed.data, updated_by: ctx.userId };
  const res = existing
    ? await supabase.from("newsletter_weeks").update(values).eq("id", existing.id).select("id").single()
    : await supabase
        .from("newsletter_weeks")
        /* Yeni hafta, ekranda gördüğü hazır blok sırasıyla doğar — yalnız
           konu satırı yazılsa bile bloklar boş liste olarak kaydolmasın. */
        .insert({ blocks: defaultBlocks(randomUUID), ...values, workspace_id: ctx.workspaceId, send_date: sendDate, created_by: ctx.userId })
        .select("id")
        .single();
  if (res.error) return { error: isMissingSchemaError(res.error) ? SETUP_PENDING : toActionErrorMessage(res.error) };
  return { ok: true, id: (res.data as { id: string }).id };
}

/* ── Siteden okuma ────────────────────────────────────────────────────────
   WooCommerce Store API ve WordPress REST — anahtarsız, salt okunur, sitede
   zaten herkese açık bilgi. `wmc-currency` Store API'de HER İSTEKTE verilir:
   LiteSpeed önbelleği para birimini karıştırıyor. Fiyat gösterilmez. */

async function getJson<T>(url: string): Promise<T | { error: string }> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (!res.ok) return { error: `Site yanıt vermedi (HTTP ${res.status}).` };
    return (await res.json()) as T;
  } catch (e) {
    return { error: e instanceof Error && e.name === "TimeoutError" ? "Site zamanında yanıt vermedi." : "Siteye bağlanılamadı." };
  }
}

const stripTags = (html: string) => decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

type StoreHit = {
  id: number;
  name?: string;
  permalink?: string;
  is_in_stock?: boolean;
  images?: { src?: string }[];
};

export async function searchStoreProducts(
  query: string,
): Promise<{ ok: true; products: NewsletterProduct[] } | { error: string }> {
  const q = query.trim();
  if (q.length < 2) return { ok: true, products: [] };
  if (q.length > 100) return { error: "Arama çok uzun." };
  const supabase = await createClient();
  if (!(await getCtx(supabase))) return { error: AUTH_REQUIRED };

  const hits = await getJson<StoreHit[]>(
    `${WEBSITE_BASE}/wp-json/wc/store/v1/products?search=${encodeURIComponent(q)}&per_page=20&wmc-currency=USD`,
  );
  if ("error" in hits) return hits;
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
}

export interface SiteStory {
  id: string;
  title: string;
  url: string;
  image_url: string;
  /** Yazının ilk cümleleri — bloğun metni bununla dolar. */
  excerpt: string;
  date: string;
}

/** Sitedeki Stories yazıları (kategori 1354), en yeni önce. */
export async function listSiteStories(): Promise<{ ok: true; stories: SiteStory[] } | { error: string }> {
  const supabase = await createClient();
  if (!(await getCtx(supabase))) return { error: AUTH_REQUIRED };
  type Post = {
    id: number; date: string; link: string;
    title?: { rendered?: string }; excerpt?: { rendered?: string };
    _embedded?: { "wp:featuredmedia"?: { source_url?: string }[] };
  };
  const posts = await getJson<Post[]>(
    `${WEBSITE_BASE}/wp-json/wp/v2/posts?categories=1354&per_page=50&_embed=wp:featuredmedia&_fields=id,date,link,title,excerpt,_links,_embedded`,
  );
  if ("error" in posts) return posts;
  return {
    ok: true,
    stories: posts.map((p) => ({
      id: String(p.id),
      title: stripTags(p.title?.rendered ?? ""),
      url: p.link,
      image_url: p._embedded?.["wp:featuredmedia"]?.[0]?.source_url ?? "",
      excerpt: stripTags(p.excerpt?.rendered ?? "").replace(/\s*\[…\]\s*$|\s*\[&hellip;\]\s*$/, "").slice(0, 600),
      date: p.date.slice(0, 10),
    })),
  };
}

export interface SiteCategory {
  id: string;
  name: string;
  url: string;
}

/** Sitedeki koleksiyonlar/kategoriler — ürünü olanlar. */
export async function listSiteCategories(): Promise<{ ok: true; categories: SiteCategory[] } | { error: string }> {
  const supabase = await createClient();
  if (!(await getCtx(supabase))) return { error: AUTH_REQUIRED };
  type Cat = { id: number; name: string; permalink?: string; count?: number };
  const cats = await getJson<Cat[]>(`${WEBSITE_BASE}/wp-json/wc/store/v1/products/categories?wmc-currency=USD`);
  if ("error" in cats) return cats;
  return {
    ok: true,
    categories: cats
      .filter((c) => (c.count ?? 0) > 0 && c.permalink)
      .map((c) => ({ id: String(c.id), name: decodeEntities(c.name), url: c.permalink! }))
      .sort((a, b) => a.name.localeCompare(b.name, "en")),
  };
}
