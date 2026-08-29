"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage } from "@/lib/utils/supabase-errors";
import { logWorkspaceActivity, WORKSPACE_ACTIONS } from "@/lib/activity/log-workspace-activity";
import { sanitizeRichText } from "@/lib/office/sanitize-html";

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
  title: z.string().min(1, "Başlık gerekli").max(300),
  description: z.string().max(4000).optional().nullable(),
  document_type: z.enum([
    "drive_link", "google_doc", "google_sheet", "canva", "figma", "pdf_link",
    "word_link", "excel_link", "website", "internal_note", "other",
  ]),
  url: z
    .string()
    .max(2000)
    .refine((v) => v.trim() === "" || /^https?:\/\//i.test(v.trim()), "Geçerli bir bağlantı girin (https://…)")
    .optional()
    .nullable(),
  status: z.enum(["draft", "in_review", "approved", "archived"]),
  department_id: uuidOrNull,
  related_task_id: uuidOrNull,
  related_contact_id: uuidOrNull,
  tags: z.array(z.string().max(60)).max(20).optional(),
  notes: z.string().max(4000).optional().nullable(),
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
  const authorEditable =
    createdBy === ctx.userId && (status === "draft" || status === "in_review");
  if (!isAdmin(ctx) && !authorEditable) return { error: PERM_DENIED };
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
  // Members always start at draft — only owner/admin publishes directly.
  if (!isAdmin(ctx)) data.status = "draft";

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
  // A member may move own draft ↔ in_review but never approve/archive.
  if (!isAdmin(ctx) && data.status !== "draft" && data.status !== "in_review") {
    data.status = editable.status as DocumentInput["status"];
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
    .update({ visibility, updated_by: ctx.userId })
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
  title: z.string().min(1, "Başlık gerekli").max(300),
  body: z.string().max(400_000).optional().nullable(),
});

export async function createTeamworkDoc(
  input: { title: string; folder_id?: string | null; section?: "teamwork" | "library" },
): Promise<{ id: string } | { error: string }> {
  const parsed = z
    .object({
      title: z.string().min(1, "Başlık gerekli").max(300),
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
      status: isAdmin(ctx) ? "approved" : "draft",
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
  revalidatePath("/documents");
  revalidatePath(`/documents/${documentId}`);
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
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];

export async function uploadDocImage(
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Görsel bulunamadı." };
  if (file.size === 0) return { error: "Görsel boş." };
  if (file.size > IMAGE_MAX_BYTES) {
    return { error: `Görsel 5 MB sınırını aşıyor (${(file.size / 1024 / 1024).toFixed(1)} MB).` };
  }
  if (!IMAGE_MIME.includes(file.type)) {
    return { error: "Yalnız PNG, JPEG, WebP, GIF ve AVIF yüklenebilir." };
  }

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const ext = (file.name.split(".").pop() ?? "png").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "png";
  const path = `${ctx.workspaceId}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("teamwork-images")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { error: upErr.message };

  const { data } = supabase.storage.from("teamwork-images").getPublicUrl(path);
  return { url: data.publicUrl };
}
