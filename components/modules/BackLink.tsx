"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { parentPathOf } from "@/lib/nav/parent-path";

/**
 * "← Geri" — HİYERARŞİK, geçmişe göre değil.
 *
 * Sıraç (2026-08-29):
 *   "AF Teamwork'te geriye basıyorum beni CRM'e atıyor. CRM'de geriye
 *    basıyorum Board'a gidiyor… bozuk çalışıyor."
 *   "/collection'da geri butonu olması gereksiz. Bir yere girmişsem geri
 *    gelmeli ve soldaki başlığa dönmeli."
 *
 * Önce `router.back()` kullanıyordu: "bir önce BAKTIĞIN sayfa"ya gider. Sol
 * menüden CRM → AF Teamwork gezinildiyse AF Teamwork'te "Geri" CRM'e dönüyordu
 * — tarayıcı açısından doğru, kullanıcı açısından bozuk.
 *
 * Artık hedef yolun KENDİSİNDEN türer (lib/nav/parent-path.ts):
 *   • Sol menüde kendi satırı olan sayfa bir köktür → düğme HİÇ ÇİZİLMEZ.
 *   • Alt sayfa kendi üstüne döner: /production/<id> → /collection gibi.
 *
 * Sayfa içi kırılımlar (Koleksiyon'da kategori seçimi, Drive'da klasör) rota
 * değiştirmez; onların kendi "geri"si bulundukları bileşende yaşar.
 */
export function BackLink({
  /** Yolun kendisinden türetilene karşı ELLE hedef. */
  href,
}: {
  href?: string;
}) {
  const pathname = usePathname();
  const target = href ?? parentPathOf(pathname);

  // Kök sayfada gösterilecek bir "üst" yok — satır hiç açılmaz.
  if (!target) return null;

  return (
    <Link
      href={target}
      className="group inline-flex items-center gap-1.5 rounded-md py-0.5 text-[13px] text-muted transition-colors duration-150 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
    >
      <ArrowLeft size={14} className="shrink-0 transition-transform duration-150 ease-standard group-hover:-translate-x-0.5" />
      Geri
    </Link>
  );
}
