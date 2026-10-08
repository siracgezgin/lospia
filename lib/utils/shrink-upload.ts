// YÜKLEMEDE FOTOĞRAFLAR KENDİLİĞİNDEN KÜÇÜLÜR — 03.10.2026
//
// AF: "Benim orada çok çözünürlük bir şeye ihtiyacım yok. Bana sadece görüp ne
// olduğunu anlamaya ihtiyacım var." Depo ücretsiz sürümde 1 GB; ekibin
// dosyalarındaki ağırlığın neredeyse tamamı fotoğraf. Ölçüm (03.10):
// AFR-AF.xlsx 250 MB'ın 250 MB'ı, Üretim Föyleri 11 MB'ın 10,6 MB'ı Excel'in
// İÇİNE GÖMÜLÜ fotoğraf — çoğu fotoğraf olduğu halde PNG kaydedilmiş
// (1275 × 1233 piksel, 2,4 MB). Nisa Hanım'ın takıldığı 33,9 MB'lık dosya da
// bir Excel'di.
//
// Bu yüzden iki yol var:
//  · Doğrudan yüklenen fotoğraf: uzun kenar 2000 pikselde, JPEG.
//  · Excel · Word · PowerPoint: içindeki fotoğraflar aynı kuralla küçülür,
//    dosyanın adı, biçimi ve sayfa düzeni değişmez. Görselin hücredeki boyu
//    piksel sayısından değil çizim tanımından (EMU) gelir; küçültme görünümü
//    bozmaz.
//
// SAYDAMLIK KORUNUR. Saydam pikseli olan PNG JPEG'e çevrilmez (dekupe ürün,
// logo); yalnız gerekiyorsa boyu küçülür ve PNG kalır.
//
// HİÇBİR ŞEY KAYBOLMAZ. Çözülemeyen biçim (HEIC, EMF, TIFF), bozuk dosya ya da
// küçültünce büyüyen sonuç olursa ORİJİNAL olduğu gibi yüklenir. Bu adım bir
// iyileştirmedir, kapı değildir: hata verip yüklemeyi durdurmaz.

const FOTO_UZUN_KENAR = 2000;
const GOMULU_UZUN_KENAR = 1600;
const JPEG_KALITE = 0.8;
/** Bundan küçük fotoğrafa dokunulmaz — kazanç, kayıptan az. */
const FOTO_ESIGI = 500 * 1024;
const GOMULU_ESIGI = 200 * 1024;
/** Bundan küçük ofis dosyası açılmaz. */
const OFIS_ESIGI = 1024 * 1024;
/** Sonuç orijinalin en az bu kadar altında değilse orijinal kalır. */
const KAZANC_ORANI = 0.9;

const COZULEBILIR = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/avif", "image/bmp"];
const OFIS_UZANTISI = /\.(xlsx|xlsm|docx|docm|pptx|pptm)$/i;
const GOMULU_FOTO = /^(xl|word|ppt)\/media\/([^/]+)\.(png|jpe?g)$/i;

export type ShrinkProgress = (_done: number, _total: number) => void;

export interface ShrinkResult {
  file: File;
  /** Küçültme yapıldı mı? `false` ise orijinal dosya döndü. */
  shrunk: boolean;
  before: number;
  after: number;
}

const mimeOf = (file: File) => file.type.toLowerCase().split(";")[0]!.trim();

/** Yüklemeden önce: fotoğrafı ya da ofis dosyasının içindeki fotoğrafları küçültür. */
export async function shrinkForUpload(file: File, onProgress?: ShrinkProgress): Promise<ShrinkResult> {
  const keep: ShrinkResult = { file, shrunk: false, before: file.size, after: file.size };
  if (typeof document === "undefined") return keep;
  try {
    if (COZULEBILIR.includes(mimeOf(file)) && file.size > FOTO_ESIGI) return await shrinkPhoto(file, keep);
    if (OFIS_UZANTISI.test(file.name) && file.size > OFIS_ESIGI) return await shrinkOffice(file, keep, onProgress);
  } catch {
    /* İyileştirme başarısızsa yükleme orijinalle sürer. */
  }
  return keep;
}

async function shrinkPhoto(file: File, keep: ShrinkResult): Promise<ShrinkResult> {
  const out = await shrinkImage(file, FOTO_UZUN_KENAR);
  if (!out || out.size >= file.size * KAZANC_ORANI) return keep;
  const ext = out.type === "image/jpeg" ? "jpg" : "png";
  const name = `${file.name.replace(/\.[^.]+$/, "")}.${ext}`;
  const next = new File([out], name, { type: out.type, lastModified: file.lastModified });
  return { file: next, shrunk: true, before: file.size, after: next.size };
}

/**
 * Bir görseli küçültür. Saydam pikseli yoksa JPEG, varsa PNG yazar.
 * Kazanç yoksa ya da tarayıcı çözemiyorsa `null`.
 */
async function shrinkImage(blob: Blob, maxDim: number): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return null;
  }
  try {
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);

    const saydam = blob.type !== "image/jpeg" && hasTransparency(ctx, w, h);
    if (saydam) {
      /* PNG'de kazanç yalnız boydan gelir; boy zaten küçükse dokunma. */
      if (scale === 1) return null;
      return await toBlob(canvas, "image/png");
    }
    /* JPEG'in alfa kanalı yok: tuval beyaza boyanıp yeniden çizilir, yoksa
       kenarlardaki yarı saydam pikseller siyaha düşer. */
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    return await toBlob(canvas, "image/jpeg", JPEG_KALITE);
  } finally {
    bitmap.close();
  }
}

function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const { data } = ctx.getImageData(0, 0, w, h);
  for (let i = 3; i < data.length; i += 4) if (data[i]! < 255) return true;
  return false;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b && b.type === type ? b : null), type, quality),
  );
}

/**
 * Excel · Word · PowerPoint — paket bir ZIP'tir; fotoğraflar `xl/media`,
 * `word/media`, `ppt/media` altında durur ve ilişki dosyalarından (`.rels`)
 * adlarıyla çağrılır. PNG bir fotoğraf JPEG'e döndüğünde adı da değişir; o ad
 * bütün `.rels` dosyalarında ve `[Content_Types].xml`'de güncellenir.
 */
async function shrinkOffice(file: File, keep: ShrinkResult, onProgress?: ShrinkProgress): Promise<ShrinkResult> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);

  const adaylar = Object.values(zip.files).filter((f) => !f.dir && GOMULU_FOTO.test(f.name));
  if (adaylar.length === 0) return keep;

  const yeniAd = new Map<string, string>(); // eski taban ad → yeni taban ad
  let jpegEklendi = false;
  let i = 0;
  for (const giris of adaylar) {
    onProgress?.(i++, adaylar.length);
    const m = GOMULU_FOTO.exec(giris.name)!;
    const [, kok, govde, uzanti] = m as unknown as [string, string, string, string];
    const ham = await giris.async("uint8array");
    if (ham.byteLength <= GOMULU_ESIGI) continue;
    const tur = /png/i.test(uzanti) ? "image/png" : "image/jpeg";
    const out = await shrinkImage(new Blob([ham as BlobPart], { type: tur }), GOMULU_UZUN_KENAR);
    if (!out || out.size >= ham.byteLength * KAZANC_ORANI) continue;

    if (out.type === tur) {
      zip.file(giris.name, out, { createFolders: false });
      continue;
    }
    /* PNG → JPEG: yeni ad, çakışmasın. */
    let aday = `${govde}.jpeg`;
    for (let n = 2; zip.file(`${kok}/media/${aday}`); n++) aday = `${govde}_${n}.jpeg`;
    zip.remove(giris.name);
    zip.file(`${kok}/media/${aday}`, out, { createFolders: false });
    yeniAd.set(`${govde}.${uzanti}`, aday);
    jpegEklendi = true;
  }
  onProgress?.(adaylar.length, adaylar.length);

  if (yeniAd.size > 0) {
    const iliskiler = Object.values(zip.files).filter(
      (f) => !f.dir && (f.name.endsWith(".rels") || f.name === "[Content_Types].xml"),
    );
    for (const f of iliskiler) {
      const xml = await f.async("string");
      let yeni = xml;
      for (const [eski, ad] of yeniAd) yeni = yeni.split(`media/${eski}"`).join(`media/${ad}"`);
      if (f.name === "[Content_Types].xml") {
        /* Ad bazında tür tanımı (Override) varsa o da JPEG olur. */
        for (const ad of yeniAd.values()) {
          yeni = yeni.replace(
            new RegExp(`(PartName="/[a-z]+/media/${ad.replace(/[.]/g, "\\.")}"\\s+ContentType=")image/png"`, "i"),
            '$1image/jpeg"',
          );
        }
        if (jpegEklendi && !/Extension="jpeg"/i.test(yeni)) {
          yeni = yeni.replace("</Types>", '<Default Extension="jpeg" ContentType="image/jpeg"/></Types>');
        }
      }
      if (yeni !== xml) zip.file(f.name, yeni, { createFolders: false });
    }
  }

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    mimeType: file.type || "application/octet-stream",
  });
  if (blob.size >= file.size * KAZANC_ORANI) return keep;
  const next = new File([blob], file.name, { type: file.type, lastModified: file.lastModified });
  return { file: next, shrunk: true, before: file.size, after: next.size };
}
