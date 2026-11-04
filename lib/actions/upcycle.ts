"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage } from "@/lib/utils/supabase-errors";
import { UPCYCLE_BUCKET, UPCYCLE_COLUMNS, upcyclePrefix } from "@/lib/upcycle/model";
import type { OrderReviewPhoto, UpcycleItem, UpcycleSection } from "@/types";

/**
 * UPCYCLE YAPILACAKLAR LİSTESİ — bütün yazma işleri (20240366).
 *
 * Gül Hanım'ın Excel'i (04.11.2026), Aslı Hanım "takvim gibi" uygulamada
 * olsun istedi. Tek yaşayan liste, iki bölüm (ürün · malzeme). Her üye
 * yazar; silme yönetici ya da satırı açan kişi (RLS aynı kuralı uygular).
 *
 * FOTOĞRAF BAYTLARI BURADAN GEÇMEZ: tarayıcı doğrudan Storage'a yükler
 * (Vercel'in 4,5 MB gövde sınırı). Buraya yalnız YOL gelir; adres sunucuda
 * yoldan üretilir, yol da çalışma alanının upcycle klasöründe olmalıdır.
 */

const AUTH_REQUIRED = "Kimlik doğrulama gerekli.";
const ITEM_NOT_FOUND = "Satır bulunamadı.";
const DELETE_DENIED = "Bu satırı yalnız açan kişi ya da yönetici silebilir.";
const IMPORT_BUCKET = "documents";
const ROOT = "/collection/upcycle";

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
const SectionSchema = z.enum(["urun", "malzeme"]);

const PhotoSchema = z.object({ path: z.string().min(1).max(500), url: z.string().max(2000).optional() });
const count = z.number().int().min(0).max(100_000_000);

const ItemPatchSchema = z.object({
  status_note: z.string().max(2000).optional(),
  owners: z.string().max(300).optional(),
  name: z.string().max(300).optional(),
  color: z.string().max(200).optional(),
  code: z.string().max(120).optional(),
  material_type: z.string().max(200).optional(),
  description: z.string().max(8000).optional(),
  sizes: z.object({
    XS: count.optional(), S: count.optional(), M: count.optional(),
    L: count.optional(), XL: count.optional(), ONE: count.optional(),
  }).strict().optional(),
  market212: count.nullable().optional(),
  retail_price: z.number().min(0).max(1_000_000_000).nullable().optional(),
  quantity: count.nullable().optional(),
  before_photos: z.array(PhotoSchema).max(30).optional(),
  after_photos: z.array(PhotoSchema).max(30).optional(),
});
export type UpcycleItemPatch = z.input<typeof ItemPatchSchema>;

const TEXT_FIELDS = ["status_note", "owners", "name", "color", "code", "material_type", "description"] as const;

function cleanPhotos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  list: { path: string }[],
  prefix: string,
): OrderReviewPhoto[] | null {
  const out: OrderReviewPhoto[] = [];
  for (const p of list) {
    if (!p.path.startsWith(prefix) || p.path.includes("..")) return null;
    const { data } = supabase.storage.from(UPCYCLE_BUCKET).getPublicUrl(p.path);
    out.push({ path: p.path, url: data.publicUrl });
  }
  return out;
}

export async function addUpcycleItem(
  section: UpcycleSection,
): Promise<{ item: UpcycleItem } | { error: string }> {
  const sec = SectionSchema.safeParse(section);
  if (!sec.success) return { error: "Geçersiz bölüm." };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { data: last } = await supabase
    .from("upcycle_items")
    .select("position")
    .eq("workspace_id", ctx.workspaceId)
    .eq("section", sec.data)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = last ? (last as { position: number }).position + 1 : 0;

  const { data, error } = await supabase
    .from("upcycle_items")
    .insert({
      workspace_id: ctx.workspaceId,
      section: sec.data,
      position,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select(UPCYCLE_COLUMNS)
    .single();
  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath(ROOT);
  return { item: data as unknown as UpcycleItem };
}

export async function updateUpcycleItem(
  itemId: string,
  patch: UpcycleItemPatch,
): Promise<{ item: UpcycleItem } | { error: string }> {
  const parsed = ItemPatchSchema.safeParse(patch);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  const prefix = upcyclePrefix(ctx.workspaceId);

  /* Yalnız GÖNDERİLEN alanlar yazılır; diziler ve bedenler BÜTÜN gelir
     (ekran hepsini tutuyor), gönderilmeyen alan yerinde kalır. */
  const v = parsed.data;
  const payload: Record<string, unknown> = { updated_by: ctx.userId };
  for (const k of TEXT_FIELDS) if (v[k] !== undefined) payload[k] = (v[k] as string).trim();
  for (const k of ["market212", "retail_price", "quantity"] as const) if (v[k] !== undefined) payload[k] = v[k];
  if (v.sizes !== undefined) payload.sizes = v.sizes;
  for (const k of ["before_photos", "after_photos"] as const) {
    if (v[k] === undefined) continue;
    const photos = cleanPhotos(supabase, v[k], prefix);
    if (!photos) return { error: "Fotoğraf bu listeye ait değil." };
    payload[k] = photos;
  }

  const { data, error } = await supabase
    .from("upcycle_items")
    .update(payload)
    .eq("id", itemId)
    .eq("workspace_id", ctx.workspaceId)
    .select(UPCYCLE_COLUMNS)
    .maybeSingle();
  if (error) return { error: toActionErrorMessage(error) };
  if (!data) return { error: ITEM_NOT_FOUND };
  revalidatePath(ROOT);
  return { item: data as unknown as UpcycleItem };
}

export async function deleteUpcycleItem(itemId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { data: row } = await supabase
    .from("upcycle_items")
    .select("id, created_by, before_photos, after_photos")
    .eq("id", itemId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!row) return { error: ITEM_NOT_FOUND };
  const item = row as Pick<UpcycleItem, "id" | "created_by" | "before_photos" | "after_photos">;
  if (!isAdmin(ctx.role) && item.created_by !== ctx.userId) return { error: DELETE_DENIED };

  const { error, count: n } = await supabase
    .from("upcycle_items")
    .delete({ count: "exact" })
    .eq("id", itemId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };
  if (n === 0) return { error: DELETE_DENIED };

  for (const p of [...(item.before_photos ?? []), ...(item.after_photos ?? [])]) {
    await removeIfUnused(supabase, ctx.workspaceId, p.path);
  }
  revalidatePath(ROOT);
  return { ok: true };
}

/** Başka satır hâlâ kullanmıyorsa fotoğrafın baytını siler (içe aktarmada
 *  aynı fotoğraf iki satırda olabilir). */
async function removeIfUnused(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  path: string,
) {
  if (!path.startsWith(upcyclePrefix(workspaceId)) || path.includes("..")) return;
  const { data } = await supabase
    .from("upcycle_items")
    .select("before_photos, after_photos")
    .eq("workspace_id", workspaceId);
  const stillUsed = ((data ?? []) as Pick<UpcycleItem, "before_photos" | "after_photos">[])
    .some((i) => [...(i.before_photos ?? []), ...(i.after_photos ?? [])].some((p) => p.path === path));
  if (!stillUsed) await supabase.storage.from(UPCYCLE_BUCKET).remove([path]);
}

/** Alandan kaldırılan fotoğrafın baytı. Kayıttan çıkarma `updateUpcycleItem`
 *  ile ÖNCE yapılır; bu yalnız depoyu temizler. */
export async function removeUpcyclePhoto(path: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!path.startsWith(upcyclePrefix(ctx.workspaceId)) || path.includes("..")) {
    return { error: "Fotoğraf bu listeye ait değil." };
  }
  await removeIfUnused(supabase, ctx.workspaceId, path);
  return { ok: true };
}

// ── EXCEL'DEN İÇE AKTARMA ───────────────────────────────────────────────────

/**
 * Tarayıcı .xlsx'i önce `documents/{ws}/_imports/…` altına yükler; bu eylem
 * onu okur, satırları listenin SONUNA ekler, geçici dosyayı siler.
 *
 * VERİ SİLİNMEZ: aktarım mevcut satırlara dokunmaz. Listede birebir aynısı
 * olan satır (bölüm · ad · renk · kod/tür) yeniden eklenmez — aynı dosyayı
 * iki kez yüklemek listeyi ikiye katlamasın.
 */
export async function importUpcycle(
  tempPath: string,
): Promise<{ added: number; skipped: number; warnings: string[] } | { error: string }> {
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

    const { parseUpcycleWorkbook } = await import("@/lib/upcycle/xlsx-import");
    let parsed;
    try {
      parsed = await parseUpcycleWorkbook(buf);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Excel okunamadı." };
    }
    if (parsed.items.length === 0) return { error: "Dosyada aktarılacak satır bulunamadı." };

    const { data: existing } = await supabase
      .from("upcycle_items")
      .select("section, position, name, color, code, material_type")
      .eq("workspace_id", ctx.workspaceId);
    const rows0 = (existing ?? []) as Pick<UpcycleItem, "section" | "position" | "name" | "color" | "code" | "material_type">[];
    const keyOf = (i: { section: string; name: string; color: string; code: string; material_type: string }) =>
      [i.section, i.name, i.color, i.code, i.material_type].map((x) => x.toLocaleLowerCase("tr").trim()).join("|");
    const have = new Set(rows0.map(keyOf));
    const fresh = parsed.items.filter((it) => !have.has(keyOf(it)));
    const skipped = parsed.items.length - fresh.length;
    if (fresh.length === 0) {
      return { added: 0, skipped, warnings: ["Dosyadaki bütün satırlar listede zaten var; hiçbir şey eklenmedi."] };
    }

    /* Fotoğraflar — aynı bayt bir kez yüklenir (içerik özetiyle adlanır). */
    const prefix = upcyclePrefix(ctx.workspaceId);
    const usedKeys = new Set(fresh.flatMap((i) => [...i.before, ...i.after]));
    const warnings = [...parsed.notes];
    const photoOf = new Map<string, OrderReviewPhoto>();
    const uploaded: string[] = [];
    let failed = 0;
    const queue = [...parsed.images.entries()].filter(([k]) => usedKeys.has(k));
    const worker = async () => {
      for (;;) {
        const next = queue.shift();
        if (!next) return;
        const [key, img] = next;
        const ext = img.ext === "jpg" ? "jpeg" : img.ext.replace(/[^a-z0-9]/g, "") || "png";
        const sha = createHash("sha256").update(img.buffer).digest("hex").slice(0, 32);
        const path = `${prefix}${sha}.${ext}`;
        const { error } = await supabase.storage
          .from(UPCYCLE_BUCKET)
          .upload(path, img.buffer, { contentType: `image/${ext}`, upsert: false });
        if (error && !/exists|duplicate|409/i.test(error.message ?? "")) { failed++; continue; }
        if (!error) uploaded.push(path);
        const { data } = supabase.storage.from(UPCYCLE_BUCKET).getPublicUrl(path);
        photoOf.set(key, { path, url: data.publicUrl });
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    if (failed) warnings.push(`${failed} fotoğraf yüklenemedi.`);

    const pick = (keys: string[]) => keys.map((k) => photoOf.get(k)).filter((p): p is OrderReviewPhoto => !!p);
    const nextPos: Record<UpcycleSection, number> = { urun: 0, malzeme: 0 };
    for (const r of rows0) nextPos[r.section] = Math.max(nextPos[r.section], r.position + 1);
    const rows = fresh.map((it) => ({
      workspace_id: ctx.workspaceId,
      section: it.section,
      position: nextPos[it.section]++,
      status_note: it.status_note,
      owners: it.owners,
      name: it.name,
      color: it.color,
      code: it.code,
      material_type: it.material_type,
      description: it.description,
      sizes: it.sizes,
      market212: it.market212,
      retail_price: it.retail_price,
      quantity: it.quantity,
      before_photos: pick(it.before),
      after_photos: pick(it.after),
      created_by: ctx.userId,
      updated_by: ctx.userId,
    }));
    const { error: insErr } = await supabase.from("upcycle_items").insert(rows);
    if (insErr) {
      /* Yarım kayıt bırakılmaz: bu aktarımın YENİ yüklediği fotoğraflar geri alınır. */
      if (uploaded.length) await supabase.storage.from(UPCYCLE_BUCKET).remove(uploaded);
      return { error: toActionErrorMessage(insErr) };
    }
    if (skipped) warnings.push(`${skipped} satır listede zaten vardı; yeniden eklenmedi.`);
    revalidatePath(ROOT);
    return { added: rows.length, skipped, warnings };
  } catch (err) {
    console.error("[upcycle] Excel aktarımı başarısız", { tempPath, err });
    return { error: "Excel aktarılamadı. Dosya bozuk ya da parola korumalı olabilir." };
  } finally {
    await supabase.storage.from(IMPORT_BUCKET).remove([tempPath]);
  }
}
