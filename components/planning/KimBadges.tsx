"use client";

import { cn } from "@/lib/utils/cn";
import { initialsOf, unresolvedKim } from "@/lib/planning/initials";

interface Props {
  /** Sistem üyelerinin id'leri — baş harfe çevrilir (Selen Ergül → SE). */
  ids?: string[] | null;
  /** Ham "Kim" metni — üyeye çözülemeyenler (Meral, Nihal Hoca) burada yaşar. */
  kim?: string | null;
  /** İş birliği yapan kişiler — sorumludan AYIRT EDİLİR (ince, açık rozet).
   *  Aslı Hanım, 2026-08-19: "Sorumlu kişinin iş birliğini koyacaksın." */
  collaboratorIds?: string[] | null;
  memberNames: Record<string, string>;
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
export function KimBadges({ ids, kim, collaboratorIds, memberNames, personHex = {}, className }: Props) {
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
        <span
          key={id}
          title={memberNames[id] ?? ""}
          className={cn(
            "inline-flex items-center rounded-md px-1.5 py-px text-[11.5px] font-semibold uppercase leading-4 tracking-wide text-white",
            !personHex[id] && "bg-brand",
          )}
          style={personHex[id] ? { backgroundColor: personHex[id] } : undefined}
        >
          {initialsOf(memberNames[id])}
        </span>
      ))}
      {/* İş birliği — sorumludan görsel olarak bir kademe geride: dolu değil,
          kesikli çerçeveli. "Kim" bakışta hâlâ tek bir kişiyi işaret eder. */}
      {collabs.map((id) => (
        <span
          key={`c-${id}`}
          title={`${memberNames[id] ?? ""} — iş birliği`}
          className={cn(
            "inline-flex items-center rounded-md border border-dashed bg-surface px-1.5 py-px text-[11.5px] font-semibold uppercase leading-4 tracking-wide",
            !personHex[id] && "border-brand/50 text-brand-strong",
          )}
          style={personHex[id] ? { borderColor: personHex[id], color: personHex[id] } : undefined}
        >
          {initialsOf(memberNames[id])}
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
