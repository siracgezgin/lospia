import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
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
 * kapı: ne olduğunu söyler, içinde kaç şey olduğunu değil. Tablosu henüz
 * migrate edilmemiş modülde hedef sayfa kendi kurulum uyarısını gösterir.
 */
export function OfficeCenterCard({ title, description, href, icon: Icon }: Props) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card transition-[box-shadow,transform,border-color] duration-200 ease-standard hover:-translate-y-px hover:border-line-strong hover:shadow-card-hover active:translate-y-0 active:shadow-card"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand transition-transform duration-200 ease-standard group-hover:scale-105">
          <Icon size={18} />
        </div>
        <ArrowUpRight size={15} className="text-subtle opacity-0 -translate-x-0.5 translate-y-0.5 transition-[opacity,transform] duration-150 ease-standard group-hover:opacity-100 group-hover:translate-x-0 group-hover:translate-y-0" />
      </div>
      <h3 className="text-[15px] font-semibold tracking-tight leading-snug text-ink transition-colors duration-150 group-hover:text-brand-strong">
        {title}
      </h3>
      <p className="mt-1 flex-1 text-[13px] leading-relaxed text-muted">{description}</p>
    </Link>
  );
}
