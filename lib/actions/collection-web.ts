"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage, isMissingSchemaError } from "@/lib/utils/supabase-errors";
import { fetchWebsiteProducts } from "@/lib/collection/website";
import { logWorkspaceActivity } from "@/lib/activity/log-workspace-activity";

/**
 * KOLEKSİYON ⇄ WEB SİTESİ ve KATEGORİLER ARASI TAŞIMA.
 *
 * Aslı Hanım (2026-09-17, sesli):
 *   "Ready to Wear'e girdiğimde kategorilere göre ürünler burada çıksın,
 *    hâlihazır fotoğraflarıyla ve bilgileriyle."
 *   "Buradan ben bir ürünü alıp Upcycle'a gönderebiliyor olmam lazım…
 *    dosyalar arası iletişim."
 */

const AUTH_REQUIRED = "Kimlik doğrulama gerekli.";

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

export interface WebsiteSyncReport {
  created: number;
  updated: number;
  /** Sitede var ama koleksiyon kategorisine karşılık gelmeyen (Home vb.). */
  skipped: number;
  skippedNames: string[];
  membershipFailures: number;
}

/**
 * Web sitesinden ürünleri çeker: yeni ürün için föy AÇAR, var olanın web
 * bilgisini GÜNCELLER.
 *
 * YÖNETİCİ İŞİ: tek tıkla 150 föy açabilen bir düğme herkese açık olmamalı.
 *
 * KULLANICININ EMEĞİ EZİLMEZ. İkinci çekişte YALNIZ web alanları yenilenir:
 *   • kategori/alt kategori  → dokunulmaz (Upcycle'a taşınmış ürün geri
 *                              "Ready to Wear"e dönmesin)
 *   • föy başlığı            → dokunulmaz (ekip "Şile Bezi Göynek" diye
 *                              yeniden adlandırmış olabilir); sitedeki ad
 *                              `web_name`de ayrı durur
 *   • föyün kendi görselleri → dokunulmaz; site görselleri ayrı kolonda
 * Ürün bilgisi ise sitede değiştiyse güncellenir — "iki kere iş yapmasak"
 * isteğinin anlamı bu: site doğruysa föy de doğru.
 *
 * EŞLEME `web_product_id` ile: sitede SKU yok (161 üründe 0) ve ad değişebilir.
 */
export async function syncCollectionFromWebsite(): Promise<WebsiteSyncReport | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return { error: "Web sitesinden çekme yöneticiye açık." };
  }

  let fetched: Awaited<ReturnType<typeof fetchWebsiteProducts>>;
  try {
    fetched = await fetchWebsiteProducts();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Web sitesine ulaşılamadı." };
  }

  const { data: existing, error: exErr } = await supabase
    .from("production_sheets")
    .select("id, web_product_id")
    .eq("workspace_id", ctx.workspaceId)
    .not("web_product_id", "is", null);
  if (exErr) {
    if (isMissingSchemaError(exErr)) {
      return { error: "Veritabanı güncellemesi bekleniyor (20240347). Yönetici `supabase db push` çalıştırmalı." };
    }
    return { error: toActionErrorMessage(exErr) };
  }
  const idByWeb = new Map(
    ((existing ?? []) as { id: string; web_product_id: number }[]).map((r) => [Number(r.web_product_id), r.id]),
  );

  const now = new Date().toISOString();
  const report: WebsiteSyncReport = {
    created: 0, updated: 0, skipped: 0, skippedNames: [],
    membershipFailures: fetched.membershipFailures,
  };

  /* YAZIM TOPLU. İlk çekişte ~150 föy açılıyor; tek tek insert her biri için
     ayrı bir ağ turu demekti ve sunucu aksiyonunun süre sınırına dayanırdı —
     yarıda kesilen bir çekiş, hangi ürünün açılıp hangisinin açılmadığını
     belirsiz bırakırdı. Yeniler 50'şerli PAKETLE yazılır; güncellemeler
     (ikinci çekiş) altılı havuzla. */
  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; web: Record<string, unknown> }[] = [];

  for (const p of fetched.products) {
    const web = {
      web_product_id: p.id,
      web_url: p.url,
      web_name: p.name,
      designers_note: p.designersNote || null,
      size_fit: p.sizeFit || null,
      details_care: p.detailsCare || null,
      web_images: p.images,
      web_synced_at: now,
      updated_by: ctx.userId,
    };
    const sheetId = idByWeb.get(p.id);
    if (sheetId) { toUpdate.push({ id: sheetId, web }); continue; }
    if (!p.category) {
      report.skipped++;
      report.skippedNames.push(p.name);
      continue;
    }
    toInsert.push({
      workspace_id: ctx.workspaceId,
      created_by: ctx.userId,
      title: p.name,
      status: "active",
      category: p.category,
      subcategory: p.subcategory,
      ...web,
    });
  }

  let insertError: string | null = null;
  for (let i = 0; i < toInsert.length; i += 50) {
    const chunk = toInsert.slice(i, i + 50);
    const { error } = await supabase.from("production_sheets").insert(chunk);
    if (error) { insertError = toActionErrorMessage(error); break; }
    report.created += chunk.length;
  }

  const queue = [...toUpdate];
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const { error } = await supabase
        .from("production_sheets")
        .update(job.web)
        .eq("id", job.id)
        .eq("workspace_id", ctx.workspaceId);
      if (!error) report.updated++;
    }
  }));

  /* Paket hatası SESSİZ kalmaz: yarım kalan çekiş raporda söylenir. Tekrar
     çekmek güvenli — açılanlar web kimliğiyle bulunur, kopya oluşmaz. */
  if (insertError && report.created === 0 && report.updated === 0) {
    return { error: insertError };
  }

  await logWorkspaceActivity(supabase, {
    workspaceId: ctx.workspaceId, actorId: ctx.userId,
    action: "collection_web_synced", entityType: "production_sheet",
    entityLabel: "Web sitesi",
    metadata: { created: report.created, updated: report.updated, skipped: report.skipped },
  });

  revalidatePath("/collection");
  return report;
}

/**
 * Bir ürünü başka kategoriye taşır — "Upcycle'a gönder".
 *
 * Yalnız kategori ve alt kategori değişir; föyün içeriği, görselleri, web
 * bilgisi aynen kalır. Hedef anahtar kategori TABLOSUNDA olmalı: ekranda
 * seçilemeyen bir anahtarın doğrudan çağrıyla yazılması, föyü hiçbir kutuda
 * görünmeyen bir yere düşürürdü.
 */
export async function moveProductionSheet(
  sheetId: string,
  category: string,
  subcategory: string | null,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { data: cats } = await supabase
    .from("workspace_product_categories")
    .select("key, parent_key")
    .eq("workspace_id", ctx.workspaceId);
  const rows = (cats ?? []) as { key: string; parent_key: string | null }[];
  /* Tablo boşsa kod varsayılanı geçerlidir (Koleksiyon ekranıyla aynı kural);
     o durumda anahtar denetimi yapılamaz, ekrandaki liste zaten oradan gelir. */
  if (rows.length > 0) {
    const top = rows.find((r) => r.key === category && !r.parent_key);
    if (!top) return { error: "Böyle bir kategori yok." };
    if (subcategory && !rows.some((r) => r.key === subcategory && r.parent_key === category)) {
      return { error: "Alt kategori bu kategoriye ait değil." };
    }
  }

  const { data: sheet, error } = await supabase
    .from("production_sheets")
    .update({ category, subcategory: subcategory || null, updated_by: ctx.userId })
    .eq("id", sheetId)
    .eq("workspace_id", ctx.workspaceId)
    .select("title")
    .maybeSingle();
  if (error) return { error: toActionErrorMessage(error) };
  if (!sheet) return { error: "Föy bulunamadı." };

  await logWorkspaceActivity(supabase, {
    workspaceId: ctx.workspaceId, actorId: ctx.userId,
    action: "production_sheet_moved", entityType: "production_sheet",
    entityId: sheetId, entityLabel: (sheet as { title: string }).title,
    metadata: { category, subcategory },
  });

  revalidatePath("/collection");
  revalidatePath(`/production/${sheetId}`);
  return { ok: true };
}
