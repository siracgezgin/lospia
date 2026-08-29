/**
 * Ayarlar bölümü — TEK yüzey biçimi.
 *
 * SUNUCU bileşeni (bilerek "use client" yok): hiç etkileşimi yok ve istemci
 * sınırından geçen çocuklar RSC yükünde diziye dönüşüp React'in anahtar
 * denetimine takılıyordu ("Each child in a list should have a unique key").
 * Sunucuda kalınca çocuklar JSX'in doğal statik listesi olarak derleniyor.
 *
 * Sayfada iki ayrı düzen vardı: bazı bölümlerin başlığı kartın dışında,
 * bazıları içindeydi. Aynı sayfada iki görsel sistem, "dağınık" hissinin
 * yarısıydı.
 *
 * Katman sırası: zemin → BU YÜZEY → ince çizgi → içerik. Bölümün içindeki
 * listeler ve formlar ayrıca kart olmaz (kart içinde kart yok); satırlar
 * ince çizgiyle, açılır formlar yumuşak dolguyla ayrılır.
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
    <section className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
      {/* SARMALAMAZ: `flex-wrap` ile sayaç dar kolonda alt satıra düşüp sola
          yapışıyordu. Metin bloğu daralır (min-w-0 flex-1), sayaç sağda kalır. */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
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

/** Bölüm başlığının yanındaki sayaç — listeyi TARİF eder (kaç kişi, kaç
 *  sezon); kimseyi puanlamaz. Sadelik kuralının serbest bıraktığı tek sayı. */
export function CountChip({ n, birim }: { n: number; birim: string }) {
  return (
    <span className="shrink-0 rounded-full bg-surface-sunken px-2.5 py-1 text-[12px] tabular-nums text-muted">
      {n} {birim}
    </span>
  );
}
