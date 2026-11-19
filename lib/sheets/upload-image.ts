/**
 * TABLOYA BİLGİSAYARDAN GÖRSEL — tarayıcı tarafı.
 *
 * Sıra: küçült (uzun kenar 2000) → küçük resim üret (640) → içeriğin özetini
 * al → yolu sunucudan iste (aynı fotoğraf daha önce yüklendiyse o kayıt döner)
 * → doğrudan depoya yaz → kaydı açtır. Baytlar Server Action'dan geçmez.
 * Dönen kimlik hücreye yazılır (lib/sheets/model CellImage).
 */

import { createClient } from "@/lib/supabase/client";
import { beginSheetImageUpload, finishSheetImageUpload } from "@/lib/actions/sheet-images";
import { compressImageResult, prepareImageUpload, SHEET_IMAGE_TYPES } from "@/lib/utils/compress-image";

const BUCKET = "documents";
const EXT: Record<string, string> = { "image/jpeg": "jpeg", "image/jpg": "jpeg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

export const isImageFile = (f: File) => /^image\//.test(f.type) || /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(f.name);

async function sha256(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const alreadyThere = (message: string | undefined) => /exists|duplicate|409/i.test(message ?? "");

export async function uploadSheetImage(file: File): Promise<{ id: string; name: string } | { error: string }> {
  const prep = await prepareImageUpload(file, { accept: SHEET_IMAGE_TYPES, maxDim: 2000, quality: 0.82 });
  if ("error" in prep) return prep;
  const main = prep.file;
  const ext = EXT[main.type.toLowerCase()];
  if (!ext) return { error: `"${file.name}" biçimi yüklenemiyor. PNG, JPG veya WEBP olarak kaydedip tekrar deneyin.` };

  try {
    const sha = await sha256(main);
    const begin = await beginSheetImageUpload({ sha, ext });
    if ("error" in begin) return begin;
    if ("existing" in begin) return begin.existing;

    const supabase = createClient();
    const up = await supabase.storage.from(BUCKET).upload(begin.path, main, { contentType: begin.contentType, upsert: false });
    if (up.error && !alreadyThere(up.error.message)) return { error: `"${file.name}" yüklenemedi: ${up.error.message}` };

    /* Küçük resim: tablo açılırken asıl dosya yerine bu iner. Üretilemezse
       (GIF, zaten küçük) asıl dosya gösterilir — görsel yine çıkar. */
    let hasThumb = false;
    const thumb = await compressImageResult(main, { maxDim: 640, quality: 0.74 }).catch(() => null);
    if (thumb?.converted) {
      const t = await supabase.storage.from(BUCKET).upload(begin.thumbPath, thumb.file, { contentType: "image/jpeg", upsert: false });
      hasThumb = !t.error || alreadyThere(t.error.message);
    }

    /* Görünen ad kullanıcının dosya adıdır (uzantısı gerçek biçime çevrilir). */
    const name = `${file.name.replace(/\.[^.]+$/, "") || "gorsel"}.${ext === "jpeg" ? "jpg" : ext}`;
    return await finishSheetImageUpload({ sha, ext, name, size: main.size, hasThumb });
  } catch (e) {
    return { error: e instanceof Error && e.message ? `"${file.name}" yüklenemedi: ${e.message}` : `"${file.name}" yüklenemedi.` };
  }
}
