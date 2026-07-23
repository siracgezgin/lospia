"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, X } from "lucide-react";
import {
  uploadProductionSheetImage, deleteProductionSheetImage,
} from "@/lib/actions/production";
import { compressImage } from "@/lib/utils/compress-image";
import { cn } from "@/lib/utils/cn";
import type { ProductionImage, ProductionImageSection } from "@/types";

interface Props {
  sheetId: string; // "new" olabilir
  section: ProductionImageSection;
  images: ProductionImage[];
  onChange: (_next: ProductionImage[]) => void;
  /** Teknik çizim için tek büyük alan; diğerleri küçük galeri. */
  variant?: "drawing" | "gallery";
  label?: string;
}

export function ImageUploader({
  sheetId, section, images, onChange, variant = "gallery", label,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // Bu bölüme ait görseller.
  const mine = images.filter((i) => i.section === section);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setErr(null);
    setBusy(true);
    const added: ProductionImage[] = [];
    try {
      for (const file of Array.from(files)) {
        // Yüklemeden ÖNCE tarayıcıda sıkıştır — depoda az yer kaplasın ve Server
        // Action gövde limitine takılmasın. Hata olursa orijinal dosyayla dener.
        let toUpload: File = file;
        try {
          toUpload = await compressImage(file, { maxDim: 1600, quality: 0.72 });
        } catch { /* sıkıştırma başarısız → orijinal */ }

        const fd = new FormData();
        fd.append("file", toUpload);
        const res = await uploadProductionSheetImage(sheetId, fd);
        if ("error" in res) { setErr(res.error); continue; }
        added.push({ url: res.url, path: res.path, section });
      }
      if (added.length) onChange([...images, ...added]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Görsel yüklenemedi. Lütfen tekrar deneyin.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove(img: ProductionImage) {
    onChange(images.filter((i) => i.path !== img.path));
    // Depodan da sil — best effort.
    await deleteProductionSheetImage(img.path);
  }

  const pick = () => inputRef.current?.click();

  return (
    <div>
      {label && (
        <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-subtle">{label}</span>
      )}

      {variant === "drawing" ? (
        // Teknik çizim: tek büyük alan.
        <div>
          {mine.length > 0 ? (
            <div className="space-y-2">
              {mine.map((img) => (
                <div key={img.path} className="group relative overflow-hidden rounded-lg border border-line bg-surface-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt="Teknik çizim"
                    className="max-h-[360px] w-full cursor-zoom-in object-contain"
                    onClick={() => setLightbox(img.url)}
                  />
                  <button
                    onClick={() => handleRemove(img)}
                    className="absolute right-2 top-2 rounded-md bg-white/90 p-1.5 text-subtle shadow-card opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                    title="Görseli sil"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button onClick={pick} disabled={busy} className="text-[12.5px] font-medium text-brand hover:text-brand-strong">
                {busy ? "Yükleniyor…" : "+ Başka görsel ekle"}
              </button>
            </div>
          ) : (
            <button
              onClick={pick}
              disabled={busy}
              className="flex min-h-[220px] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line bg-surface-muted/40 text-subtle transition-colors hover:border-brand-ring hover:text-muted"
            >
              {busy ? <Loader2 size={26} className="animate-spin" /> : <ImagePlus size={26} />}
              <span className="text-[12.5px] font-medium">Teknik çizim / görsel yükle</span>
              <span className="text-[11px]">PNG, JPG · maks 5 MB</span>
            </button>
          )}
        </div>
      ) : (
        // Galeri: küçük kareler + ekle butonu.
        <div className="flex flex-wrap gap-2">
          {mine.map((img) => (
            <div key={img.path} className="group relative h-20 w-20 overflow-hidden rounded-lg border border-line bg-surface-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt=""
                className="h-full w-full cursor-zoom-in object-cover"
                onClick={() => setLightbox(img.url)}
              />
              <button
                onClick={() => handleRemove(img)}
                className="absolute right-0.5 top-0.5 rounded bg-white/90 p-1 text-subtle opacity-0 shadow-card transition-opacity hover:text-red-600 group-hover:opacity-100"
                title="Görseli sil"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
          <button
            onClick={pick}
            disabled={busy}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line text-subtle transition-colors hover:border-brand-ring hover:text-muted"
            title="Görsel ekle"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
            <span className="text-[10px]">Ekle</span>
          </button>
        </div>
      )}

      {err && <p className="mt-1 text-[11.5px] text-red-600">{err}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={variant === "gallery"}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setLightbox(null)}
        >
          <button className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-ink" onClick={() => setLightbox(null)}>
            <X size={18} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className={cn("max-h-[90vh] max-w-[90vw] rounded-lg object-contain")} />
        </div>
      )}
    </div>
  );
}
