"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage, isMissingSchemaError } from "@/lib/utils/supabase-errors";
import { fetchWebsiteProducts } from "@/lib/collection/website";
import type { WebTextField } from "@/lib/collection/website-export";
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

/**
 * SİTE İLE ALIŞVERİŞ YALNIZ SİSTEM ADMİNİNDE.
 *
 * Sıraç (2026-09-17): "Siteden çekme kısmını sadece admin yapabilsin,
 * yönetici de yapamasın."
 *
 * Yönetici (admin) rolü koleksiyonun her yerinde yetkili — föy açar, siler,
 * kategori düzenler, ürünü Upcycle'a gönderir. Ama bu iki düğme çalışma
 * alanının DIŞINA bağlanıyor: biri tek tıkla 161 föyü birden yazıyor, öteki
 * markanın canlı satış sitesine gidecek dosyayı üretiyor. Yanlış zamanda
 * basılan bir düğmenin bedeli koleksiyonun tamamı; o yüzden kapı daraltıldı.
 */
const SYSTEM_ADMIN_ONLY = "Site ile alışveriş yalnız Sistem Admini'ne açık.";

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
  /** Sitede var ama koleksiyon taksonomisinde yeri olmayan ürünler. Çare
   *  kodda değil ekranda: kategoriyi aç, `CATEGORY_MAP`'e slug'ı ekle, tekrar
   *  çek. (Kilims ve Chests 2026-09-17'de böyle kazanıldı.) */
  skipped: number;
  skippedNames: string[];
  membershipFailures: number;
  /** Föyde elle yazılmış olduğu için KORUNAN metinler — siteye gönderilmeyi
   *  bekliyorlar. Ezilmediler; sayı ekranda "siteye gönder" davetidir. */
  kept: number;
  /** Hem föyde hem sitede değişmiş metin: hangisinin doğru olduğuna makine
   *  karar veremez, föydeki korunur ve adı raporlanır. */
  conflicts: string[];
}

/** Sitesi olan föyün, çekişin dokunmaması gereken üç metni. Tip
 *  `website-export`'tan gelir: CSV'ye giden alanlar ile çekişin koruduğu
 *  alanlar AYNI küme olmalı, yoksa biri ezer öteki gönderir. */
const WEB_TEXT_FIELDS: readonly WebTextField[] = ["designers_note", "size_fit", "details_care"];

type Baseline = Partial<Record<WebTextField, string>>;

function readBaseline(v: unknown): Baseline {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Baseline;
  if (typeof v === "string" && v.trim().startsWith("{")) {
    try { return JSON.parse(v) as Baseline; } catch { return {}; }
  }
  return {};
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
  if (ctx.role !== "owner") return { error: SYSTEM_ADMIN_ONLY };

  let fetched: Awaited<ReturnType<typeof fetchWebsiteProducts>>;
  try {
    fetched = await fetchWebsiteProducts();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Web sitesine ulaşılamadı." };
  }

  const { data: existing, error: exErr } = await supabase
    .from("production_sheets")
    .select("id, web_product_id, designers_note, size_fit, details_care, web_baseline")
    .eq("workspace_id", ctx.workspaceId)
    .not("web_product_id", "is", null);
  if (exErr) {
    if (isMissingSchemaError(exErr)) {
      return { error: "Veritabanı güncellemesi bekleniyor (20240347–20240348). Yönetici `supabase db push` çalıştırmalı." };
    }
    return { error: toActionErrorMessage(exErr) };
  }
  type Row = { id: string; web_product_id: number; web_baseline: unknown } & Record<WebTextField, string | null>;
  const sheetByWeb = new Map(((existing ?? []) as Row[]).map((r) => [Number(r.web_product_id), r]));

  const now = new Date().toISOString();
  const report: WebsiteSyncReport = {
    created: 0, updated: 0, skipped: 0, skippedNames: [],
    membershipFailures: fetched.membershipFailures,
    kept: 0, conflicts: [],
  };

  /* YAZIM TOPLU. İlk çekişte ~150 föy açılıyor; tek tek insert her biri için
     ayrı bir ağ turu demekti ve sunucu aksiyonunun süre sınırına dayanırdı —
     yarıda kesilen bir çekiş, hangi ürünün açılıp hangisinin açılmadığını
     belirsiz bırakırdı. Yeniler 50'şerli PAKETLE yazılır; güncellemeler
     (ikinci çekiş) altılı havuzla. */
  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; web: Record<string, unknown> }[] = [];

  for (const p of fetched.products) {
    const siteText: Record<WebTextField, string> = {
      designers_note: p.designersNote,
      size_fit: p.sizeFit,
      details_care: p.detailsCare,
    };
    /* Tartışmasız alanlar: sitenin kimliği, adresi, dekupeleri. Bunları ekip
       föyde yazmıyor, her çekişte sitedeki hali geçerlidir. */
    const common = {
      web_product_id: p.id,
      web_url: p.url,
      web_name: p.name,
      web_images: p.images,
      web_synced_at: now,
      updated_by: ctx.userId,
    };

    const row = sheetByWeb.get(p.id);
    if (row) {
      const agreed = readBaseline(row.web_baseline);
      const next: Record<string, unknown> = { ...common };
      const baseline: Baseline = { ...agreed };
      let keptHere = false;
      let conflictHere = false;
      for (const f of WEB_TEXT_FIELDS) {
        const site = siteText[f] ?? "";
        const own = row[f] ?? "";
        const last = agreed[f] ?? "";
        if (own === last) {
          /* Föyde kimse dokunmamış → site neyse o, mutabakat yenilenir.
             Kullanıcı CSV'yi yükledikten sonra buraya düşer: site artık
             föydekini söylüyor, ikisi eşitlenir ve bekleyen iş kapanır. */
          next[f] = site || null;
          baseline[f] = site;
          continue;
        }
        /* Föyde emek var: EZME ve mutabakatı da ilerletme — o metin hâlâ
           siteye gönderilmeyi bekliyor. */
        keptHere = true;
        if (site !== last) conflictHere = true;
      }
      if (keptHere) report.kept++;
      if (conflictHere) report.conflicts.push(p.name);
      next.web_baseline = baseline;
      toUpdate.push({ id: row.id, web: next });
      continue;
    }
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
      designers_note: siteText.designers_note || null,
      size_fit: siteText.size_fit || null,
      details_care: siteText.details_care || null,
      /* Yeni föy siteyle doğuştan mutabık. */
      web_baseline: siteText,
      ...common,
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

/* ── SİTEYE GÖNDERİM ─────────────────────────────────────────────────────── */

export interface PendingWebEdit {
  sheetId: string;
  webProductId: number;
  /** Föydeki ad — ekran bunu gösterir, kullanıcı föyü bu adla tanıyor. */
  title: string;
  /** Sitedeki ad — CSV'nin doğru ürüne gittiğini kullanıcı buradan doğrular. */
  webName: string | null;
  /** Yalnız DEĞİŞEN alanlar ve föydeki yeni değerleri. */
  texts: Partial<Record<WebTextField, string>>;
}

/**
 * Föyde elle yazılmış, sitede henüz olmayan metinler.
 *
 * "Föydeki değer ≠ son mutabakat" ölçütü. Siteye SORULMAZ: gönderim listesini
 * çizmek için 161 ürünü tekrar çekmek gereksiz — kullanıcı CSV'yi
 * WooCommerce'e yükledikten sonraki çekiş mutabakatı zaten yeniler ve föy
 * listeden kendiliğinden düşer.
 */
export async function pendingWebEdits(): Promise<{ items: PendingWebEdit[] } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  /* Gönderim çekişten DAHA kritik: ürettiği dosya sitenin ürün sayfalarını
     değiştiriyor. Aynı kapı. */
  if (ctx.role !== "owner") return { error: SYSTEM_ADMIN_ONLY };

  const { data, error } = await supabase
    .from("production_sheets")
    .select("id, title, web_name, web_product_id, designers_note, size_fit, details_care, web_baseline")
    .eq("workspace_id", ctx.workspaceId)
    .eq("status", "active")
    .not("web_product_id", "is", null);
  if (error) {
    if (isMissingSchemaError(error)) {
      return { error: "Veritabanı güncellemesi bekleniyor (20240348). Yönetici `supabase db push` çalıştırmalı." };
    }
    return { error: toActionErrorMessage(error) };
  }

  type Row = { id: string; title: string; web_name: string | null; web_product_id: number; web_baseline: unknown }
    & Record<WebTextField, string | null>;
  const items: PendingWebEdit[] = [];
  for (const row of (data ?? []) as Row[]) {
    const agreed = readBaseline(row.web_baseline);
    const texts: Partial<Record<WebTextField, string>> = {};
    for (const f of WEB_TEXT_FIELDS) {
      const own = row[f] ?? "";
      if (own !== (agreed[f] ?? "")) texts[f] = own;
    }
    if (Object.keys(texts).length === 0) continue;
    items.push({
      sheetId: row.id,
      webProductId: Number(row.web_product_id),
      title: row.title,
      webName: row.web_name,
      texts,
    });
  }

  items.sort((a, b) => a.title.localeCompare(b.title, "tr"));
  return { items };
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
