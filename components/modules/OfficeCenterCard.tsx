import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface Props {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

/**
 * Operation Modules hub kartı — "Word nerede, Excel nerede?" sorusunun cevabı.
 *
 * Kartın altında canlı bir kayıt sayacı vardı ("3 föy", "12 kayıt"); Aslı
 * Hanım (2026-08-24) "boş hesap istemiyorum" dedikten sonra kalktı. Kart bir
 * kapı: ne olduğunu söyler, içinde kaç şey olduğunu değil.
 *
 * Hover'da hareket yok — gölge ve kenarlık "tıklanabilir" demeye yeter.
 */
export function OfficeCenterCard({ title, description, href, icon: Icon }: Props) {
  return (
    <Link
      href={href}
      className="group flex gap-3.5 rounded-card border border-line bg-surface p-4 shadow-card transition-[box-shadow,border-color] duration-150 ease-standard hover:border-line-strong hover:shadow-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring focus-visible:ring-offset-2"
    >
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-brand-soft text-brand">
        <Icon size={18} aria-hidden />
      </div>
      <div className="min-w-0">
        <h3 className="text-[14px] font-semibold tracking-tight leading-snug text-ink group-hover:text-brand-strong">
          {title}
        </h3>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{description}</p>
      </div>
    </Link>
  );
}
