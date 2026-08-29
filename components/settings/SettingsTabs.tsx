"use client";

import { Children, isValidElement, useState } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Ayarlar sekmeleri.
 *
 * Aslı Hanım (2026-08-23): "Diğer kısımlar da çok kötü, ayarlar sayfası."
 *
 * Sayfa dokuz bölümü tek yığın hâlinde gösteriyordu: profil, hesap açma, ekip
 * ve ÜRÜN VERİSİ (sezon/usta/hammadde) yan yanaydı. Bunlar farklı işler ve
 * farklı sıklıkta açılıyor — sezon yılda bir, hammadde haftada bir, profil
 * neredeyse hiç. Hepsini aynı anda göstermek her birini bulunmaz kılıyordu.
 *
 * API neden ÇOCUK düğüm, prop dizisi DEĞİL: sekmeler `tabs={[{node: <…/>}]}`
 * biçiminde veriliyordu ve bu dizi SUNUCUDAN istemciye RSC yüküyle geçiyor;
 * React içindeki elemanları anahtarsız liste sayıp uyarıyordu. Çocuk düğümde
 * anahtar JSX'in doğal parçası, uyarı kökten kalkıyor.
 *
 * Sekme SEÇİMİ URL'e yazılmaz: Ayarlar'a giren herkes aynı yerden başlasın,
 * paylaşılan bir bağlantı beklenmedik sekmede açılmasın.
 */
export function SettingsTab({ children }: {
  /** Sekme etiketi. */
  label: string;
  /** Etiketin yanındaki sayı (kaç kişi, kaç sezon…). */
  count?: number;
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

type TabElement = React.ReactElement<{ label: string; count?: number; children: React.ReactNode }>;

export function SettingsTabs({ children }: { children: React.ReactNode }) {
  const tabs = (Children.toArray(children) as TabElement[]).filter(isValidElement);
  const [active, setActive] = useState(0);
  const current = tabs[active] ?? tabs[0];

  return (
    <div className="space-y-6">
      {/* Sekme şeridi — dar ekranda yatay kayar, sarmalanıp iki sıra olmaz. */}
      <div className="-mx-1 overflow-x-auto pb-1">
        <div role="tablist" className="flex min-w-max items-center gap-1 px-1">
          {tabs.map((t, i) => {
            const on = i === active;
            return (
              <button
                key={t.props.label}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setActive(i)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-control px-3 text-[13.5px] font-medium",
                  "transition-colors duration-150 ease-standard",
                  on ? "bg-ink text-white" : "text-muted hover:bg-surface-muted hover:text-ink",
                )}
              >
                {t.props.label}
                {t.props.count !== undefined && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[12px] tabular-nums",
                      on ? "bg-white/20 text-white" : "bg-surface-sunken text-subtle",
                    )}
                  >
                    {t.props.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div role="tabpanel" className="anim-fade-down">{current}</div>
    </div>
  );
}
