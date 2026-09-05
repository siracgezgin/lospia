"use client";

import { cn } from "@/lib/utils/cn";
import { unresolvedKim } from "@/lib/planning/initials";
import { PersonAvatar } from "@/components/ui/PersonAvatar";

interface Props {
  /** Sistem üyelerinin id'leri — baş harfe çevrilir (Selen Ergül → SE). */
  ids?: string[] | null;
  /** Ham "Kim" metni — üyeye çözülemeyenler (Meral, Nihal Hoca) burada yaşar. */
  kim?: string | null;
  /** İş birliği yapan kişiler — sorumludan AYIRT EDİLİR (ince, açık rozet).
   *  Aslı Hanım, 2026-08-19: "Sorumlu kişinin iş birliğini koyacaksın." */
  collaboratorIds?: string[] | null;
  memberNames: Record<string, string>;
  /** profiles.id → fotoğraf. Varsa rozet FOTOĞRAF gösterir. */
  memberPhotos?: Record<string, string | null>;
  /** profiles.id → hex. Boşsa marka rengine düşülür (kimse renksiz kalmaz). */
  personHex?: Record<string, string>;
  className?: string;
}

/**
 * Aslı Hanım'ın takvimindeki "Kim" bilgisi — tek yerden.
 *
 * Excel'de Kim ayrı bir sütundur; ekranda o sütun 7 gün × 48px yer yiyordu ve
 * haftanın tamamının sığmasını engelliyordu. Bilgi kaybolmasın diye rozetler
 * metnin akışına alındı: satır kırılınca isim cümlenin ortasına düşmez.
 */
export function KimBadges({ ids, kim, collaboratorIds, memberNames, memberPhotos = {}, personHex = {}, className }: Props) {
  const list = ids ?? [];
  // Sorumlu olarak zaten görünen kişi ikinci kez iş birliği rozetiyle çıkmasın.
  const collabs = (collaboratorIds ?? []).filter((id) => !list.includes(id));
  const resolved = list.map((id) => memberNames[id]).filter(Boolean);
  const extra = unresolvedKim(kim, resolved);
  if (!list.length && !extra.length && !collabs.length) return null;

  return (
    <span className={cn("ml-1 inline-flex flex-wrap items-center gap-1 align-middle", className)}>
      {/* Sistem üyesi — marka rengiyle dolu rozet. Konu metninin içinde
          kaybolmasın diye kontrast bilinçli olarak yüksek tutulur. */}
      {list.map((id) => (
        <PersonAvatar
          key={id}
          name={memberNames[id] ?? "—"}
          photoUrl={memberPhotos[id] ?? null}
          colorHex={personHex[id] ?? null}
          size="xs"
          title={memberNames[id] ?? ""}
        />
      ))}
      {/* İş birliği — sorumludan görsel olarak bir kademe geride: dolu değil,
          kesikli çerçeveli. "Kim" bakışta hâlâ tek bir kişiyi işaret eder. */}
      {collabs.map((id) => (
        /* İş birliği SORUMLUDAN ayrışmalı (Aslı Hanım, 2026-08-19). Aynı
           yuvarlak kart, ama kesikli bir halka içinde ve bir tık soluk:
           "yanında çalışıyor", "sorumlu" değil. */
        <span
          key={`c-${id}`}
          title={`${memberNames[id] ?? ""} — iş birliği`}
          className="inline-grid place-items-center rounded-full border border-dashed border-line-strong p-px opacity-80"
        >
          <PersonAvatar
            name={memberNames[id] ?? "—"}
            photoUrl={memberPhotos[id] ?? null}
            colorHex={personHex[id] ?? null}
            size="xs"
          />
        </span>
      ))}
      {/* Sistemde kullanıcısı olmayan kişi (Meral, Nihal Hoca) — okunur ama
          üyeden ayrışsın diye çerçeveli/açık zemin. */}
      {extra.map((name) => (
        <span
          key={name}
          title={`${name} — sistemde kullanıcı değil`}
          className="inline-flex items-center rounded-md border border-brand-ring/60 bg-brand-soft px-1.5 py-px text-[12px] font-medium leading-4 text-brand-strong"
        >
          {name}
        </span>
      ))}
    </span>
  );
}
