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
    <span className={cn("ml-1 inline-flex flex-wrap items-center gap-0.5 align-middle", className)}>
      {list.map((id) => (
        <span
          key={id}
          title={memberNames[id] ?? ""}
          className="rounded bg-ink/[0.07] px-1 text-[10px] font-semibold leading-[15px] text-ink/70"
        >
          {initialsOf(memberNames[id])}
        </span>
      ))}
      {extra.map((name) => (
        <span
          key={name}
          title={`${name} — sistemde kullanıcı değil`}
          className="rounded bg-ink/[0.07] px-1 text-[10px] font-medium leading-[15px] text-ink/55"
        >
          {name}
        </span>
      ))}
    </span>
  );
}
