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
 * Hover TEK KANALDIR: yalnız gölge yükselir. Kenarlık da hover'da
 * koyulaşıyordu; iki kanal aynı anda değişince kart "seçilmiş" gibi
 * okunuyordu — oysa seçim başka bir durumdur. Zemin ve kenarlık sabit kalır,
 * kartın tıklanabilir olduğunu ışık söyler. Başlığın markaya dönmesi kendi
 * öğesinde tanımlıdır (kartın geçişiyle karışmasın diye).
 */
export function OfficeCenterCard({ title, description, href, icon: Icon }: Props) {
  return (
    <Link
      href={href}
      /* KUTUCUK davranışı (TileGrid ile aynı): /modules bir modülün İÇERİĞİ
         değil, modüllerin GİRİŞ ekranıdır — CLAUDE.md'nin tek tasarım dili
         kuralı burada kutucuk ister. Kart gibi yalnız gölgelenmesi, tıklanınca
         gezinen bir öğeyi duran bir panel gibi gösteriyordu. Kaldırma
         TileGrid'inkiyle birebir aynı (-1px, 180ms) ki iki ızgara aynı
         hareketi öğretsin. */
      className="group flex gap-3.5 rounded-card border border-line bg-surface p-4 shadow-card transition-[transform,box-shadow,border-color] duration-[180ms] ease-standard hover:-translate-y-px hover:border-line-strong hover:shadow-card-hover active:translate-y-0 active:shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring focus-visible:ring-offset-2"
    >
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-brand-soft text-brand">
        <Icon size={18} aria-hidden />
      </div>
      <div className="min-w-0">
        <h3 className="text-[14px] font-semibold tracking-tight leading-snug text-ink transition-colors duration-150 ease-standard group-hover:text-brand">
          {title}
        </h3>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{description}</p>
      </div>
    </Link>
  );
}
