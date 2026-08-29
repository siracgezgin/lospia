"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * SIRALANABİLİR SÜTUN BAŞLIĞI — tek kaynak.
 *
 * Sıraç (2026-08-29): "Tür, tarihin yanında bir ikon olsun basılır olduğu
 * anlaşılır olması için; site genelinde varsa tüm kısımları öyle yap."
 *
 * Sorun şuydu: başlık tıklanabilirdi ama YALNIZ sıralanmışken ok çıkıyordu.
 * Hiç dokunulmamış bir tabloda dört başlık da düz metin gibi duruyor,
 * tıklanabilir olduğu ancak kazara keşfediliyordu.
 *
 * Kural: ikon HER ZAMAN var.
 *   • sıralanmamış → soluk çift ok (⇅), "buraya basılabilir"
 *   • sıralanmış   → tek yön oku, koyu
 */
export function SortHeader({
  active, dir, onSort, align = "left", className, children,
}: {
  /** Bu sütun şu an sıralı mı? */
  active: boolean;
  dir: "asc" | "desc";
  onSort: () => void;
  align?: "left" | "right";
  className?: string;
  children: React.ReactNode;
}) {
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={onSort}
      // aria-sort <th>'e aittir, <button>'a değil; ekran okuyucuya durumu
      // düğmenin kendi etiketiyle söylüyoruz.
      aria-label={
        active
          ? `${dir === "asc" ? "Artan" : "Azalan"} sıralı — sırayı ters çevir`
          : "Bu sütuna göre sırala"
      }
      className={cn(
        "group/sort inline-flex max-w-full items-center gap-1 whitespace-nowrap text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors",
        active ? "text-ink" : "text-subtle hover:text-ink",
        align === "right" && "justify-end",
        className,
      )}
    >
      {children}
      <Icon
        size={11}
        className={cn(
          "shrink-0 transition-opacity",
          active ? "opacity-100" : "opacity-45 group-hover/sort:opacity-100",
        )}
      />
    </button>
  );
}
