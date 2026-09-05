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
import { ImagePlus, Trash2 } from "lucide-react";
import { uploadAvatar, removeAvatar } from "@/lib/actions/avatars";
import { compressImage } from "@/lib/utils/compress-image";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { Button } from "@/components/ui/Button";
import { AvatarCropper } from "./AvatarCropper";

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
  /* Seçilen ham dosya önce KIRPMA penceresine gider; yükleme oradan döner.
     Fotoğrafın kare olması "kişi her yerde aynı görünsün" kuralının veri
     düzeyindeki garantisidir (bkz. AvatarCropper). */
  const [pending, setPending] = useState<File | null>(null);

  function pickFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > MAX_ORIGINAL_BYTES) {
      setError("Fotoğraf 5 MB sınırını aşıyor.");
      return;
    }
    setPending(file);
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      // Kırpıcı zaten 512×512 kare üretti; burada yalnız güvenlik ağı.
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
        aria-label="Fotoğraf seç"
        tabIndex={-1}
        onChange={(e) => pickFile(e.target.files?.[0])}
      />

      {/* Yükleme ikincil bir eylem: sayfanın tek primary'si "Kaydet". */}
      <Button
        variant="secondary"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || isPending}
        loading={busy}
      >
        {!busy && <ImagePlus size={14} aria-hidden />}
        {photoUrl ? "Değiştir" : "Fotoğraf yükle"}
      </Button>

      {photoUrl && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRemove}
          disabled={disabled || working}
          title="Fotoğrafı kaldır — baş harfleri gösterilir"
          className="hover:bg-danger/10 hover:text-danger"
        >
          <Trash2 size={14} aria-hidden /> Kaldır
        </Button>
      )}

      {error && <p role="alert" className="w-full text-[12px] text-danger">{error}</p>}

      {pending && (
        <AvatarCropper
          file={pending}
          onCancel={() => { setPending(null); if (inputRef.current) inputRef.current.value = ""; }}
          onDone={(square) => { setPending(null); void handleFile(square); }}
        />
      )}
    </div>
  );
}
