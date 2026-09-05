"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ZoomIn } from "lucide-react";
import { Overlay } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";

/**
 * FOTOĞRAF KIRPMA — kare, sürükle-yakınlaştır.
 *
 * Sıraç (2026-08-30): "Resim eklerken kırpma da yok. Uyumsuzluktan nefret
 * ederim, her yerde aynı mantıkla olmalı."
 *
 * Kök sebep buydu: yükleyici fotoğrafı yalnız KÜÇÜLTÜYORDU, kare yapmıyordu.
 * Dikey bir portre dikey kalıyor, yuvarlak rozet ise `object-cover` ile onu
 * her ölçüde FARKLI yerinden kırpıyordu — 24px'lik takvim rozetinde çene,
 * 96px'lik profil kartında alın. Aynı kişi ekranlar arasında başka görünüyordu.
 *
 * Çözüm kaynakta: yüklenen her fotoğraf KARE olarak kırpılır. Böylece
 * PersonAvatar hangi boyutta çizerse çizsin çerçeve aynı kalır ve "her yerde
 * aynı" kuralı veri düzeyinde garanti edilir — her bileşende ayrıca uğraşmaya
 * gerek kalmaz.
 *
 * Kırpmayı KULLANICI yapar: kare pencerede fotoğrafı sürükler, kaydırıcıyla
 * yakınlaştırır. Varsayılan konum ortadır; hiçbir şey yapmadan "Kaydet"
 * demek merkezden kare kırpmak demektir.
 *
 * Yeni bağımlılık yok — konumlandırma pointer olaylarıyla, çıktı canvas ile.
 */

/** Kırpma penceresinin ekrandaki kenarı (px) — çıktı her hâlükârda OUT_SIZE. */
const BOX = 256;
/** Depoya giden kare görselin kenarı. Rozet en fazla 96px çizilir; 512 fazlasıyla yeter. */
const OUT_SIZE = 512;
const MAX_ZOOM = 3;

export function AvatarCropper({
  file,
  onCancel,
  onDone,
}: {
  /** Kullanıcının seçtiği ham dosya. */
  file: File;
  onCancel: () => void;
  /** Kare, sıkıştırılmış sonuç. */
  onDone: (_square: File) => void;
}) {
  /* Dosya DATA-URL olarak okunur, `URL.createObjectURL` ile değil.
     Nesne adresi kullanıldığında React'in geliştirme modundaki çift effect
     çalıştırması (mount → temizlik → mount) adresi görsel YÜKLENMEDEN iptal
     ediyordu: `img` hiç dolmuyor, "Kaydet" sonsuza dek devre dışı kalıyordu.
     Data-URL'in iptal edilecek bir ömrü yok. Avatar zaten ≤5 MB ve
     kaydedilirken 512px'e iniyor. */
  const [src, setSrc] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  /** Görselin kutu MERKEZİNE göre kayması (px, ekran ölçeğinde). */
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Bütün setState'ler OLAY geri çağrılarında (effect gövdesinde değil).
    let cancelled = false;
    const reader = new FileReader();
    reader.onload = () => {
      if (cancelled) return;
      const dataUrl = String(reader.result);
      const image = new Image();
      image.onload = () => {
        if (cancelled) return;
        setSrc(dataUrl);
        setImg(image);
      };
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
    return () => { cancelled = true; };
  }, [file]);

  /* Görselin KISA kenarı kutuyu tam doldursun — "cover" davranışı. zoom=1
     bu tabanın katıdır, yani hiçbir zaman boşluk kalmaz. */
  const baseScale = img ? BOX / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const drawW = img ? img.naturalWidth * baseScale * zoom : 0;
  const drawH = img ? img.naturalHeight * baseScale * zoom : 0;

  /** Kayma sınırı: kenarlar kutunun içine kaçmasın (boşluk oluşmasın). */
  const clamp = useCallback(
    (o: { x: number; y: number }) => {
      const mx = Math.max(0, (drawW - BOX) / 2);
      const my = Math.max(0, (drawH - BOX) / 2);
      return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) };
    },
    [drawW, drawH],
  );

  /* Sınır RENDER sırasında uygulanır: ham kayma state'te durur, ekrana ve
     canvas'a giden değer her zaman sınırlanmış olanıdır. Böylece yakınlaştırma
     değişince "state'i düzelten" bir effect'e gerek kalmaz. */
  const shown = clamp(offset);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: shown.x, oy: shown.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    setOffset({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) });
  }
  function onPointerUp() { drag.current = null; }

  async function save() {
    if (!img) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUT_SIZE;
      canvas.height = OUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas yok");

      /* Ekrandaki yerleşimi birebir çıktıya taşı: kutu BOX px, çıktı OUT_SIZE
         px — tek bir orana göre ölçeklenir. */
      const k = OUT_SIZE / BOX;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        img,
        (BOX / 2 - drawW / 2 + shown.x) * k,
        (BOX / 2 - drawH / 2 + shown.y) * k,
        drawW * k,
        drawH * k,
      );

      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, "image/jpeg", 0.85),
      );
      if (!blob) throw new Error("kırpılamadı");
      const base = file.name.replace(/\.[^.]+$/, "");
      onDone(new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() }));
    } catch {
      // Kırpma başarısızsa akışı kilitleme: ham dosya yüklenir.
      onDone(file);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay
      open
      onClose={onCancel}
      size="sm"
      title="Fotoğrafı yerleştirin"
      hint="Sürükleyerek konumlandırın, kaydırıcıyla yakınlaştırın."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Vazgeç</Button>
          <Button size="sm" onClick={save} loading={busy} disabled={!img}>Kaydet</Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4">
        {/* Kare pencere — yuvarlak maske ROZETİN ta kendisidir, kullanıcı
            sonucu olduğu gibi görür (sürpriz kırpma olmaz). */}
        <div
          className="relative touch-none overflow-hidden rounded-full border border-line bg-surface-sunken"
          style={{ width: BOX, height: BOX }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {img && src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute select-none"
              style={{
                width: drawW,
                height: drawH,
                left: BOX / 2 - drawW / 2 + shown.x,
                top: BOX / 2 - drawH / 2 + shown.y,
                maxWidth: "none",
              }}
            />
          )}
          {!img && <div className="grid h-full w-full place-items-center text-[13px] text-subtle">Yükleniyor…</div>}
        </div>

        <label className="flex w-full items-center gap-3">
          <ZoomIn size={16} className="shrink-0 text-subtle" aria-hidden />
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-2 w-full cursor-pointer accent-[var(--brand)]"
            aria-label="Yakınlaştırma"
          />
        </label>
      </div>
    </Overlay>
  );
}
