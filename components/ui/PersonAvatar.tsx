"use client";

/**
 * Kişi rozeti — FOTOĞRAF, yoksa BAŞ HARF.
 *
 * Aslı Hanım (2026-08-24): "İkon kalkıp herkesin resmi gelecek. Artık kişiler
 * resmiyle görünecek. Resmi olmayan yine aynı şekilde — mesela Siraç Gezgin
 * SG gibi."
 *
 * Önceden kişiler rastgele atanmış SEMBOL ikonlarıyla çiziliyordu (kedi,
 * şemsiye, gitar…). Sembol kimseyi tanıtmıyordu; kişiyi ancak yanındaki yazıyı
 * okuyarak ayırt edebiliyordunuz. Artık:
 *   fotoğraf varsa → fotoğraf
 *   yoksa          → kişinin kendi rengiyle dolu daire + baş harfleri
 *
 * Renk kimlik sisteminden gelir (person-colors); baş harf person-display'in
 * Türkçe kurallarıyla üretilir. Bu bileşen ekranlar arasında TEK kaynaktır —
 * aynı kişi her yerde aynı görünsün.
 */

import Image from "next/image";
import { cn } from "@/lib/utils/cn";
import { getPersonInitials } from "@/lib/utils/person-display";

/** "2xs" yalnız KİMLİK İŞARETİ içindir: kartın köşesinde "bunu kim yaptı"
 *  sorusunu cevaplar, kişiyi tanıtmaz. Sıraç (2026-09-06): "kişi resminin bu
 *  kadar büyük olmasına gerek yok, minimalist olsa yeter." */
export type PersonAvatarSize = "2xs" | "xs" | "sm" | "md" | "lg" | "xl";

const BOX: Record<PersonAvatarSize, string> = {
  "2xs": "h-[18px] w-[18px] text-[8.5px]",
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-[11.5px]",
  md: "h-10 w-10 text-[13px]",
  lg: "h-14 w-14 text-[17px]",
  xl: "h-20 w-20 text-[24px] sm:h-24 sm:w-24 sm:text-[28px]",
};
const PX: Record<PersonAvatarSize, number> = { "2xs": 18, xs: 24, sm: 32, md: 40, lg: 56, xl: 96 };

interface Props {
  name: string;
  /** profiles.avatar_url — varsa fotoğraf çizilir. */
  photoUrl?: string | null;
  /** Kişinin kimlik rengi (hex). Yoksa nötr gri. */
  colorHex?: string | null;
  size?: PersonAvatarSize;
  className?: string;
  title?: string;
  /** Fotoğrafın etrafında beyaz halka (renkli zemin üzerinde ayrışsın). */
  ring?: boolean;
}

export function PersonAvatar({
  name, photoUrl, colorHex, size = "sm", className, title, ring = false,
}: Props) {
  const shared = cn(
    "shrink-0 overflow-hidden rounded-full object-cover",
    BOX[size],
    ring && "ring-2 ring-surface",
    className,
  );

  if (photoUrl) {
    return (
      <Image
        src={photoUrl}
        alt=""
        width={PX[size]}
        height={PX[size]}
        title={title ?? name}
        className={shared}
        // Fotoğraflar Supabase Storage'dan geliyor; Next optimizasyonu için
        // uzak alan tanımı gerekir, o yüzden ham servis edilir.
        unoptimized
      />
    );
  }

  return (
    <span
      title={title ?? name}
      aria-hidden
      className={cn(
        "grid select-none place-items-center font-semibold tracking-tight text-white",
        shared,
        !colorHex && "bg-[#7b8494]",
      )}
      style={colorHex ? { backgroundColor: colorHex } : undefined}
    >
      {getPersonInitials(name)}
    </span>
  );
}
