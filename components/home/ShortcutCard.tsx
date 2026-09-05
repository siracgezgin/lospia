import Link from "next/link";
import type { ModuleEntry } from "@/lib/modules/registry";

/**
 * @deprecated KULLANILMIYOR — silinmeyi bekliyor (dosya silmek kullanıcı onayı
 * ister, bkz. CLAUDE.md "Ask before deleting any file").
 *
 * Ana Sayfa'daki kısayol ızgarası 2026-08-29'da kaldırıldı ("zaten yanda var
 * her şey"); gezinme artık sol menü + /modules hub'ıdır. Bileşen geride kaldı
 * ve hiçbir yerden import edilmiyor. YENİDEN BAĞLAMA: Ana Sayfa'ya kısayol
 * eklemek o kararı geri almak olur.
 *
 * Home Page kısayolu — KOMPAKT çip.
 *
 * Aslı Hanım (2026-08-24): "Bu haliyle her şey aynı geliyor, karmaşık geliyor."
 * Kısayollar iki satırlık açıklamalı büyük kartlardı; 17 tanesi dört sıra
 * kaplayıp sayfanın çoğunu yutuyor ve hepsi aynı ağırlıkta olduğu için hiçbiri
 * seçilemiyordu. Üstelik sol menü zaten aynı ekranların hepsini listeliyor —
 * yani bu bölüm gezinmeyi TEKRAR ediyordu.
 *
 * Çip artık tek satır: ikon + ad. Açıklama `title` olarak duruyor (kaybolmadı,
 * yalnız yer kaplamıyor). Modüllerin tam dizini "Operation Modules" ekranında.
 */
export function ShortcutCard({ entry }: { entry: ModuleEntry }) {
  const Icon = entry.icon;
  return (
    <Link
      href={entry.href}
      title={entry.description}
      className="group inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 shadow-xs transition-[box-shadow,border-color,color] duration-150 ease-standard hover:border-line-strong hover:bg-surface-muted"
    >
      <Icon size={14} className="shrink-0 text-muted transition-colors duration-150 group-hover:text-brand" />
      <span className="truncate text-[13px] font-medium text-ink">{entry.title}</span>
    </Link>
  );
}
