"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { Crumb } from "@/lib/nav/breadcrumbs";

/**
 * KIRINTI YOLU — uygulamanın TEK hiyerarşi göstergesi.
 *
 * Sıraç (2026-09-12): "Geri gelince nereye geldiğin belli değil… bazısında
 * var, bazısında yok, bazısı eksik, bazısı bozuk."
 *
 * ÜÇ KURAL, her yerde aynı:
 *  1. Zincir KÖKTEN başlar. "← Geri" tek başına nereye gideceğini söylemiyordu;
 *     tam zincir hem nerede olduğunu hem üstünde ne olduğunu aynı anda yazar.
 *  2. AYIRAÇ TEK TÜRDÜR (›) ve halkalar arasında başka simge YOKTUR. Drive'ın
 *     yolunda zincirin ortasında bir ev ikonu duruyordu — kutu bağlantısıyla
 *     aynı işi yapıyor ama ayrı bir şeymiş gibi görünüyordu.
 *  3. SON HALKA bulunduğun yerdir: koyu, kalın ve TIKLANMAZ. Bağlantı gibi
 *     görünen ama hiçbir şey yapmayan halka, "tıkladım bir şey olmadı"
 *     şikâyetinin kaynağıydı.
 *
 * Tek halka kalıyorsa hiç çizilmez: uygulama çubuğu o adı zaten yazıyor,
 * tekrarı yer kaplamaktan başka işe yaramaz.
 *
 * Sayfa içi derinlik (Drive'ın klasörleri, Koleksiyon'un kategorileri) rota
 * değiştirmez; o ekranlar kendi halkalarını `onSelect` ile aynı bileşene
 * ekler — görsel dil bölünmesin.
 */
export interface BreadcrumbItem extends Crumb {
  /** Rota değiştirmeyen halka (klasör, kategori). `href` ile birlikte verilmez. */
  onSelect?: () => void;
}

export function Breadcrumbs({
  items,
  className,
  ariaLabel = "Sayfa yolu",
}: {
  items: BreadcrumbItem[];
  className?: string;
  ariaLabel?: string;
}) {
  const trail = items.filter((i) => i.label);
  if (trail.length < 2) return null;

  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        /* Derin zincirde yol uzayınca GÖVDE yatay kaymasın; yol kendi kabında
           kaysın. Kaydırma çubuğu gizli — ince gri bir çizgi başlığın altında
           gürültü yapıyordu. */
        "flex min-w-0 items-center gap-1 overflow-x-auto text-[13.5px]",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {trail.map((item, i) => {
        const last = i === trail.length - 1;
        const body = (
          <span className="block max-w-[14rem] truncate">{item.label}</span>
        );
        const shared =
          "inline-flex h-8 shrink-0 items-center rounded-control px-1.5 transition-colors duration-150 ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring";

        return (
          <span key={`${item.label}-${i}`} className="inline-flex shrink-0 items-center gap-1">
            {i > 0 && <ChevronRight size={12} className="shrink-0 text-subtle" aria-hidden />}
            {last ? (
              /* aria-current="page": ekran okuyucu da hangisinin bulunulan yer
                 olduğunu bilsin — kalın yazı yalnız gören kullanıcıya söyler. */
              <span aria-current="page" className={cn(shared, "font-semibold text-ink")}>
                {body}
              </span>
            ) : item.href ? (
              <Link href={item.href} className={cn(shared, "text-muted hover:text-ink")}>
                {body}
              </Link>
            ) : (
              <button type="button" onClick={item.onSelect} className={cn(shared, "text-muted hover:text-ink")}>
                {body}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
