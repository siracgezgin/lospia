"use client";

import { BackLink } from "@/components/modules/BackLink";

/**
 * TAKVİMİN ORTAK ARAÇ ÇUBUĞU — hafta, ay ve yıl için TEK gövde.
 *
 * Sıraç (2026-08-29): "Mantıksız olmuş, bir sağ bir sol." → "Böyle çok saçma,
 * tutarsız olmuş; hepsi aynı yerde olsun."
 *
 * Üç görünüm üç ayrı çubuk çiziyordu: hafta kendi çerçeveli barını, ay ve yıl
 * ise sayfa dolgusunun içinde serbest bir satırı kullanıyordu. Üstelik ölçek
 * seçici hafta görünümünde sağda, ay görünümünde bir üst satırda solda
 * kalıyordu. Aynı kontrol ekrandan ekrana yer değiştirince kullanıcı her
 * seferinde yeniden arıyor.
 *
 * Tek kural: SOLDA "geri" + o ölçeğin gezinmesi, SAĞDA ölçek seçici; çubuk
 * her zaman içeriğin en üstünde, aynı yükseklikte, aynı çerçeveyle.
 */
export function CalendarToolbar({
  children,
  viewSwitch,
}: {
  /** O ölçeğin gezinme kontrolleri (ileri/geri, "Bugün"…). */
  children: React.ReactNode;
  viewSwitch: React.ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-hairline bg-surface px-3 py-1.5 sm:gap-2 sm:px-4">
      <BackLink />
      {children}
      <span className="ml-auto shrink-0">{viewSwitch}</span>
    </div>
  );
}
