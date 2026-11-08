"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Mail } from "lucide-react";
import { addMonths, format, parseISO } from "date-fns";
import { tr } from "date-fns/locale";
import { cn } from "@/lib/utils/cn";
import { Tile, TileGrid } from "@/components/ui/TileGrid";
import { NEWSLETTER_STATUSES, type NewsletterWeek } from "@/lib/newsletter/model";

/**
 * AYIN PAZARTESİLERİ — bülten planının giriş ekranı.
 *
 * Tek tasarım dili: kutucuk (Pano kişi kartı). Kart başına TEK rozet — durum.
 * Kartın altında tema ya da konu satırı yazar; sayı yok.
 */
export function NewsletterMonth({ month, weeks }: { month: string; weeks: NewsletterWeek[] }) {
  const first = parseISO(`${month}-01`);
  const prev = format(addMonths(first, -1), "yyyy-MM");
  const next = format(addMonths(first, 1), "yyyy-MM");
  const title = format(first, "LLLL yyyy", { locale: tr });

  return (
    <div className="anim-fade">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold capitalize tracking-tight text-ink sm:text-xl">{title}</h2>
        <div className="ml-auto flex items-center gap-1">
          <MonthLink href={`/newsletter?m=${prev}`} label="Önceki ay"><ChevronLeft size={16} aria-hidden /></MonthLink>
          <Link
            href="/newsletter"
            className="inline-flex h-9 items-center rounded-control border border-line px-3 text-[13px] font-medium text-ink transition-all hover:bg-surface-hover"
          >
            Bu ay
          </Link>
          <MonthLink href={`/newsletter?m=${next}`} label="Sonraki ay"><ChevronRight size={16} aria-hidden /></MonthLink>
        </div>
      </div>

      <TileGrid>
        {weeks.map((w) => {
          const st = NEWSLETTER_STATUSES.find((s) => s.key === w.status) ?? NEWSLETTER_STATUSES[0];
          const line = w.theme || w.subject || w.opening_title;
          return (
            <Tile
              key={w.send_date}
              href={`/newsletter?w=${w.send_date}`}
              title={format(parseISO(w.send_date), "d MMMM", { locale: tr })}
              meta={line || " "}
              photoUrl={w.opening_image_url || null}
              icon={Mail}
              badge={
                w.id ? (
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", st.tone)}>{st.label}</span>
                ) : undefined
              }
            />
          );
        })}
      </TileGrid>
    </div>
  );
}

function MonthLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="inline-flex size-9 items-center justify-center rounded-control border border-line text-ink transition-all hover:bg-surface-hover"
    >
      {children}
    </Link>
  );
}
