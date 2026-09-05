"use server";
// Module: Uploads — gated by NEXT_PUBLIC_FEATURE_UPLOADS_ENABLED=true
// Supabase Storage: task-attachments/{workspace_id}/{task_id}/{uuid}
//
// The bucket is PRIVATE (see the storage policies in the initial migration:
// only workspace members may read), so links are short-lived signed URLs —
// getPublicUrl would hand back an address that 404s for everyone.
//
// Every write goes through the normal RLS client: a person can only attach a
// file to a workspace they belong to. Max file size: 5 MB. No versioning,
// no image transforms.

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { featureFlags } from "@/lib/utils/feature-flags";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const BUCKET = "task-attachments";
/** İmzalı bağlantı ömrü — bir görev ekranı için fazlasıyla yeterli. */
const SIGNED_URL_SECONDS = 60 * 60;

export type UploadResult = { id: string; url: string } | { error: string };

/** Anahtar/oturum bilgisi taşımayan düz hata metni. */
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function uploadTaskAttachment(
  taskId: string,
  workspaceId: string,
  formData: FormData,
): Promise<UploadResult> {
  if (!featureFlags.uploads) {
    return { error: "Dosya yükleme kapalı." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Dosya seçilmedi." };
  if (file.size === 0) return { error: "Dosya boş." };
  if (file.size > MAX_BYTES) return { error: "Dosya 5 MB sınırını aşıyor." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  const fileId = crypto.randomUUID();
  const storagePath = `${workspaceId}/${taskId}/${fileId}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    console.error("[uploads] dosya yüklenemedi:", uploadError.message);
    return { error: "Dosya yüklenemedi." };
  }

  const { data: insertedRow, error: dbError } = await supabase
    .from("task_attachments")
    .insert({
      id: fileId,
      task_id: taskId,
      workspace_id: workspaceId,
      uploaded_by: user.id,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || "application/octet-stream",
      storage_path: storagePath,
    })
    .select("id")
    .single();
  const inserted = insertedRow as { id: string } | null;

  if (dbError || !inserted) {
    // Kayıt yazılamadıysa depoda öksüz dosya bırakma.
    const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([storagePath]);
    if (cleanupError) console.error("[uploads] öksüz dosya silinemedi:", cleanupError.message);
    console.error("[uploads] ek kaydı yazılamadı:", dbError?.message ?? "boş yanıt");
    return { error: "Dosya kaydedilemedi." };
  }

  // Özel kova → imzalı bağlantı. Üretilemezse yükleme yine BAŞARILIDIR;
  // dosya ekler listesinden açılır, bu yüzden hata döndürülmez.
  let url = "";
  try {
    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_SECONDS);
    if (signError) console.error("[uploads] imzalı bağlantı üretilemedi:", signError.message);
    url = signed?.signedUrl ?? "";
  } catch (error) {
    console.error("[uploads] imzalı bağlantı üretilemedi:", message(error));
  }

  revalidatePath(`/tasks/${taskId}`);
  return { id: inserted.id, url };
}

export async function deleteTaskAttachment(
  attachmentId: string,
  taskId: string,
): Promise<{ success: true } | { error: string }> {
  if (!featureFlags.uploads) return { error: "Dosya yükleme kapalı." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  // Depo yolu ÇAĞIRANDAN alınmaz, kayıttan okunur: istemcinin gönderdiği bir
  // yol başka bir dosyayı işaret edebilirdi.
  const { data: attachmentRow, error: readError } = await supabase
    .from("task_attachments")
    .select("storage_path")
    .eq("id", attachmentId)
    .maybeSingle();
  const attachment = attachmentRow as { storage_path: string } | null;

  if (readError) {
    console.error("[uploads] ek okunamadı:", readError.message);
    return { error: "Dosya bulunamadı." };
  }
  if (!attachment) return { error: "Dosya bulunamadı." };

  const { error: dbError } = await supabase
    .from("task_attachments")
    .delete()
    .eq("id", attachmentId);

  if (dbError) {
    console.error("[uploads] ek silinemedi:", dbError.message);
    return { error: "Dosya silinemedi." };
  }

  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove([attachment.storage_path]);
  // Kayıt gitti; depo kalıntısı kullanıcının işini engellemez, loglanır.
  if (storageError) console.error("[uploads] depodaki dosya silinemedi:", storageError.message);

  revalidatePath(`/tasks/${taskId}`);
  return { success: true };
}
