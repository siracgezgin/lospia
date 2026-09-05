"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImageOff, Loader2, Search } from "lucide-react";
import { Overlay } from "@/components/ui/Overlay";
import { TextInput } from "@/components/ui/Field";
import { cn } from "@/lib/utils/cn";
import { listDriveImages, type DriveImage } from "@/lib/actions/sheet-images";

/**
 * GÖRSEL SEÇİCİ — "+ basıp sistemdeki klasörden resim seçelim".
 *
 * Sıraç (2026-09-06). Hücreye görsel YÜKLENMEZ, Drive'da ZATEN duran bir
 * dosya SEÇİLİR. Böylece aynı fotoğraf föyde, tabloda ve lookbook'ta tek
 * kopya olarak durur; değişince her yerde değişir.
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
}

export function ImagePicker({ open, onClose, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [images, setImages] = useState<DriveImage[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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
    return query
      ? "Aramanla eşleşen görsel yok."
      : "Drive'da henüz görsel yok. Önce AF Teamwork'e görsel yükleyin; buradan seçilebilir hale gelir.";
  }, [empty, error, query]);

  return (
    <Overlay open={open} onClose={onClose} title="Görsel seç" size="lg">
      <div className="space-y-4">
        <div className="relative">
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
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                    )}
                  >
                    <span className="flex aspect-square items-center justify-center overflow-hidden bg-surface-sunken">
                      {img.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={img.url}
                          alt={img.name}
                          loading="lazy"
                          className="h-full w-full object-cover"
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
