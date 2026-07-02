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
      className="group flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card transition-shadow hover:shadow-pop"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
          <Icon size={18} />
        </div>
        <ArrowUpRight size={15} className="text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <h3 className="text-[15px] font-semibold leading-snug text-ink transition-colors group-hover:text-brand-strong">
        {title}
      </h3>
      <p className="mt-1 flex-1 text-[12.5px] leading-relaxed text-muted">{description}</p>
      <div className="mt-3">
        <span
          className={cn(
            "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium",
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
