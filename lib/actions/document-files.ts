"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { toActionErrorMessage } from "@/lib/utils/supabase-errors";

// Dokümanlar — klasör ağacı + gerçek dosya yükleme (20240312).
//
// Aslı Hanım (2026-08-19): "Drive, Word, Excel hepsinin burada olduğu böyle
// klasör şeklinde ayırmayı düşündüm… maliyetine bir bak." Araştırma yapıldı
// (dokuman_depolama_maliyeti.md): Pro planda 100 GB dahil, AF'nin hacmi
// ~8,7 GB/yıl → ek maliyet ₺0.
//
// Bucket PRIVATE: sözleşme ve fatura herkese açık URL taşımamalı. Okuma imzalı
// URL ile — föy görsellerinden (public bucket) bilinçli olarak farklı.

const BUCKET = "documents";
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — bkz. migration notu
const AUTH_REQUIRED = "Kimlik doğrulama gerekli.";
const ADMIN_ONLY = "Klasörleri yalnız yöneticiler düzenleyebilir.";
const PERM_DENIED = "Bu işlem için yetkiniz yok.";
const NOT_FOUND = "Kayıt bulunamadı.";

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

// ── Klasör ──────────────────────────────────────────────────────────────────

const FolderSchema = z.object({
  name: z.string().min(1, "Klasör adı gerekli.").max(200),
  parent_id: z.string().uuid().optional().nullable(),
  visibility: z.enum(["all", "admin"]).default("admin"),
});
export type FolderInput = z.infer<typeof FolderSchema>;

export async function saveFolder(
  id: string | null,
  input: FolderInput,
): Promise<{ id: string } | { error: string }> {
  const parsed = FolderSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdmin(ctx.role)) return { error: ADMIN_ONLY };

  const v = parsed.data;
  // Klasör kendi altına taşınamaz — ağaç döngüye girerdi.
  if (id && v.parent_id === id) return { error: "Klasör kendi içine taşınamaz." };

  const payload = {
    name: v.name.trim(),
    parent_id: v.parent_id || null,
    visibility: v.visibility,
    updated_by: ctx.userId,
  };

  if (id) {
    const { error, count } = await supabase
      .from("document_folders")
      .update(payload, { count: "exact" })
      .eq("id", id).eq("workspace_id", ctx.workspaceId);
    if (error) {
      if (error.code === "23505") return { error: "Bu adda bir klasör zaten var." };
      return { error: toActionErrorMessage(error) };
    }
    if (count === 0) return { error: NOT_FOUND };
    revalidatePath("/documents");
    return { id };
  }

  const { data, error } = await supabase
    .from("document_folders")
    .insert({ workspace_id: ctx.workspaceId, ...payload, created_by: ctx.userId })
    .select("id").single();
  if (error) {
    if (error.code === "23505") return { error: "Bu adda bir klasör zaten var." };
    return { error: toActionErrorMessage(error) };
  }
  revalidatePath("/documents");
  return { id: (data as { id: string }).id };
}

/** Dolu klasör silinmez — içindekiler öksüz kalmasın (FK de restrict). */
export async function deleteFolder(id: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };
  if (!isAdmin(ctx.role)) return { error: ADMIN_ONLY };

  const [{ count: docs }, { count: subs }] = await Promise.all([
    supabase.from("operation_documents")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", ctx.workspaceId).eq("folder_id", id),
    supabase.from("document_folders")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", ctx.workspaceId).eq("parent_id", id),
  ]);
  if ((docs ?? 0) > 0 || (subs ?? 0) > 0) {
    return { error: `Klasör boş değil (${docs ?? 0} dosya, ${subs ?? 0} alt klasör). Önce içini boşaltın.` };
  }

  const { error } = await supabase
    .from("document_folders").delete()
    .eq("id", id).eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };
  revalidatePath("/documents");
  return { ok: true };
}

// ── Dosya ───────────────────────────────────────────────────────────────────

/**
 * Dosya yükler ve karşılığında bir doküman kaydı oluşturur.
 *
 * Yol: documents/{workspace_id}/{folder_id|kok}/{uuid}-{ad}
 * workspace_id önde olduğu için silme yetkisi yol üzerinden doğrulanabiliyor.
 */
export async function uploadDocumentFile(
  formData: FormData,
): Promise<{ id: string } | { error: string }> {
  const file = formData.get("file");
  const folderId = (formData.get("folder_id") as string | null) || null;
  if (!(file instanceof File)) return { error: "Dosya bulunamadı." };
  if (file.size === 0) return { error: "Dosya boş." };
  if (file.size > MAX_BYTES) {
    return { error: `Dosya 25 MB sınırını aşıyor (${(file.size / 1024 / 1024).toFixed(1)} MB).` };
  }

  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  // Dosya adı yolda kullanılacak — tehlikeli karakterleri temizle.
  const safeName = file.name.replace(/[^\w.\-() ğüşıöçĞÜŞİÖÇ]/g, "_").slice(0, 120);
  const path = `${ctx.workspaceId}/${folderId ?? "kok"}/${crypto.randomUUID()}-${safeName}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (upErr) return { error: upErr.message };

  const { data, error } = await supabase
    .from("operation_documents")
    .insert({
      workspace_id: ctx.workspaceId,
      title: file.name.slice(0, 300),
      document_type: "file",
      folder_id: folderId,
      file_path: path,
      file_name: file.name.slice(0, 300),
      file_size: file.size,
      file_mime: file.type || null,
      status: "approved",
      owner_id: ctx.userId,
      created_by: ctx.userId,
    })
    .select("id").single();
  if (error) {
    // Kayıt açılamadıysa yüklenen dosyayı bırakma — depoda öksüz kalmasın.
    await supabase.storage.from(BUCKET).remove([path]);
    return { error: toActionErrorMessage(error) };
  }

  revalidatePath("/documents");
  return { id: (data as { id: string }).id };
}

/**
 * İndirme bağlantısı. Bucket private olduğu için imzalı URL üretilir —
 * 60 saniye geçerli, paylaşılan bağlantı kalıcı erişim vermez.
 */
export async function getDocumentDownloadUrl(
  documentId: string,
): Promise<{ url: string; name: string } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { data: doc } = await supabase
    .from("operation_documents")
    .select("file_path, file_name, title")
    .eq("id", documentId).eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  const row = doc as { file_path: string | null; file_name: string | null; title: string } | null;
  if (!row?.file_path) return { error: "Bu kayıtta yüklenmiş dosya yok." };

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(row.file_path, 60);
  if (error || !data) return { error: error?.message ?? "Bağlantı üretilemedi." };
  return { url: data.signedUrl, name: row.file_name ?? row.title };
}

/** Dosyayı hem depodan hem kayıttan siler. */
export async function deleteDocumentFile(
  documentId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { data: doc } = await supabase
    .from("operation_documents")
    .select("file_path, created_by")
    .eq("id", documentId).eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  const row = doc as { file_path: string | null; created_by: string | null } | null;
  if (!row) return { error: NOT_FOUND };
  // Yükleyen ya da yönetici silebilir.
  if (!isAdmin(ctx.role) && row.created_by !== ctx.userId) return { error: PERM_DENIED };

  if (row.file_path) {
    if (!row.file_path.startsWith(`${ctx.workspaceId}/`)) return { error: PERM_DENIED };
    await supabase.storage.from(BUCKET).remove([row.file_path]);
  }
  const { error } = await supabase
    .from("operation_documents").delete()
    .eq("id", documentId).eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };

  revalidatePath("/documents");
  return { ok: true };
}

/** Dosyayı başka klasöre taşı. */
export async function moveDocument(
  documentId: string,
  folderId: string | null,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const ctx = await getCtx(supabase);
  if (!ctx) return { error: AUTH_REQUIRED };

  const { error, count } = await supabase
    .from("operation_documents")
    .update({ folder_id: folderId }, { count: "exact" })
    .eq("id", documentId).eq("workspace_id", ctx.workspaceId);
  if (error) return { error: toActionErrorMessage(error) };
  if (count === 0) return { error: NOT_FOUND };
  revalidatePath("/documents");
  return { ok: true };
}
