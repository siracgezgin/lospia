"use client";

import { cn } from "@/lib/utils/cn";
import { initialsOf, unresolvedKim } from "@/lib/planning/initials";

interface Props {
  /** Sistem üyelerinin id'leri — baş harfe çevrilir (Selen Ergül → SE). */
  ids?: string[] | null;
  /** Ham "Kim" metni — üyeye çözülemeyenler (Meral, Nihal Hoca) burada yaşar. */
  kim?: string | null;
  memberNames: Record<string, string>;
  className?: string;
}

/**
 * Aslı Hanım'ın takvimindeki "Kim" bilgisi — tek yerden.
 *
 * Excel'de Kim ayrı bir sütundur; ekranda o sütun 7 gün × 48px yer yiyordu ve
 * haftanın tamamının sığmasını engelliyordu. Bilgi kaybolmasın diye rozetler
 * metnin akışına alındı: satır kırılınca isim cümlenin ortasına düşmez.
 */
export function KimBadges({ ids, kim, memberNames, className }: Props) {
  const list = ids ?? [];
  const resolved = list.map((id) => memberNames[id]).filter(Boolean);
  const extra = unresolvedKim(kim, resolved);
  if (!list.length && !extra.length) return null;

  return (
    <span className={cn("ml-1 inline-flex flex-wrap items-center gap-1 align-middle", className)}>
      {/* Sistem üyesi — marka rengiyle dolu rozet. Konu metninin içinde
          kaybolmasın diye kontrast bilinçli olarak yüksek tutulur. */}
      {list.map((id) => (
        <span
          key={id}
          title={memberNames[id] ?? ""}
          className="inline-flex items-center rounded-md bg-brand px-1.5 py-px text-[10.5px] font-bold uppercase leading-[15px] tracking-wide text-white"
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
          className="inline-flex items-center rounded-md border border-brand-ring/60 bg-brand-soft px-1.5 py-px text-[10.5px] font-semibold leading-[15px] text-brand-strong"
        >
          {name}
        </span>
      ))}
    </span>
  );
}
