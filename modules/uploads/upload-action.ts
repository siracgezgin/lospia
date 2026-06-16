"use server";
// Module: Uploads — gated by NEXT_PUBLIC_FEATURE_UPLOADS_ENABLED=true
// Supabase Storage: task-attachments/{workspace_id}/{task_id}/{uuid}
// Max file size: 5 MB. No versioning. No image transforms.

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { featureFlags } from "@/lib/utils/feature-flags";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const BUCKET = "task-attachments";

export async function uploadTaskAttachment(
  taskId: string,
  workspaceId: string,
  formData: FormData
): Promise<{ id: string; url: string } | { error: string }> {
  if (!featureFlags.uploads) {
    return { error: "Uploads feature is disabled" };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No file provided" };
  if (file.size > MAX_BYTES) return { error: "File exceeds 5 MB limit" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const fileId = crypto.randomUUID();
  const storagePath = `${workspaceId}/${taskId}/${fileId}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) return { error: uploadError.message };

  // Record metadata
  const { data, error: dbError } = await supabase
    .from("task_attachments")
    .insert({
      id: fileId,
      task_id: taskId,
      workspace_id: workspaceId,
      uploaded_by: user.id,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      storage_path: storagePath,
    })
    .select("id")
    .single();

  if (dbError) {
    // Clean up orphaned storage object
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { error: dbError.message };
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

  revalidatePath(`/tasks/${taskId}`);
  return { id: (data as { id: string }).id, url: publicUrl };
}

export async function deleteTaskAttachment(
  attachmentId: string,
  storagePath: string,
  taskId: string
): Promise<{ success: true } | { error: string }> {
  if (!featureFlags.uploads) return { error: "Uploads feature is disabled" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error: dbError } = await supabase
    .from("task_attachments")
    .delete()
    .eq("id", attachmentId);

  if (dbError) return { error: dbError.message };

  await supabase.storage.from(BUCKET).remove([storagePath]);

  revalidatePath(`/tasks/${taskId}`);
  return { success: true };
}
