"use client";

import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { VIEW_ORDER, VIEW_META, tabClass } from "@/components/shared/ViewTabs";

/**
 * LİSTE + RAPORLAR — TEK ŞERİT.
 *
 * Sıraç (2026-08-29): "reports kısmı burdaki olmalı direkt ve rapor kısımlarını
 * da buraya ekleyip entegre edelim… burası burdaki gibi olmalı."
 *
 * Üye için Reports, List'in zaten söylediğini söylüyordu (bana atanan işler +
 * teslim tarihleri) ve iki ayrı kapı iki ayrı yüzey gibi duruyordu. Artık ikisi
 * AYNI sekme şeridini paylaşır: görev görünümleri solda, Raporlar sağda.
 *
 * Rotalar AYRI kalır (tek rota = tek isim kuralı ve hız): rapor sorguları liste
 * açılışına, liste sorguları rapor açılışına binmez. Kullanıcı açısından tek
 * yüzey, sistem açısından iki hafif sayfa.
 *
 * Bu bileşen RAPOR sayfasında kullanılır (bağlantı modunda tüm sekmeler);
 * List kendi şeridini istemci tarafında çizer ve sonuna aynı "Raporlar"
 * sekmesini ekler.
 *
 * "use client" ŞART: sekme biçimi ve görünüm sözlüğü (VIEW_META, ikonlar)
 * ViewTabs'tan gelir ve o bir istemci modülüdür. Sunucu bileşeninden istemci
 * modülünün fonksiyonunu çağırmak çalışma anında patlıyordu — rapor sayfası
 * hata sınırına düşüyordu. Bileşenin kendi verisi yok, yalnız bağlantı çizer.
 */
export function SurfaceTabs() {
  return (
    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
      {VIEW_ORDER.map((slug) => {
        const meta = VIEW_META[slug];
        const Icon = meta.icon;
        return (
          <Link
            key={slug}
            href={slug === "all" ? "/list" : `/list?view=${slug}`}
            className={tabClass(false)}
          >
            <Icon size={14} className="shrink-0" aria-hidden />
            {meta.label}
          </Link>
        );
      })}
      <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line" />
      <span className={tabClass(true)} aria-current="page">
        <LayoutDashboard size={14} className="shrink-0" aria-hidden />
        Raporlar
      </span>
    </div>
  );
}
