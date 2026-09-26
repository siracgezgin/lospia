"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage } from "@/lib/utils/supabase-errors";
import { logWorkspaceActivity, WORKSPACE_ACTIONS } from "@/lib/activity/log-workspace-activity";
import { sanitizeRichText } from "@/lib/office/sanitize-html";
import { MAX_UPLOAD_BYTES } from "@/lib/utils/compress-image";

// Doküman Merkezi — a link/metadata registry (no file storage). Unlike the
// admin-only Kreatif Linkler, members participate here: they create drafts and
// edit their own records until approval; owner/admin manages everything.
// RLS on operation_documents is the DB-level backstop; these checks produce
// clean Turkish errors and set created_by/archived_at correctly.

const PERM_DENIED = "Bu işlem için yetkiniz yok.";
const AUTH_REQUIRED = "Kimlik doğrulama gerekli.";
const NOT_FOUND = "Doküman bulunamadı.";
const ADMIN_ROLES: AppRole[] = ["owner", "admin"];

const uuidOrNull = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  .optional()
  .nullable()
  .or(z.literal(""));

const DocumentSchema = z.object({
  /* Sınır mesajları TÜRKÇE: Zod'un varsayılan metni ("String must contain at
     most …") doğrudan arayüzdeki hata şeridine basılıyordu. */
  title: z.string().min(1, "Başlık gerekli").max(300, "Başlık en fazla 300 karakter olabilir."),
  description: z.string().max(4000, "Açıklama en fazla 4.000 karakter olabilir.").optional().nullable(),
  document_type: z.enum([
    "drive_link", "google_doc", "google_sheet", "canva", "figma", "pdf_link",
    "word_link", "excel_link", "website", "internal_note", "other",
  ]),
  url: z
    .string()
    .max(2000, "Bağlantı en fazla 2.000 karakter olabilir.")
    .refine((v) => v.trim() === "" || /^https?:\/\//i.test(v.trim()), "Geçerli bir bağlantı girin (https://…)")
    .optional()
    .nullable(),
  status: z.enum(["draft", "in_review", "approved", "archived"]),
  department_id: uuidOrNull,
  related_task_id: uuidOrNull,
  related_contact_id: uuidOrNull,
  tags: z
    .array(z.string().max(60, "Bir etiket en fazla 60 karakter olabilir."))
    .max(20, "En fazla 20 etiket eklenebilir.")
    .optional(),
  notes: z.string().max(4000, "Not en fazla 4.000 karakter olabilir.").optional().nullable(),
  /* Bağlantı da AF Teamwork'te bir KLASÖRÜN içinde yaşar (2026-08-29) —
     "Bağlantılar" diye ayrı bir bölüm kalmadı. */
  folder_id: uuidOrNull,
});

export type DocumentInput = z.infer<typeof DocumentSchema>;

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

type Ctx = NonNullable<Awaited<ReturnType<typeof getCtx>>>;

function isAdmin(ctx: Ctx): boolean {
  return ADMIN_ROLES.includes(ctx.role);
}

function normalize(v: DocumentInput) {
  const nn = (s?: string | null) => {
    const t = (s ?? "").trim();
    return t.length ? t : null;
  };
  return {
    title: v.title.trim(),
    description: nn(v.description),
    document_type: v.document_type,
    url: nn(v.url),
    status: v.status,
    department_id: nn(v.department_id),
    related_task_id: nn(v.related_task_id),
    related_contact_id: nn(v.related_contact_id),
    tags: (v.tags ?? []).map((t) => t.trim()).filter(Boolean),
    notes: nn(v.notes),
    folder_id: nn(v.folder_id),
  };
}

/** Fetch the existing row and decide whether this caller may modify it. */
async function loadEditable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ctx: Ctx,
  documentId: string,
): Promise<{ createdBy: string | null; status: string } | { error: string }> {
  const { data: row, error } = await supabase
    .from("operation_documents")
    .select("id, created_by, status")
    .eq("id", documentId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (error) return { error: toActionErrorMessage(error) };
  if (!row) return { error: NOT_FOUND };
  const createdBy = row.created_by as string | null;
  const status = row.status as string;
  /* Kural RLS'le (20240346) BİREBİR aynı: AF Teamwork ortak çalışma alanıdır,
     içeriği çalışma alanındaki herkes düzenler. "Yönetici ya da ekleyen"
     şartı kalktı — biri dosyayı ekleyince diğerleri üstünde çalışamıyordu.
     ARŞİV kapalıdır: arşivlemek "buna artık dokunulmasın" demenin yoludur ve
     yöneticinin bilinçli olarak geri açması gerekir.
     Kim SİLEBİLİR ayrı bir sorudur; delete kendi kuralını taşır. */
  if (status === "archived") return { error: PERM_DENIED };
  return { createdBy, status };
}

export async function createOperationDocument(
  input: DocumentInput,
): Promise<{ id: string } | { error: string }> {
  const parsed = DocumentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const data = normalize(parsed.data);
  /* DURUM ARTIK ERİŞİM KAPISI DEĞİL (20240344). Burada üyenin kaydı zorla
     'draft' işaretleniyordu ve RLS taslakları sahibinden başkasına
     göstermiyordu; yani üyenin eklediği bağlantı/yazı, görünürlüğü 'all' olsa
     bile kimseye görünmüyordu. Kimin göreceğini yalnız `visibility` söyler. */

  const { data: row, error } = await supabase
    .from("operation_documents")
    .insert({
      workspace_id: ctx.workspaceId,
      created_by: ctx.userId,
      owner_id: ctx.userId,
      archived_at: data.status === "archived" ? new Date().toISOString() : null,
      ...data,
    })
    .select("id")
    .single();

  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/documents");
  return { id: (row as { id: string }).id };
}

export async function updateOperationDocument(
  documentId: string,
  input: DocumentInput,
): Promise<{ ok: true } | { error: string }> {
  const parsed = DocumentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const editable = await loadEditable(supabase, ctx, documentId);
  if ("error" in editable) return editable;

  const data = normalize(parsed.data);
  /* DURUM HERKESİN DEĞİL. İçeriği herkes düzenler (20240346) ama "arşivle"
     kaydı listeden düşürür ve düzenlemeye kapatır — bir üye başkasının
     yazısını böyle kapatabilmemeli. Yönetici ve ekleyen serbest; diğerlerinde
     durum olduğu gibi bırakılır. */
  const mayChangeStatus = isAdmin(ctx) || editable.createdBy === ctx.userId;
  /* SESSİZCE GERİ ALMA YOK. Eskiden burada `data.status` eski değerine
     çevriliyordu: sıradan üye Taslak/Onayda seçip kaydediyor, "kaydedildi"
     görüyor ama durum hiç değişmemiş oluyordu. Yapılamayan şey söylenir. */
  if (!mayChangeStatus && data.status !== editable.status) {
    return { error: "Durumu yalnız kaydı ekleyen kişi ya da bir yönetici değiştirebilir." };
  }

  const { error } = await supabase
    .from("operation_documents")
    .update({
      ...data,
      archived_at: data.status === "archived" ? new Date().toISOString() : null,
    })
    .eq("id", documentId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/documents");
  return { ok: true };
}

// Prefer archive over hard delete — non-destructive; admin-only.
export async function archiveOperationDocument(
  documentId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdmin(ctx)) return { error: PERM_DENIED };

  const { error } = await supabase
    .from("operation_documents")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/documents");
  return { ok: true };
}

/**
 * ARŞİVDEN ÇIKAR — arşiv kilidinin TEK deliği.
 *
 * `loadEditable` arşivli satırı herkese kapatıyor ("buna artık dokunulmasın")
 * ama geri açan bir yol yoktu: arşivlenen kayıt kalıcı olarak donuyordu, üstelik
 * /documents listesi arşivlileri hiç göstermediği için yönetici onu bir daha
 * bulamıyordu bile. Kilit yalnız burada delinir — kayıt okunurken arşivli
 * olmasına bakılmaz, tek yaptığı iş durumu geri çevirmek.
 *
 * Kural ARŞİVLEYEBİLENLE aynı (yönetici ya da ekleyen, bkz. mayChangeStatus);
 * yalnız yöneticide olsaydı üye kendi kapattığı yazıyı geri açamazdı.
 */
export async function unarchiveOperationDocument(
  documentId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { data: row, error: readErr } = await supabase
    .from("operation_documents")
    .select("created_by, status")
    .eq("id", documentId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (readErr) return { error: toActionErrorMessage(readErr) };
  if (!row) return { error: NOT_FOUND };
  const { created_by: createdBy, status } = row as { created_by: string | null; status: string };
  if (status !== "archived") return { ok: true };
  if (!isAdmin(ctx) && createdBy !== ctx.userId) {
    return { error: "Arşivden çıkarmayı yalnız kaydı ekleyen kişi ya da bir yönetici yapabilir." };
  }

  /* Durum "onaylandı"ya döner — yeni kayıtların başladığı yer (createTeamworkDoc)
     ve listede herkese görünen hâl. `archived_at` temizlenir ki kayıt "arşivde
     duruyor" gibi okunmasın. */
  const { error } = await supabase
    .from("operation_documents")
    .update({ status: "approved", archived_at: null })
    .eq("id", documentId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };

  revalidatePath("/documents");
  return { ok: true };
}

/**
 * GÖRÜNÜRLÜK — "tüm üyelere göster" / "yalnız yöneticiye kapat".
 *
 * Sıraç (2026-08-30): "Klasördeki gibi diğerlerinde de tüm üyelere göster
 * kısmı da olsun." Klasörde vardı, yazı/tablo/dosyada yoktu; aynı Drive'ın
 * içinde iki farklı kural işliyordu. Kaydı yönetebilen (yönetici ya da
 * ekleyen) görünürlüğünü de belirler.
 */
export async function setOperationDocumentVisibility(
  documentId: string,
  visibility: "all" | "admin",
): Promise<{ ok: true } | { error: string }> {
  if (visibility !== "all" && visibility !== "admin") return { error: "Geçersiz görünürlük." };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  if (!isAdmin(ctx)) {
    const { data: row } = await supabase
      .from("operation_documents")
      .select("created_by")
      .eq("id", documentId)
      .eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    if (!row) return { error: NOT_FOUND };
    if ((row as { created_by: string | null }).created_by !== ctx.userId) {
      return { error: PERM_DENIED };
    }
  }

  const { error } = await supabase
    .from("operation_documents")
    /* `updated_by` YAZILMAZ: bu tabloda öyle bir sütun yok (yalnız
       document_folders'ta var). Yazmaya çalışmak PostgREST'ten "column not
       found" (PGRST204) döndürüyordu ve arayüz bunu "migration bekleniyor"
       diye okuyordu — oysa şema eksik değildi. `updated_at`i tablo kendi
       trigger'ıyla günceller. */
    .update({ visibility })
    .eq("id", documentId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };

  revalidatePath("/documents");
  return { ok: true };
}

/**
 * Kalıcı silme: yönetici her kaydı, ÜYE KENDİ EKLEDİĞİNİ siler.
 *
 * Sıraç (2026-08-30): "Üye kendi eklediği yazıyı, klasörü vs silebilme yetkisi
 * olsun." Önceden üye yalnız TASLAK durumundaki kendi kaydını silebiliyordu:
 * yüklediği dosya ya da yayımladığı yazı üzerinde hiçbir hakkı kalmıyordu ve
 * yanlış yüklenen bir dosyayı kaldırmak için yöneticiye başvurmak gerekiyordu.
 * Aynı kural RLS'te de yazılı (20240334); buradaki kontrol yalnız net bir hata
 * mesajı verebilmek için.
 */
export async function deleteOperationDocument(
  documentId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  if (!isAdmin(ctx)) {
    const { data: row } = await supabase
      .from("operation_documents")
      .select("created_by")
      .eq("id", documentId)
      .eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    if (!row) return { error: NOT_FOUND };
    if ((row as { created_by: string | null }).created_by !== ctx.userId) {
      return { error: PERM_DENIED };
    }
  }

  /* Silinen kaydın ADI önce okunur — satır gittikten sonra günlükte okunur
     tek iz odur (2026-08-29). */
  const { data: doomed } = await supabase
    .from("operation_documents")
    .select("title")
    .eq("id", documentId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  const { error } = await supabase
    .from("operation_documents")
    .delete()
    .eq("id", documentId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: toActionErrorMessage(error) };

  await logWorkspaceActivity(supabase, {
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    action: WORKSPACE_ACTIONS.DOCUMENT_DELETED,
    entityType: "document",
    entityId: documentId,
    entityLabel: (doomed as { title?: string } | null)?.title ?? null,
  });

  revalidatePath("/documents");
  return { ok: true };
}

// ── YAZI (Word karşılığı) — 20240325 ────────────────────────────────────────
//
// Aslı Hanım (2026-08-28): "Excel'in yanına Word'ü de gir. Alev mesela buna
// 'online influencer marketing format' diye o dosyayı buraya girsin. Bize
// sunum yaparken biz buradan açalım, Alev'in mailini okuyalım, revize verelim
// ve o bir format olarak hazırlansın."
//
// Yazı gövdesi HTML'dir ve BURADA temizlenir — veritabanına ham girdi girmez.

const DocBodySchema = z.object({
  title: z.string().min(1, "Başlık gerekli").max(300, "Başlık en fazla 300 karakter olabilir."),
  body: z
    .string()
    .max(400_000, "Yazı çok uzun (400.000 karakter sınırı).")
    .optional()
    .nullable(),
});

export async function createTeamworkDoc(
  input: { title: string; folder_id?: string | null; section?: "teamwork" | "library" },
): Promise<{ id: string } | { error: string }> {
  const parsed = z
    .object({
      title: z.string().min(1, "Başlık gerekli").max(300, "Başlık en fazla 300 karakter olabilir."),
      folder_id: uuidOrNull,
      // Bölüm (20240327) — klasörsüz yazı da doğru ekranda kalsın.
      section: z.enum(["teamwork", "library"]).default("teamwork"),
    })
    .safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const folderId = (parsed.data.folder_id ?? "") || null;
  const { data: row, error } = await supabase
    .from("operation_documents")
    .insert({
      workspace_id: ctx.workspaceId,
      created_by: ctx.userId,
      owner_id: ctx.userId,
      title: parsed.data.title.trim(),
      document_type: "doc",
      /* Eklenen her şey açık başlar — üye/yönetici farkı yok (20240344). */
      status: "approved",
      folder_id: folderId,
      section: parsed.data.section,
      body: "",
    })
    .select("id")
    .single();

  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/documents");
  return { id: (row as { id: string }).id };
}

export async function saveTeamworkDoc(
  documentId: string,
  input: { title: string; body?: string | null },
): Promise<{ ok: true } | { error: string }> {
  const parsed = DocBodySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const gate = await loadEditable(supabase, ctx, documentId);
  if ("error" in gate) return { error: gate.error };

  const { error } = await supabase
    .from("operation_documents")
    .update({
      title: parsed.data.title.trim(),
      // Temizlik SUNUCUDA — istemciden gelen HTML'e asla güvenilmez.
      body: sanitizeRichText(parsed.data.body),
    })
    .eq("id", documentId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) return { error: toActionErrorMessage(error) };

  /* revalidatePath BİLEREK ÇAĞRILMIYOR — tablo (sheets.ts) ve föy
     (production.ts) editörleriyle aynı karar.

     DocEditor son tuştan 1,5 saniye sonra buraya geliyor. Sunucu eyleminden
     yapılan revalidatePath yola BAKMADAN "bu eylem tazeledi" bayrağını
     kaldırıyor; yani yalnız `/documents` bırakılsa bile yazının sayfası
     yeniden çiziliyor ve istemcinin bütün gezinme önbelleği siliniyordu
     (Next 16 belgesi: "…it also causes all previously visited pages to
     refresh when navigated to again"). Yazarken her duraksamada bir tam
     sunucu çizimi demekti; yazıdan Pano'ya geçiş de bu yüzden ağırlaşıyordu.

     Yazının doğruluk kaynağı editörün kendi belleği. Ctrl+S / "Kaydet" yolu
     zaten router.refresh() çağırıyor, /documents listesi force-dynamic
     olduğu için bir sonraki gezinmede taze geliyor; sayfadan ayrılırken
     atılan son kayıt da artık gidişi yavaşlatmıyor. */
  return { ok: true };
}

/**
 * Yazının içine görsel yükler ve KALICI bir URL döner (20240328).
 *
 * Aslı Hanım (2026-08-29): "Word'de… resim vs ekleyemiyor muyuz."
 *
 * `documents` bucket'ı private ve imzalı URL'i 60 saniyede sönüyor; gövdeye
 * gömülen <img> ertesi gün kırılırdı. Bu yüzden satır içi görseller ayrı,
 * public bir bucket'ta yaşar (yol UUID içerir). Ayrıntılı gerekçe migration
 * dosyasında.
 */
/* MIME → uzantı. `file.type` TAMAMEN istemci denetimindedir; bu yüzden hem
   depolanan uzantı hem de yazılan content-type buradan TÜRETİLİR — istemciden
   gelen dosya adı ya da başlık olduğu gibi depoya geçmez (public bucket'ta
   keyfi içerik barındırılmasın). */
const IMAGE_EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export async function uploadDocImage(
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Görsel bulunamadı." };
  if (file.size === 0) return { error: "Görsel boş." };
  /* Tavan istemciyle TEK KAYNAKTAN gelir (4 MB). Burada 5 MB yazıyordu ve
     Vercel'in 4,5 MB'lık SERT gövde sınırının üstünde kaldığı için bu nazik
     Türkçe cümle canlıda hiç görünemiyordu: istek taşıma katmanında kesiliyor,
     ekrana İngilizce bir ağ hatası düşüyordu. */
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: `Görsel ${MAX_UPLOAD_BYTES / 1024 / 1024} MB sınırını aşıyor (${(file.size / 1024 / 1024).toFixed(1)} MB).` };
  }
  const mime = file.type.toLowerCase().split(";")[0].trim();
  const ext = IMAGE_EXT_BY_MIME[mime];
  if (!ext) {
    return { error: "Yalnız PNG, JPEG, WebP, GIF ve AVIF yüklenebilir." };
  }

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const path = `${ctx.workspaceId}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("teamwork-images")
    .upload(path, file, { contentType: mime, upsert: false });
  if (upErr) return { error: upErr.message };

  const { data } = supabase.storage.from("teamwork-images").getPublicUrl(path);
  return { url: data.publicUrl };
}
