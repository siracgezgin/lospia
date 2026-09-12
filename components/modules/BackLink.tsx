"use client";

import { usePathname } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { routeCrumbs, routeLabelOf } from "@/lib/nav/breadcrumbs";
import { parentPathOf } from "@/lib/nav/parent-path";

/**
 * Sayfanın hiyerarşi satırı — artık "← Geri" DEĞİL, TAM ZİNCİR.
 *
 * Sıraç (2026-09-12): "Geri gelince nereye geldiğin belli değil… bakınca da
 * anlaşılmıyor, tıklayınca da."
 *
 * Eskiden burada yalnız "← Geri" yazıyordu. Hedefi doğruydu (hiyerarşik, bkz.
 * lib/nav/parent-path.ts) ama NEREYE gideceğini söylemiyordu: kullanıcı
 * tıklamadan önce bilmiyor, tıkladıktan sonra da nereye düştüğünü anlamıyordu.
 * Artık zincirin tamamı yazılı — "Collection › Üretim Föyü" hem nerede
 * olduğunu hem üstünde ne olduğunu aynı anda söyler.
 *
 * Kök sayfalarda zincir tek halkaya iner ve Breadcrumbs kendini çizmez;
 * uygulama çubuğu o adı zaten yazıyor.
 *
 * Adı `BackLink` KALDI: on sayfa ve ModulePageHeader bu adı çağırıyor, tek
 * seferde hepsini yeniden adlandırmak bu düzeltmeyi gereksiz büyütürdü.
 */
export function BackLink({
  /** Yolun kendisinden türetilene karşı ELLE hedef (nadiren gerekir). */
  href,
}: {
  href?: string;
}) {
  const pathname = usePathname();

  /* Elle hedef verildiyse iki halkalı basit bir zincir kurulur: verilen üst +
     bulunulan sayfa. Türetme kuralı bunu bilemez, çağıran bilir. */
  if (href) {
    const parentLabel = routeLabelOf(href);
    const selfLabel = routeLabelOf(pathname);
    if (!parentLabel || !selfLabel) return null;
    return <Breadcrumbs items={[{ label: parentLabel, href }, { label: selfLabel }]} />;
  }

  /* Üstü olmayan sayfada çizecek bir şey yok — erken çıkış, boş <nav>
     oluşmasın. */
  if (!parentPathOf(pathname)) return null;
  return <Breadcrumbs items={routeCrumbs(pathname)} />;
}
