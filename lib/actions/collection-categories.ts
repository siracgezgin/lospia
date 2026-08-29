"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { COLLECTION_TAXONOMY } from "@/lib/collection/taxonomy";
import { toActionErrorMessage } from "@/lib/utils/supabase-errors";

/**
 * KOLEKSİYON KATEGORİLERİ — ekle · yeniden adlandır · sil.
 *
 * Sıraç (2026-08-29): "Kategori ekle neden yok? Ve kategori düzenleme, silme
 * veya föy düzenleme, silme gibi olması gereken ne varsa olmalı."
 *
 * İki kural her şeyi belirliyor:
 *
 *  1. ANAHTAR DEĞİŞMEZ. Föy kategoriyi bir metin anahtarıyla tutar
 *     (production_sheets.category). Etiketi değiştirmek anahtarı değiştirmez,
 *     bu yüzden "Ready to Wear" → "Hazır Giyim" yapmak hiçbir föyü koparmaz.
 *  2. DOLU KATEGORİ SİLİNMEZ. İçinde föy varken silmek, föyleri sessizce
 *     "Kategorisiz"e düşürürdü — kullanıcı için veri kaybı gibi görünür.
 *     Önce föyler taşınır, sonra kategori silinir.
 *
 * Tablo boşken kod varsayılanları (taxonomy.ts) geçerlidir. İlk yazma
 * işleminde varsayılanların TAMAMI bir kez tabloya taşınır (`materialize`) —
 * yoksa yalnız yeni eklenen kategori görünür, diğer dördü kaybolurdu.
 */

const AUTH_REQUIRED = "Kimlik doğrulama gerekli.";
const ADMIN_ONLY = "Kategorileri yalnız yöneticiler düzenleyebilir.";
const NOT_FOUND = "Kategori bulunamadı.";

const CategorySchema = z.object({
  label: z.string().min(1, "Kategori adı gerekli.").max(80),
  /** Boşsa üst kategori; doluysa bu anahtarın altına alt kategori açılır. */
  parentKey: z.string().max(80).optional().nullable(),
});

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

function revalidateAll() {
  revalidatePath("/collection");
  revalidatePath("/collection/maliyet");
  revalidatePath("/collection/veri");
}

/**
 * Etiketten anahtar üretir: "Çanta & Takı" → "canta_taki".
 * Türkçe harfler ASCII'ye iner; föy anahtarının veritabanında ve dosya
 * adlarında sorun çıkarmaması için.
 */
function slugify(label: string): string {
  const map: Record<string, string> = {
    ğ: "g", ü: "u", ş: "s", ı: "i", ö: "o", ç: "c",
    Ğ: "g", Ü: "u", Ş: "s", İ: "i", Ö: "o", Ç: "c",
  };
  return label
    .trim()
    .replace(/[ğüşıöçĞÜŞİÖÇ]/g, (c) => map[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "kategori";
}

type Row = {
  id: string;
  key: string;
  label: string;
  parent_key: string | null;
  position: number;
  color_hex: string | null;
};

/**
 * Tablo boşsa kod varsayılanlarını BİR KEZ yazar. Çağıran her yazma
 * işleminden önce çalışır; ikinci çağrıda hiçbir şey yapmaz.
 */
async function materialize(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  userId: string,
): Promise<void> {
  const { count } = await supabase
    .from("workspace_product_categories")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  if ((count ?? 0) > 0) return;

  const rows: Record<string, unknown>[] = [];
  COLLECTION_TAXONOMY.forEach((c, i) => {
    rows.push({
      workspace_id: workspaceId, key: c.key, label: c.label,
      parent_key: null, position: i, created_by: userId,
    });
    c.subcategories.forEach((sub, j) => {
      rows.push({
        workspace_id: workspaceId, key: sub.key, label: sub.label,
        parent_key: c.key, position: j, created_by: userId,
      });
    });
  });
  if (rows.length) await supabase.from("workspace_product_categories").insert(rows);
}

/** Yeni kategori (parentKey boşsa üst, doluysa alt kategori). */
export async function createProductCategory(
  input: z.infer<typeof CategorySchema>,
): Promise<{ id: string; key: string } | { error: string }> {
  const parsed = CategorySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Geçersiz veri." };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdmin(ctx.role)) return { error: ADMIN_ONLY };

  await materialize(supabase, ctx.workspaceId, ctx.userId);

  const parentKey = (parsed.data.parentKey ?? "").trim() || null;
  const base = slugify(parsed.data.label);

  // Anahtar çakışırsa sonuna sayı eklenir — kullanıcı aynı adı iki kez
  // yazabilir, sistem kendini kurtarır.
  const { data: taken } = await supabase
    .from("workspace_product_categories")
    .select("key")
    .eq("workspace_id", ctx.workspaceId)
    .like("key", `${base}%`);
  const used = new Set((taken ?? []).map((r) => (r as { key: string }).key));
  let key = base;
  for (let i = 2; used.has(key); i++) key = `${base}_${i}`;

  // Sıra numarası KENDİ kademesinin sonuna eklenir: üst kategoriler kendi
  // arasında, bir kategorinin altları kendi arasında sıralanır.
  const posQuery = supabase
    .from("workspace_product_categories")
    .select("position")
    .eq("workspace_id", ctx.workspaceId)
    .order("position", { ascending: false })
    .limit(1);
  if (parentKey === null) posQuery.is("parent_key", null);
  else posQuery.eq("parent_key", parentKey);
  const { data: last } = await posQuery.maybeSingle();

  const { data, error } = await supabase
    .from("workspace_product_categories")
    .insert({
      workspace_id: ctx.workspaceId,
      key,
      label: parsed.data.label.trim(),
      parent_key: parentKey,
      position: ((last as { position: number } | null)?.position ?? -1) + 1,
      created_by: ctx.userId,
    })
    .select("id, key")
    .single();

  if (error) return { error: toActionErrorMessage(error) };
  revalidateAll();
  return { id: (data as { id: string }).id, key: (data as { key: string }).key };
}

/** Yeniden adlandırma — YALNIZ etiket. Anahtar sabit kalır, föyler kopmaz. */
export async function renameProductCategory(
  key: string,
  label: string,
): Promise<Record<string, never> | { error: string }> {
  const clean = (label ?? "").trim();
  if (!clean) return { error: "Kategori adı gerekli." };
  if (clean.length > 80) return { error: "Kategori adı çok uzun." };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdmin(ctx.role)) return { error: ADMIN_ONLY };

  await materialize(supabase, ctx.workspaceId, ctx.userId);

  const { error, count } = await supabase
    .from("workspace_product_categories")
    .update({ label: clean }, { count: "exact" })
    .eq("workspace_id", ctx.workspaceId)
    .eq("key", key);

  if (error) return { error: toActionErrorMessage(error) };
  if (!count) return { error: NOT_FOUND };
  revalidateAll();
  return {};
}

/**
 * Silme. İçinde föy ya da alt kategori varsa REDDEDİLİR — sessizce
 * "Kategorisiz"e düşürmek kullanıcı için veri kaybı gibi görünür.
 */
export async function deleteProductCategory(
  key: string,
): Promise<Record<string, never> | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdmin(ctx.role)) return { error: ADMIN_ONLY };

  await materialize(supabase, ctx.workspaceId, ctx.userId);

  const [sheetsRes, childRes] = await Promise.all([
    supabase
      .from("production_sheets")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", ctx.workspaceId)
      /* Arşivli föy de o kategoriye aittir — sayımdan düşülmez. Kategoriyi
         silmek arşivdeki föyün kategorisini de öksüz bırakırdı. */
      .or(`category.eq.${key},subcategory.eq.${key}`),
    supabase
      .from("workspace_product_categories")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", ctx.workspaceId)
      .eq("parent_key", key),
  ]);

  if ((sheetsRes.count ?? 0) > 0) {
    return {
      error:
        "Bu kategorinin içinde föy var. Önce föyleri başka bir kategoriye taşıyın, sonra kategoriyi silin.",
    };
  }
  if ((childRes.count ?? 0) > 0) {
    return { error: "Önce alt kategorileri silin." };
  }

  const { error, count } = await supabase
    .from("workspace_product_categories")
    .delete({ count: "exact" })
    .eq("workspace_id", ctx.workspaceId)
    .eq("key", key);

  if (error) return { error: toActionErrorMessage(error) };
  if (!count) return { error: NOT_FOUND };
  revalidateAll();
  return {};
}

export type ProductCategoryRow = Row;
