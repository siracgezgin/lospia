"use client";

import { useRouter } from "next/navigation";
import { Boxes, CalendarRange, Hammer } from "lucide-react";
import { Tile, TileGrid } from "@/components/ui/TileGrid";

/**
 * PRODUCT DATA GİRİŞİ — önce kutular, sonra içerik.
 *
 * Aslı Hanım (2026-08-28): "Bir tasarım her sayfada aynı olmalı… böyle kutu
 * kutu yapmayı." Ve (2026-08-24): "Aşağıdan böyle MUHASEBECİ GİBİ şey
 * seçtirip girdirmeyelim."
 *
 * Bu ekran üç yöneticiyi (Sezon · Usta · Hammadde) alt alta diziyordu —
 * uygulamadaki tek tasarım dilinin dışında kalan son giriş ekranıydı. Üç
 * kategori var; üç kutu olmalı.
 *
 * Karttaki sayı bir kişiyi ya da işi PUANLAMAZ, listeyi TARİF eder ("12 usta")
 * — sadelik kuralının serbest bıraktığı taraf.
 */

const BOXES = [
  {
    key: "sezon", label: "Sezonlar", icon: CalendarRange, hex: "#1f6e4d", unit: "sezon",
    hint: "Koleksiyonun zaman bağlamı",
  },
  {
    key: "usta", label: "Üreticiler", icon: Hammer, hex: "#82551a", unit: "usta",
    hint: "Föydeki üretici ve ödeme tablosu",
  },
  {
    key: "hammadde", label: "Hammadde", icon: Boxes, hex: "#2563c9", unit: "malzeme",
    hint: "Reçete ve maliyetin kaynağı",
  },
] as const;

export function ProductDataTiles({
  counts,
}: {
  counts: Record<string, number>;
}) {
  const router = useRouter();
  return (
    <div className="anim-fade">
      <div className="mb-5">
        <h2 className="text-lg font-semibold tracking-tight text-ink sm:text-xl">Ürün verisi</h2>
        <p className="mt-0.5 text-[13px] text-muted">
          Bir kutuya girin — föyler, maliyet ve ödeme tablosu buradan beslenir.
        </p>
      </div>
      <TileGrid>
        {BOXES.map((b) => {
          const n = counts[b.key] ?? 0;
          return (
            <Tile
              key={b.key}
              onClick={() => router.push(`/collection/veri?k=${b.key}`)}
              title={b.label}
              meta={n > 0 ? `${n} ${b.unit}` : b.hint}
              icon={b.icon}
              colorHex={b.hex}
            />
          );
        })}
      </TileGrid>
    </div>
  );
}
