"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * ÜRÜN KARTI EYLEM MENÜSÜ.
 *
 * Sıraç (2026-09-17): "Şu taşıma silme ikonları çok küçük ve anlaşılır değil,
 * o yüzden görünmüyor. Daha görünür, anlaşılır ve profesyonelce olsa daha iyi."
 *
 * ESKİSİ: kartın köşesinde beş ayrı 13 piksellik ikon, yan yana, etiketsiz ve
 * yalnız fare üstüne gelince beliriyordu. Beş simgeyi birbirinden ayırmak
 * (yazıcı / indirme oku / klasör oku / çöp kutusu) tahmin işiydi; kapak ekleme
 * ile Excel indirme neredeyse aynı görünüyordu.
 *
 * YENİSİ: tek düğme, HER ZAMAN görünür, içinde ETİKETLİ satırlar. Beş simgeyi
 * ayırt etmek yerine beş cümle okunuyor. Kart yüzeyi de temizlendi: ürün
 * fotoğrafının üstünde tek bir işaret duruyor.
 *
 * Menü satırları `children` olarak gelir — her eylem kendi davranışını
 * (onay penceresi, dosya seçici, indirme günlüğü) korur; buradaki iş yalnız
 * açıp kapamak. `menuItemCls` ortak satır görünümüdür.
 */

/** Menü satırı — düğme, bağlantı ya da başka bir eylem bileşeni aynı görünür. */
export const menuItemCls = cn(
  "flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-[13px] font-medium text-ink",
  "transition-colors duration-150 hover:bg-surface-muted disabled:pointer-events-none disabled:opacity-50",
  "[&>svg]:size-[15px] [&>svg]:shrink-0 [&>svg]:text-muted",
);

/** Yıkıcı satır — çöp kutusu rengiyle konuşur, ayırıcının altında durur. */
export const menuItemDangerCls = cn(
  menuItemCls,
  "text-danger hover:bg-danger/10 [&>svg]:text-danger",
);

export function SheetCardMenu({
  label,
  children,
}: {
  /** Erişilebilir ad — "Siyah Yelek işlemleri". */
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    /* z-[3]: kartın tamamını kaplayan gizli bağlantı z-[1], rozetler z-[2].
       Menü onların üstünde olmalı, yoksa tıklama föyü açar.

       SARMALAYICI KARTIN GENİŞLİĞİNCE (inset-x-2). Menü 208 piksel sabitti ve
       düğmenin SOLUNA doğru açılıyordu; telefonda kart 165 piksel olduğu için
       panel kartın dışına, hatta ekranın dışına taşıyordu. Artık genişlik
       karttan miras alınıyor (max-w-full) — panel her boyutta tam görünür.
       `pointer-events-none`: şerit boydan boya olduğu için üstündeki tıklama
       föyü açan bağlantıya geçmeli; yalnız düğme ve panel tıklama alır. */
    <div ref={box} className="pointer-events-none absolute inset-x-2 top-2 z-[3] flex justify-end">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label} işlemleri`}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        className={cn(
          "pointer-events-auto tap-target grid size-8 place-items-center rounded-control border bg-surface text-muted shadow-card",
          "transition-[background-color,border-color,color] duration-150",
          open ? "border-line-strong bg-surface-muted text-ink" : "border-line hover:border-line-strong hover:bg-surface-muted hover:text-ink",
        )}
      >
        <MoreVertical size={17} aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={`${label} işlemleri`}
          /* Tıklanan satır işini yapar ve menü kapanır; her satıra tek tek
             kapatma bağlamak yerine kapsayıcı dinler. */
          onClick={() => setOpen(false)}
          className="pointer-events-auto anim-fade-down absolute right-0 top-9 w-[208px] max-w-full rounded-card border border-line bg-surface p-1 shadow-pop"
        >
          {children}
        </div>
      )}
    </div>
  );
}
