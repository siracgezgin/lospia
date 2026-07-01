import Link from "next/link";
import { ArrowLeft, Sparkles, ArrowUpRight } from "lucide-react";
import type { ModuleShell } from "@/lib/modules/registry";

/** Quick links to the live screens a "hazırlık" module relates to. */
const RELATED_LINKS: { label: string; href: string }[] = [
  { label: "Pano", href: "/board" },
  { label: "Liste", href: "/list" },
  { label: "Koleksiyon & Üretim", href: "/collection" },
  { label: "CRM / İlişkiler", href: "/crm" },
  { label: "Kreatif Linkler", href: "/creative" },
  { label: "Kurallar", href: "/rules" },
];

/**
 * A safe shell for modules that are only in preparation this phase. It explains
 * what the module will do and links back to the live screens, so a department
 * click never dead-ends. No CRUD, no data writes.
 */
export function ModuleShellView({ shell }: { shell: ModuleShell }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <Link
        href="/modules"
        className="inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} />
        Operasyon Modülleri
      </Link>

      <div className="mt-4 rounded-2xl border border-line bg-surface p-6 shadow-card">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-medium text-brand-strong">
          <Sparkles size={12} />
          Hazırlık aşamasında
        </span>
        <h1 className="mt-3 text-lg font-semibold text-ink">{shell.title}</h1>
        <p className="mt-1 text-[13.5px] text-muted">{shell.summary}</p>

        <ul className="mt-4 space-y-2 border-t border-hairline pt-4">
          {shell.purpose.map((line, i) => (
            <li key={i} className="flex gap-2 text-[13px] text-muted">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-line-strong" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Related live screens */}
      <div className="mt-5">
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-subtle">
          İlgili ekranlar
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {RELATED_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="group flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-2.5 text-[13px] font-medium text-muted shadow-card transition-colors hover:border-line-strong hover:text-ink"
            >
              {l.label}
              <ArrowUpRight size={14} className="text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
