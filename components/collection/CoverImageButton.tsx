"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2 } from "lucide-react";
import {
  uploadProductionSheetImage,
  updateProductionSheetImages,
  deleteProductionSheetImage,
} from "@/lib/actions/production";
import { compressImage } from "@/lib/utils/compress-image";
import { cn } from "@/lib/utils/cn";
import { downloadIconCls } from "@/components/ui/DownloadLink";
import type { ProductionImage } from "@/types";

/**
 * KAPAK GÖRSELİ — ÜRÜN KARTININ ÜZERİNDEN.
 *
 * Sıraç (2026-08-30): "Kapak görseli üretim föyü içinde değil, üretim
 * föylerinin listelendiği kısımda her föyün kapağının üzerinde resim butonu
 * olsun, ordan ekleyeyim."
 *
 * Kapak bir FÖY ALANI değil, bir KATALOG kararıdır: koleksiyona bakarken
 * "bu ürünün yüzü şu olsun" denir. Föyün içine konduğunda kapağı değiştirmek
 * için ürünü açmak, sekme bulmak ve geri dönmek gerekiyordu — oysa karar
 * ızgaraya bakarken veriliyor. Düğme kartın kendi köşesinde durur; yükleme
 * bitince ızgara tazelenir ve yeni kapak yerindedir.
 *
 * Kart bir <a> DEĞİL: gezinme yayılmış `absolute inset-0` Link ile yapılıyor ve
 * bu düğme onun KARDEŞİ olarak z-[2]'de duruyor (proje kuralı: iç içe <a>
 * yasak). Bu yüzden burada `stopPropagation` yeterli — tıklama karta düşmez.
 */
export function CoverImageButton({
  sheetId,
  title,
  images,
  onError,
}: {
  sheetId: string;
  /** Ürün adı — erişilebilir etiket için. */
  title: string;
  /** Föyün mevcut görselleri; kapak bunların arasında `section: "cover"` olan. */
  images: ProductionImage[];
  onError: (_message: string | null) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [, startRefresh] = useTransition();

  const current = images.find((i) => i.section === "cover") ?? null;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    onError(null);
    setBusy(true);
    try {
      /* Tarayıcıda sıkıştır: depoda yer kaplamasın ve Server Action gövde
         sınırına takılmasın (föy yükleyicisiyle AYNI ayarlar). */
      let toUpload: File = file;
      try {
        toUpload = await compressImage(file, { maxDim: 1600, quality: 0.72 });
      } catch {
        /* sıkıştırma başarısız → orijinal dosyayla dene */
      }

      const fd = new FormData();
      fd.append("file", toUpload);
      const up = await uploadProductionSheetImage(sheetId, fd);
      if ("error" in up) {
        onError(up.error);
        return;
      }

      /* Kapak TEKTİR: eskisi listeden çıkar, yenisi girer. Diğer bölümlerin
         (teknik çizim, kumaş…) görsellerine dokunulmaz. */
      const next: ProductionImage[] = [
        ...images.filter((i) => i.section !== "cover"),
        { url: up.url, path: up.path, section: "cover" },
      ];
      const saved = await updateProductionSheetImages(sheetId, next);
      if ("error" in saved) {
        onError("Kapak kaydedilemedi. Tekrar deneyin.");
        return;
      }

      // Eski kapak artık hiçbir yerde geçmiyor — depodan da silinir (best effort).
      if (current?.path) await deleteProductionSheetImage(current.path);

      startRefresh(() => router.refresh());
    } catch {
      onError("Görsel yüklenemedi. Tekrar deneyin.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          inputRef.current?.click();
        }}
        disabled={busy}
        className={cn(downloadIconCls, "disabled:pointer-events-none disabled:opacity-50")}
        title={current ? "Kapak görselini değiştir" : "Kapak görseli ekle"}
        aria-label={`${title} — kapak görseli ${current ? "değiştir" : "ekle"}`}
      >
        {busy ? (
          <Loader2 size={13} className="animate-spin" aria-hidden />
        ) : (
          <ImagePlus size={13} aria-hidden />
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </>
  );
}
