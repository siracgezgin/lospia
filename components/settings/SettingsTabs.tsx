"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";

export type SettingsTab = {
  key: string;
  label: string;
  /** Sekme etiketinin yanındaki sayı (kaç üye, kaç sezon…). */
  count?: number;
  node: React.ReactNode;
};

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
 * Sekme SEÇİMİ URL'e yazılmaz: Ayarlar'a giren herkes aynı yerden başlasın,
 * paylaşılan bir bağlantı beklenmedik sekmede açılmasın.
 */
export function SettingsTabs({ tabs }: { tabs: SettingsTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className="space-y-6">
      {/* Sekme şeridi — dar ekranda yatay kayar, sarmalanıp iki sıra olmaz. */}
      <div className="-mx-1 overflow-x-auto pb-1">
        <div role="tablist" className="flex min-w-max items-center gap-1 px-1">
          {tabs.map((t) => {
            const on = t.key === current?.key;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={on}
                onClick={() => setActive(t.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13.5px] font-medium",
                  "transition-colors duration-150",
                  on
                    ? "bg-ink text-white"
                    : "text-muted hover:bg-surface-muted hover:text-ink",
                )}
              >
                {t.label}
                {t.count !== undefined && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[11px] tabular-nums",
                      on ? "bg-white/20 text-white" : "bg-surface-sunken text-subtle",
                    )}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="anim-fade-down">{current?.node}</div>
    </div>
  );
}

/**
 * Ayarlar bölümü — TEK kart biçimi.
 *
 * Sayfada iki ayrı düzen vardı: bazı bölümlerin başlığı kartın dışında, bazıları
 * içindeydi. Aynı sayfada iki görsel sistem, "dağınık" hissinin yarısıydı.
 */
export function SettingsSection({
  title, description, aside, children,
}: {
  title: string;
  description?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
      {/* SARMALAMAZ: `flex-wrap` ile sayaç dar kolonda alt satıra düşüp sola
          yapışıyordu. Metin bloğu daralır (min-w-0 flex-1), sayaç sağda kalır. */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
          {description && (
            <p className="mt-0.5 max-w-prose text-[13px] leading-relaxed text-muted">{description}</p>
          )}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Bölüm başlığının yanındaki sayaç — dört bölümde aynı biçim. */
export function CountChip({ n, birim }: { n: number; birim: string }) {
  return (
    <span className="shrink-0 rounded-full bg-surface-sunken px-2.5 py-1 text-xs tabular-nums text-muted">
      {n} {birim}
    </span>
  );
}
