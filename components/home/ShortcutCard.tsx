import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ModuleEntry } from "@/lib/modules/registry";

/**
 * Home Page kısayol karosu — modül dizinindeki TEK kanonik isimle, sayaçsız,
 * kompakt bir giriş kapısı. Görsel dil OfficeCenterCard ile aynı ailedendir;
 * fark: daha sıkı dikey ritim (ana sayfada 10+ karo yan yana yaşar).
 */
export function ShortcutCard({ entry }: { entry: ModuleEntry }) {
  const Icon = entry.icon;
  return (
    <Link
      href={entry.href}
      className="group flex items-start gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-card transition-[box-shadow,transform,border-color] duration-200 ease-standard hover:-translate-y-px hover:border-line-strong hover:shadow-card-hover active:translate-y-0 active:shadow-card"
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand transition-transform duration-200 ease-standard group-hover:scale-105">
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1.5">
          <h3 className="truncate text-sm font-semibold tracking-tight text-ink transition-colors duration-150 group-hover:text-brand-strong">
            {entry.title}
          </h3>
          <ArrowUpRight
            size={13}
            className="shrink-0 text-subtle opacity-0 -translate-x-0.5 translate-y-0.5 transition-[opacity,transform] duration-150 ease-standard group-hover:opacity-100 group-hover:translate-x-0 group-hover:translate-y-0"
          />
        </div>
        <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-muted">
          {entry.description}
        </p>
      </div>
    </Link>
  );
}
