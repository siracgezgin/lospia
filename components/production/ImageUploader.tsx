"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import {
  uploadProductionSheetImage, deleteProductionSheetImage,
} from "@/lib/actions/production";
import { compressImage } from "@/lib/utils/compress-image";
import { cn } from "@/lib/utils/cn";
import { useConfirm } from "@/components/ui/useConfirm";
import { Overlay } from "@/components/ui/Overlay";
import type { ProductionImage, ProductionImageSection } from "@/types";

// Orijinal (sıkıştırma öncesi) dosya için üst sınır. UI'de "maks 5 MB" yazıyor.
const MAX_ORIGINAL_BYTES = 5 * 1024 * 1024;

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
  const { ask, dialog } = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  // Sürükle-bırak görsel durumu — kesikli çerçeve brand'e döner.
  const [dragOver, setDragOver] = useState(false);

  // Bu bölüme ait görseller.
  const mine = images.filter((i) => i.section === section);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setErr(null);
    setBusy(true);
    const added: ProductionImage[] = [];
    try {
      for (const file of Array.from(files)) {
        // Orijinal dosya boyutu sınırı — sıkıştırma öncesi kontrol (10MB gibi
        // büyük dosyalar reddedilsin).
        if (file.size > MAX_ORIGINAL_BYTES) {
          setErr(`"${file.name}" 5 MB sınırını aşıyor (${(file.size / 1024 / 1024).toFixed(1)} MB). Daha küçük bir görsel seçin.`);
          continue;
        }
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
    // Yanlışlıkla silmeyi önlemek için onay.
    if (!(await ask({
      title: "Görsel kaldırılsın mı?",
      message: "Görsel föyden ve depodan kalıcı olarak silinir.",
      confirmLabel: "Kaldır",
    }))) return;
    // Önce yerel state + üst bileşene bildir (üst bileşen DB'yi anında günceller).
    onChange(images.filter((i) => i.path !== img.path));
    // Depodan da sil — best effort.
    await deleteProductionSheetImage(img.path);
  }

  const pick = () => inputRef.current?.click();

  // Sürükle-bırak: mevcut yükleme akışını (handleFiles) aynen kullanır.
  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    if (!busy && !dragOver) setDragOver(true);
  }
  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  }
  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (!busy) handleFiles(e.dataTransfer.files);
  }

  return (
    <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {label && (
        <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-subtle">{label}</span>
      )}

      {variant === "drawing" ? (
        // Teknik çizim: tek büyük alan.
        <div>
          {mine.length > 0 ? (
            <div className="space-y-2">
              {mine.map((img) => (
                <div key={img.path} className="group relative overflow-hidden rounded-lg border border-line bg-surface-muted shadow-card transition-all duration-200 ease-standard hover:border-line-strong hover:shadow-card-hover">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt="Teknik çizim"
                    className="max-h-[360px] w-full cursor-zoom-in object-contain"
                    onClick={() => setLightbox(img.url)}
                  />
                  <button
                    onClick={() => handleRemove(img)}
                    className="absolute right-2 top-2 rounded-md bg-white/90 p-1.5 text-subtle shadow-card opacity-0 transition-[opacity,color] duration-150 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                    title="Görseli sil"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button onClick={pick} disabled={busy} className="rounded-md text-[12.5px] font-medium text-brand transition-colors duration-150 hover:text-brand-strong disabled:pointer-events-none disabled:opacity-60">
                {busy ? "Yükleniyor…" : "+ Başka görsel ekle"}
              </button>
            </div>
          ) : (
            <button
              onClick={pick}
              disabled={busy}
              className={cn(
                "flex min-h-[220px] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-all duration-200 ease-standard disabled:pointer-events-none",
                dragOver
                  ? "border-brand bg-brand-soft/70 text-brand-strong"
                  : "border-line bg-surface-muted/40 text-subtle hover:border-brand-ring hover:bg-brand-soft/30 hover:text-muted",
                busy && "anim-shimmer border-solid border-line bg-gradient-to-r from-surface-sunken via-surface-muted to-surface-sunken",
              )}
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
            <div key={img.path} className="group relative h-20 w-20 overflow-hidden rounded-lg border border-line bg-surface-muted shadow-card transition-all duration-200 ease-standard hover:border-line-strong hover:shadow-card-hover">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt=""
                className="h-full w-full cursor-zoom-in object-cover transition-transform duration-200 ease-standard group-hover:scale-[1.04]"
                onClick={() => setLightbox(img.url)}
              />
              <button
                onClick={() => handleRemove(img)}
                className="absolute right-0.5 top-0.5 rounded bg-white/90 p-1 text-subtle opacity-0 shadow-card transition-[opacity,color] duration-150 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                title="Görseli sil"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
          <button
            onClick={pick}
            disabled={busy}
            className={cn(
              "flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed transition-all duration-200 ease-standard disabled:pointer-events-none",
              dragOver
                ? "border-brand bg-brand-soft/70 text-brand-strong"
                : "border-line text-subtle hover:border-brand-ring hover:bg-brand-soft/40 hover:text-muted",
              busy && "anim-shimmer border-solid border-line bg-gradient-to-r from-surface-sunken via-surface-muted to-surface-sunken",
            )}
            title="Görsel ekle"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
            <span className="text-[10px]">Ekle</span>
          </button>
        </div>
      )}

      {err && <p className="anim-fade-down mt-1 text-[11.5px] font-medium text-danger">{err}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={variant === "gallery"}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Görsel büyütme — Overlay üzerinden PORTAL ile <body>'ye çizilir.
          Eskiden burada elle bir `fixed inset-0` vardı; föy editörünün
          animasyonlu (transform'lu) kartının içinde kaldığı için katman
          viewport'a değil o karta göre konumlanıyor, görsel sayfanın içine
          taşıyordu. */}
      <Overlay open={!!lightbox} onClose={() => setLightbox(null)} size="lg" floatingClose className="border-0 bg-transparent shadow-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={lightbox ?? ""} alt="" className="mx-auto max-h-[78dvh] w-auto rounded-lg object-contain shadow-drawer" />
      </Overlay>
      {dialog}
    </div>
  );
}
