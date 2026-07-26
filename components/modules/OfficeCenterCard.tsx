import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface Props {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  /** Live record count; null → the backing table is not migrated yet. */
  count: number | null;
  countLabel: string;
}

/**
 * An Ofis Merkezi tile on the Operasyon Modülleri hub — the answer to "Word
 * nerede, Excel nerede?". Always clickable: when the backing table is not
 * migrated yet the target page shows its own controlled setup notice, so the
 * card only swaps the count chip for a "Kurulum bekleniyor" badge.
 */
export function OfficeCenterCard({ title, description, href, icon: Icon, count, countLabel }: Props) {
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
      <p className="mt-1 flex-1 text-[12.5px] leading-relaxed text-muted">{description}</p>
      <div className="mt-3">
        <span
          className={cn(
            "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium tabular-nums",
            count === null
              ? "bg-surface-sunken text-subtle"
              : "bg-brand-soft text-brand-strong",
          )}
        >
          {count === null ? "Kurulum bekleniyor" : `${count} ${countLabel}`}
        </span>
      </div>
    </Link>
  );
}
