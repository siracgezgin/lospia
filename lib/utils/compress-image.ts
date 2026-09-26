// Tarayıcı-içi görsel sıkıştırma — föy fotoğrafları depoda ve DB referansında az
// yer kaplasın diye yüklemeden ÖNCE küçültülür. Uzun kenar `maxDim`e indirilir,
// JPEG/WEBP olarak `quality` ile yeniden kodlanır. 5 MB'lik bir foto tipik olarak
// 150–400 KB'ye iner.
//
// SIKIŞTIRMA GARANTİ DEĞİLDİR: animasyonlu GIF ile SVG'ye bilerek dokunulmaz,
// HEIC'i masaüstü tarayıcıları (Chrome · Edge · Firefox) çözemez, kimi biçim
// JPEG'e çevrilince büyür. Bu yollarda ORİJİNAL dosya geri döner ve eskiden bu
// SESSİZDİ: çeviremediğimiz dosya olduğu gibi Server Action gövdesine giriyor,
// Vercel'in 4,5 MB'lık SERT gövde sınırında kesiliyor, kullanıcıya İngilizce
// "An unexpected response was received from the server" düşüyordu.
// `prepareImageUpload` o üç durumu yüklemeden ÖNCE yakalar ve ne yapılacağını
// söyleyen Türkçe bir mesaj döndürür.

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

/** Yüklenecek dosya için tavan. Vercel'in istek gövdesi sınırı 4,5 MB'tır ve
 *  next.config.ts'teki `bodySizeLimit: "8mb"` onu EZEMEYİP yalnız altına iner;
 *  sunucudaki 5 MB'lık kontroller de bu yüzden canlıda hiç ateşlenemiyor.
 *  Tavan platform sabitinin ALTINDA durur ki hata taşımada değil burada,
 *  anlaşılır Türkçeyle çıksın. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Ham (sıkıştırma öncesi) dosya tavanı. Sıkıştırma tipik bir telefon
 *  fotoğrafını otuzda birine indirdiği için seçileni erkenden reddetmenin
 *  anlamı yok — burada yalnız tarayıcıda açmanın kendisi sorun olacak kadar
 *  büyük dosyalar elenir. */
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

/** Föy · kartela görselleri — sunucu beyaz listesinin aynısı
 *  (lib/actions/production.ts, lib/actions/manufacturers.ts). */
export const SHEET_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"] as const;

/** Yazı (Word) içine gömülen görseller (lib/actions/documents.ts). */
export const DOC_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"] as const;

/** `<input accept>` metni. Seçici KABUL EDİLMEYECEK dosyayı hiç seçtirmesin:
 *  `image/*` kullanıcıyı önce HEIC'e davet edip sonra reddediyordu. */
export const acceptAttr = (types: readonly string[]): string =>
  types.filter((t) => t !== "image/jpg").join(",");

export const SHEET_IMAGE_ACCEPT = acceptAttr(SHEET_IMAGE_TYPES);
export const DOC_IMAGE_ACCEPT = acceptAttr(DOC_IMAGE_TYPES);

export interface CompressResult {
  file: File;
  /** Dosya gerçekten yeniden kodlandı mı? `false` ise ORİJİNAL geri döndü —
   *  biçime dokunulmadı (GIF/SVG) ya da tarayıcı çözemedi (HEIC). */
  converted: boolean;
}

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
const mimeOf = (file: File) => file.type.toLowerCase().split(";")[0]!.trim();
const isHeic = (file: File) =>
  /hei[cf]/.test(mimeOf(file)) || (!mimeOf(file) && /\.hei[cf]$/i.test(file.name));

/** Bir görsel File'ı küçültülmüş/sıkıştırılmış yeni bir File'a çevirir.
 *  GIF veya sıkıştırılamayan bir şey olursa orijinali döndürür (bozmadan). */
export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  return (await compressImageResult(file, opts)).file;
}

/** `compressImage` ile aynı iş, ama ÇEVİREBİLDİĞİNİ de söyler. Çağıran taraf
 *  "orijinal geri geldi" halini ayırt edemediği sürece kullanıcıya doğru
 *  cümleyi kuramıyordu. */
export async function compressImageResult(file: File, opts: CompressOptions = {}): Promise<CompressResult> {
  const { maxDim, quality, mimeType } = { ...DEFAULTS, ...opts };
  const keep = (): CompressResult => ({ file, converted: false });

  // Animasyonlu GIF'i bozmamak için dokunma; SVG zaten küçük.
  if (file.type === "image/gif" || file.type === "image/svg+xml") return keep();
  if (typeof document === "undefined") return keep(); // SSR güvenliği

  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await loadBitmap(file);
  } catch {
    return keep(); // okunamadıysa orijinali kullan
  }

  const srcW = "width" in bitmap ? bitmap.width : (bitmap as HTMLImageElement).naturalWidth;
  const srcH = "height" in bitmap ? bitmap.height : (bitmap as HTMLImageElement).naturalHeight;
  if (!srcW || !srcH) return keep();

  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return keep();
  /* SAYDAM ZEMİN BEYAZA BOYANIR. Tuval saydam başlar; JPEG'in alfa kanalı
     olmadığı için saydam pikseller kodlanırken SİYAHA düşüyordu. Logolu PNG,
     kesilmiş dekupe ve şeffaf zeminli kartela "siyah blok" olarak kaydediliyordu
     — üstelik orijinal artık elde olmadığı için geri dönüşü yoktu.
     WEBP alfayı taşıdığı için yalnız JPEG'e yazarken boyanır. */
  if (mimeType === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mimeType, quality),
  );
  if (!blob) return keep();
  /* İSTEDİĞİMİZ BİÇİM ÇIKMADIYSA ORİJİNALDE KAL. `toBlob` desteklemediği bir
     tür verildiğinde sessizce PNG üretir (ör. WEBP yazamayan eski Safari).
     Blob'u yine de istenen etikete sarsaydık depoya "image/webp" başlığıyla
     PNG baytları yazılır, tarayıcı da onu çizemezdi. */
  if (blob.type !== mimeType) return keep();

  // Sıkıştırma orijinalden büyük çıkarsa (nadiren) orijinali kullan.
  if (blob.size >= file.size) return keep();

  const ext = mimeType === "image/webp" ? "webp" : "jpg";
  const baseName = file.name.replace(/\.[^.]+$/, "");
  return {
    file: new File([blob], `${baseName}.${ext}`, { type: mimeType, lastModified: Date.now() }),
    converted: true,
  };
}

export interface PrepareOptions extends CompressOptions {
  /** Sunucunun kabul ettiği MIME listesi — çıktı buna uymazsa yükleme hiç denenmez. */
  accept?: readonly string[];
  /** Ham dosya tavanı; varsayılan MAX_SOURCE_BYTES. */
  maxSourceBytes?: number;
}

/**
 * YÜKLEME KAPISI — her görsel yükleyicisi dosyayı buradan geçirir.
 *
 * Sıra önemlidir: önce sıkıştır, SONRA ölç. Tersi (eski ImageUploader) 6 MB'lık
 * bir telefon fotoğrafını, sıkışınca 300 KB olacakken, "5 MB sınırını aşıyor"
 * diye geri çeviriyordu. Tek sınır burada durur; iki ayrı yerde yazılan iki
 * sayı arasında ölü aralık kalmasın.
 */
export async function prepareImageUpload(
  file: File,
  opts: PrepareOptions = {},
): Promise<{ file: File } | { error: string }> {
  const { accept, maxSourceBytes = MAX_SOURCE_BYTES, ...compressOpts } = opts;

  if (file.size > maxSourceBytes) {
    return { error: `"${file.name}" çok büyük (${mb(file.size)} MB). ${Math.round(maxSourceBytes / 1024 / 1024)} MB altında bir görsel seçin.` };
  }

  let out: CompressResult;
  try {
    out = await compressImageResult(file, compressOpts);
  } catch {
    out = { file, converted: false };
  }

  if (accept && !accept.includes(mimeOf(out.file))) {
    /* HEIC'te yol gösterilir: Chrome · Edge · Firefox o biçimi çözemediği için
       dosya olduğu gibi kalıyor ve sunucu reddediyor. Windows'ta .heic'in
       kayıtlı MIME'i olmadığından `file.type` boş gelir — o da aynı kapı. */
    return isHeic(file)
      ? { error: `"${file.name}" tarayıcıda açılamadı. iPhone fotoğrafıysa (HEIC) telefonda Ayarlar › Kamera › Biçimler › "En Uyumlu" ile çekin ya da JPG olarak kaydedip tekrar deneyin.` }
      : { error: `"${file.name}" biçimi yüklenemiyor. PNG, JPG veya WEBP olarak kaydedip tekrar deneyin.` };
  }

  if (out.file.size > MAX_UPLOAD_BYTES) {
    const limit = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);
    return out.converted
      ? { error: `"${file.name}" küçültüldükten sonra bile ${limit} MB'ın üstünde (${mb(out.file.size)} MB). Daha küçük bir görsel seçin.` }
      : { error: `"${file.name}" bu biçimde küçültülemiyor ve ${limit} MB'ın üstünde (${mb(out.file.size)} MB). Daha küçük bir dosya seçin.` };
  }

  return { file: out.file };
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
