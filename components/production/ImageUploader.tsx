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
import { Button, IconButton } from "@/components/ui/Button";
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
        <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</span>
      )}

      {variant === "drawing" ? (
        // Teknik çizim: tek büyük alan.
        <div>
          {mine.length > 0 ? (
            <div className="space-y-2">
              {mine.map((img) => (
                <div key={img.path} className="group relative overflow-hidden rounded-card border border-line bg-surface-muted transition-[border-color] duration-150 ease-standard hover:border-line-strong">
                  {/* Büyütme bir DÜĞMEDİR (klavye + ekran okuyucu); görsel
                      dekoratif kalır. */}
                  <button
                    type="button"
                    onClick={() => setLightbox(img.url)}
                    className="block w-full cursor-zoom-in"
                    aria-label="Teknik çizimi büyüt"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt="" className="max-h-[360px] w-full object-contain" />
                  </button>
                  {/* Sil: farede hover'da belirir, parmakta hep görünür
                      (hover-only işlev telefonda erişilemezdi). */}
                  <IconButton
                    size="sm"
                    variant="secondary"
                    onClick={() => handleRemove(img)}
                    className="absolute right-2 top-2 text-subtle transition-opacity duration-150 hover:text-danger pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100"
                    title="Görseli sil"
                    aria-label="Teknik çizimi sil"
                  >
                    <Trash2 size={14} aria-hidden />
                  </IconButton>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={pick} loading={busy} className="-ml-2 text-brand hover:bg-brand-soft hover:text-brand-strong">
                {busy ? "Yükleniyor…" : <><ImagePlus size={13} aria-hidden /> Başka görsel ekle</>}
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={pick}
              disabled={busy}
              className={cn(
                "flex min-h-[220px] w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed transition-[border-color,background-color,color] duration-150 ease-standard disabled:pointer-events-none",
                dragOver
                  ? "border-brand bg-brand-soft/70 text-brand-strong"
                  : "border-line bg-surface-muted/40 text-subtle hover:border-brand-ring hover:bg-brand-soft/30 hover:text-muted",
                /* Yüklenirken düz kuyu zemin + spinner; gradient/shimmer yok. */
                busy && "border-solid border-line bg-surface-sunken",
              )}
            >
              {busy ? <Loader2 size={26} className="animate-spin" aria-hidden /> : <ImagePlus size={26} aria-hidden />}
              <span className="text-[13.5px] font-medium">{busy ? "Yükleniyor…" : "Teknik çizim / görsel yükle"}</span>
              <span className="text-[12px]">PNG, JPG · maks 5 MB</span>
            </button>
          )}
        </div>
      ) : (
        // Galeri: küçük kareler + ekle butonu.
        /* Referans görselleri 96px kare: 80px'te kumaş dokusu okunmuyordu.
           Büyütme düğme, silme parmakta hep görünür. */
        <div className="flex flex-wrap gap-2">
          {mine.map((img) => (
            <div key={img.path} className="group relative size-24 overflow-hidden rounded-card border border-line bg-surface-muted transition-[border-color] duration-150 ease-standard hover:border-line-strong">
              <button
                type="button"
                onClick={() => setLightbox(img.url)}
                className="block h-full w-full cursor-zoom-in"
                aria-label="Görseli büyüt"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" className="h-full w-full object-cover" />
              </button>
              <IconButton
                size="sm"
                variant="secondary"
                onClick={() => handleRemove(img)}
                className="absolute right-1 top-1 size-7 text-subtle transition-opacity duration-150 hover:text-danger pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100"
                title="Görseli sil"
                aria-label="Görseli sil"
              >
                <Trash2 size={12} aria-hidden />
              </IconButton>
            </div>
          ))}
          <button
            type="button"
            onClick={pick}
            disabled={busy}
            className={cn(
              "flex size-24 flex-col items-center justify-center gap-1 rounded-card border-2 border-dashed transition-[border-color,background-color,color] duration-150 ease-standard disabled:pointer-events-none",
              dragOver
                ? "border-brand bg-brand-soft/70 text-brand-strong"
                : "border-line text-subtle hover:border-brand-ring hover:bg-brand-soft/40 hover:text-muted",
              busy && "border-solid border-line bg-surface-sunken",
            )}
            title="Görsel ekle"
            aria-label="Görsel ekle"
          >
            {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <ImagePlus size={18} aria-hidden />}
            <span className="text-[12px] font-medium">{busy ? "Yükleniyor" : "Ekle"}</span>
          </button>
        </div>
      )}

      {err && <p role="alert" className="anim-fade-down mt-1.5 text-[12.5px] font-medium text-danger">{err}</p>}

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
        <img src={lightbox ?? ""} alt="" className="mx-auto max-h-[78dvh] w-auto rounded-card object-contain shadow-drawer" />
      </Overlay>
      {dialog}
    </div>
  );
}
