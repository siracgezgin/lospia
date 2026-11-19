"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImageOff, Loader2, Search, Upload } from "lucide-react";
import { Overlay } from "@/components/ui/Overlay";
import { TextInput } from "@/components/ui/Field";
import { cn } from "@/lib/utils/cn";
import { listDriveImages, type DriveImage } from "@/lib/actions/sheet-images";
import { isImageFile, uploadSheetImage } from "@/lib/sheets/upload-image";
import { SHEET_IMAGE_ACCEPT } from "@/lib/utils/compress-image";

/**
 * GÖRSEL SEÇİCİ — "+ basıp sistemdeki klasörden resim seçelim".
 *
 * Sıraç (2026-09-06). Hücreye görsel YÜKLENMEZ, Drive'da ZATEN duran bir
 * dosya SEÇİLİR. Böylece aynı fotoğraf föyde, tabloda ve lookbook'ta tek
 * kopya olarak durur; değişince her yerde değişir.
 *
 * BİLGİSAYARDAN DA YÜKLENİR (18.11.2026, ekip: "fotoğraf rahatlıkla
 * ekleyemiyoruz"). Önce AF Teamwork'e yükleyip sonra burada aramak gerekiyordu;
 * artık "Bilgisayardan yükle" (ya da dosyayı pencereye bırakmak) fotoğrafı
 * yükler VE hücreye koyar. Birden çok dosya seçilirse aynı sütunda aşağı doğru
 * dizilir. Yüklenen dosya yine Drive kaydıdır ("Tablo görselleri" klasörü).
 *
 * Yeni bir gezinme düzeni İCAT EDİLMEDİ (CLAUDE.md tek tasarım dili): görseller
 * kutucuk ızgarasında, her kutucuğun altında adı ve hangi klasörde olduğu
 * yazar. Süzgeç tek satır arama — "başlık · tür · departman" kuralının burada
 * karşılığı ad ve klasör yolu.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (_image: { id: string; name: string }) => void;
  /** Birden çok dosya yüklendiğinde — verilmezse yalnız ilki konur. */
  onPickMany?: (_images: { id: string; name: string }[]) => void;
}

export function ImagePicker({ open, onClose, onPick, onPickMany }: Props) {
  const [query, setQuery] = useState("");
  const [images, setImages] = useState<DriveImage[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<{ done: number; total: number } | null>(null);
  const [over, setOver] = useState(false);

  async function uploadFiles(list: File[]) {
    const files = list.filter(isImageFile);
    if (!files.length || upload) return;
    setError(null);
    setUpload({ done: 0, total: files.length });
    const ok: { id: string; name: string }[] = [];
    let firstError: string | null = null;
    for (const [i, file] of files.entries()) {
      const res = await uploadSheetImage(file);
      if ("error" in res) firstError ??= res.error;
      else ok.push(res);
      setUpload({ done: i + 1, total: files.length });
    }
    setUpload(null);
    if (fileRef.current) fileRef.current.value = "";
    if (ok.length > 1 && onPickMany) onPickMany(ok);
    else if (ok.length) onPick(ok[0]);
    /* Hata varsa pencere açık kalır ki neden okunabilsin. */
    if (firstError) setError(firstError);
    else if (ok.length) onClose();
  }

  /* Arama SUNUCUDA yapılır (klasör yolunda da arıyor) ama her tuşta istek
     atılmaz: yazma durunca 250 ms sonra tek istek gider. */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      const res = await listDriveImages(query);
      if (cancelled) return;
      if ("error" in res) {
        setError(res.error);
        setImages([]);
      } else {
        setImages(res.images);
        setTruncated(res.truncated);
      }
      setLoading(false);
    }, query ? 250 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  /* Kapanınca arama kutusu temizlenir. React'in "prop değişince durumu ayarla"
     deseniyle RENDER sırasında yapılır; efekt içinde setState fazladan bir tur
     doğurur (ve lint kuralı reddeder). */
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) setQuery("");
  }

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const empty = !loading && images.length === 0;
  const hint = useMemo(() => {
    if (error) return null;
    if (!empty) return null;
    return query ? "Eşleşen görsel yok" : "Henüz görsel yok";
  }, [empty, error, query]);

  return (
    <Overlay open={open} onClose={onClose} title="Görsel ekle" size="lg">
      <div
        className={cn("space-y-4 rounded-card", over && "outline-dashed outline-2 outline-offset-4 outline-brand")}
        onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
        onDrop={(e) => { e.preventDefault(); setOver(false); void uploadFiles([...e.dataTransfer.files]); }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <Search
              size={15}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle"
            />
            <TextInput
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Görsel adı ya da klasör ara…"
              aria-label="Görsel ara"
              className="pl-9"
            />
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={!!upload}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-control bg-ink px-4 text-[13.5px] font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60 pointer-coarse:h-11"
          >
            {upload ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Upload size={15} aria-hidden />}
            {upload ? `Yükleniyor ${upload.done}/${upload.total}` : "Bilgisayardan yükle"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={SHEET_IMAGE_ACCEPT}
            multiple
            aria-label="Görsel dosyaları"
            className="hidden"
            onChange={(e) => void uploadFiles([...(e.target.files ?? [])])}
          />
        </div>

        {error && (
          <p role="alert" className="rounded-control border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-ink">
            {error}
          </p>
        )}

        {loading && (
          <p className="flex items-center gap-2 py-8 text-[13px] text-muted">
            <Loader2 size={15} className="animate-spin" aria-hidden />
            Görseller yükleniyor…
          </p>
        )}

        {hint && (
          <p className="flex flex-col items-center gap-2 py-10 text-center text-[13px] leading-relaxed text-muted">
            <ImageOff size={22} className="text-subtle" aria-hidden />
            {hint}
          </p>
        )}

        {!loading && images.length > 0 && (
          <>
            <ul className="grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
              {images.map((img) => (
                <li key={img.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      onPick({ id: img.id, name: img.name });
                      onClose();
                    }}
                    title={`${img.name} · ${img.folderPath}`}
                    className={cn(
                      "group w-full overflow-hidden rounded-card border border-line bg-surface text-left",
                      "transition-colors duration-150 hover:border-line-strong hover:bg-surface-hover",
                      /* Odak halkası uygulamanın TEK belirtecinden: `ring-brand` marka dolgusu,
                         odak rengi `ring-brand-ring`. İkisi farklı ton — kutucuk odakta
                         diğer ekranlardan başka bir renkle çerçeveleniyordu. */
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring",
                    )}
                  >
                    <span className="flex aspect-square items-center justify-center overflow-hidden bg-surface-sunken">
                      {img.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={img.url}
                          alt={img.name}
                          loading="lazy"
                          /* contain, cover DEĞİL: seçerken görselin TAMAMI
                             görünmeli — kırpılmış bir önizlemede iki benzer
                             fotoğraf ayırt edilemiyor. */
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <ImageOff size={18} className="text-subtle" aria-hidden />
                      )}
                    </span>
                    <span className="block min-w-0 px-2.5 py-2">
                      <span className="block truncate text-[12.5px] font-medium text-ink">{img.name}</span>
                      <span className="block truncate text-[11.5px] text-subtle">{img.folderPath}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {truncated && (
              /* Sessiz kırpma yok: kaç tanesinin gösterildiği söylenmezse
                 kullanıcı "resmim yok" sanır. */
              <p className="text-[12.5px] text-subtle">
                İlk {images.length} görsel gösteriliyor. Aramayı daraltarak diğerlerine ulaşabilirsiniz.
              </p>
            )}
          </>
        )}
      </div>
    </Overlay>
  );
}
