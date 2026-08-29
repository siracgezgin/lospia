"use client";

/**
 * Profil fotoğrafı yükleyici.
 *
 * Aslı Hanım (2026-08-24): "İkon kalkıp herkesin resmi gelecek."
 * Ayarlar → Ekip satırının içinde yaşar; yönetici ekibin fotoğraflarını
 * buradan girer, kişi kendi fotoğrafını Profil'den değiştirebilir.
 *
 * Görsel yükleme deseni üretim föyleriyle aynı: tarayıcıda küçültülüp
 * (compressImage) sunucuya gönderilir — 4 MB'lık telefon fotoğrafı depoya
 * olduğu gibi gitmesin.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { uploadAvatar, removeAvatar } from "@/lib/actions/avatars";
import { compressImage } from "@/lib/utils/compress-image";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { cn } from "@/lib/utils/cn";

const MAX_ORIGINAL_BYTES = 5 * 1024 * 1024;

interface Props {
  userId: string;
  name: string;
  photoUrl: string | null;
  colorHex?: string | null;
  disabled?: boolean;
  /** Rozet ile düğmeler ARASINA giren kimlik bloğu (ad + ünvan).
   *  Profil'de satır böyle okunur: rozet · isim · "Fotoğraf yükle"
   *  (2026-08-29: "ikon ismin solunda olsun, fotoğraf yükle sağında olsun,
   *  tek satırda bitir"). Verilmezse rozet ve düğme yan yana durur — Ayarlar
   *  listesindeki hâli budur. */
  nameSlot?: React.ReactNode;
}

export function AvatarUploader({ userId, name, photoUrl, colorHex, disabled, nameSlot }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > MAX_ORIGINAL_BYTES) {
      setError("Fotoğraf 5 MB sınırını aşıyor.");
      return;
    }
    setBusy(true);
    try {
      // Kare ve küçük: rozet en fazla 96px çiziliyor, 512px fazlasıyla yeter.
      const compressed = await compressImage(file, { maxDim: 512, quality: 0.85 });
      const fd = new FormData();
      fd.append("file", compressed);
      const res = await uploadAvatar(userId, fd);
      if ("error" in res) setError(res.error);
      else router.refresh();
    } catch {
      setError("Fotoğraf yüklenemedi. Tekrar deneyin.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const res = await removeAvatar(userId);
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  }

  const working = busy || isPending;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <PersonAvatar name={name} photoUrl={photoUrl} colorHex={colorHex} size="md" />

      {/* Kimlik bloğu rozetle düğmeler arasına girer ve boşluğu YER: düğmeler
          satırın sağına yaslanır. */}
      {nameSlot && <div className="min-w-0 flex-1">{nameSlot}</div>}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || working}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] font-medium text-muted transition-colors duration-150",
          "hover:border-line-strong hover:bg-surface-muted hover:text-ink active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        )}
      >
        {working ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
        {photoUrl ? "Değiştir" : "Fotoğraf yükle"}
      </button>

      {photoUrl && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={disabled || working}
          title="Fotoğrafı kaldır — baş harfleri gösterilir"
          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12.5px] text-subtle transition-colors duration-150 hover:bg-[#fbe6e2] hover:text-danger disabled:pointer-events-none disabled:opacity-50"
        >
          <Trash2 size={13} /> Kaldır
        </button>
      )}

      {error && <p role="alert" className="w-full text-[12px] text-danger">{error}</p>}
    </div>
  );
}
