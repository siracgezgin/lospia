// Tarayıcı-içi görsel sıkıştırma — föy fotoğrafları depoda ve DB referansında az
// yer kaplasın diye yüklemeden ÖNCE küçültülür. Uzun kenar `maxDim`e indirilir,
// JPEG/WEBP olarak `quality` ile yeniden kodlanır. 5 MB'lik bir foto tipik olarak
// 150–400 KB'ye iner — bu da Server Action gövde limitine takılmayı da önler.

export interface CompressOptions {
  maxDim?: number;   // en uzun kenar (px)
  quality?: number;  // 0..1
  mimeType?: "image/jpeg" | "image/webp";
}

const DEFAULTS: Required<CompressOptions> = {
  maxDim: 1600,
  quality: 0.72,
  mimeType: "image/jpeg",
};

/** Bir görsel File'ı küçültülmüş/sıkıştırılmış yeni bir File'a çevirir.
 *  GIF veya sıkıştırılamayan bir şey olursa orijinali döndürür (bozmadan). */
export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const { maxDim, quality, mimeType } = { ...DEFAULTS, ...opts };

  // Animasyonlu GIF'i bozmamak için dokunma; SVG zaten küçük.
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;
  if (typeof document === "undefined") return file; // SSR güvenliği

  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await loadBitmap(file);
  } catch {
    return file; // okunamadıysa orijinali kullan
  }

  const srcW = "width" in bitmap ? bitmap.width : (bitmap as HTMLImageElement).naturalWidth;
  const srcH = "height" in bitmap ? bitmap.height : (bitmap as HTMLImageElement).naturalHeight;
  if (!srcW || !srcH) return file;

  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mimeType, quality),
  );
  if (!blob) return file;

  // Sıkıştırma orijinalden büyük çıkarsa (nadiren) orijinali kullan.
  if (blob.size >= file.size) return file;

  const ext = mimeType === "image/webp" ? "webp" : "jpg";
  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${baseName}.${ext}`, { type: mimeType, lastModified: Date.now() });
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      /* bazı formatlarda başarısız olabilir → <img> yoluna düş */
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image load failed")); };
    img.src = url;
  });
}
