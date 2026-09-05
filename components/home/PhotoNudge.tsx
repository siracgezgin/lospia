"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { PersonAvatar } from "@/components/ui/PersonAvatar";

/**
 * FOTOĞRAF DAVETİ — Ana Sayfa'da tatlı, tek satırlık bir hatırlatma.
 *
 * Sıraç (2026-08-30): "Ana sayfaya bir pop-up ekleyelim kişiler resim eklesin
 * diye. Tatlı bir pop-up olsun işte, 'size ait görevleri kolayca fark
 * etmeniz gibisinden'."
 *
 * NEDEN EKRANIN ORTASINA ÇIKAN BİR PENCERE DEĞİL: Ana Sayfa'nın işi "bugün ne
 * yapacağım?"a cevap vermek. Sabah açan kişiyi kapatması gereken bir pencereyle
 * karşılamak, o cevabı geciktirir — ve bu istek bir GÖREV değil, bir davet.
 * Bu yüzden sayfanın üstünde duran, işi engellemeyen bir şerit: yanında kendi
 * rozetini görür ("şu an böyle görünüyorsun"), tek tıkla profiline gider.
 *
 * YALNIZ FOTOĞRAFI OLMAYANA çıkar ve kapatılabilir; kapatma tarayıcıda
 * hatırlanır (kişiye ve cihaza özel). Kabul edilince zaten bir daha görünmez,
 * çünkü fotoğraf artık vardır.
 */

const KEY = "af.home.photoNudge.dismissed";

const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};
function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false; // gizli sekmede depolama kapalı olabilir
  }
}

export function PhotoNudge({ name, colorHex }: { name: string; colorHex?: string | null }) {
  /* Sunucuda "kapatılmamış" varsayılır; tarayıcı ilk boyamadan hemen sonra
     tercihi uygular (hydration uyuşmazlığı olmadan — AppSidebar ile aynı
     desen). */
  const stored = useSyncExternalStore(subscribe, readDismissed, () => false);
  const [closed, setClosed] = useState(false);
  if (stored || closed) return null;

  function dismiss() {
    setClosed(true);
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      /* yoksay — tercih yalnız bu oturumda yaşar */
    }
  }

  return (
    <div className="anim-fade-down mb-4 flex items-center gap-3 rounded-card border border-brand-ring/40 bg-brand-soft/50 px-4 py-3">
      {/* Kişinin ŞU ANKİ hâli — davet soyut kalmasın. */}
      <PersonAvatar name={name} colorHex={colorHex ?? null} size="md" />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium text-ink">
          Fotoğrafınızı ekleyin, işleriniz sizin yüzünüzle görünsün.
        </p>
        <p className="mt-0.5 text-[12.5px] text-muted">
          Takvimde ve panoda size ait olanı bir bakışta fark edersiniz.
        </p>
      </div>
      <Link
        href="/profile"
        className="inline-flex h-9 shrink-0 items-center rounded-control bg-brand px-3.5 text-[13.5px] font-medium text-white transition-colors duration-150 hover:bg-brand-strong pointer-coarse:h-11"
      >
        Fotoğraf ekle
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Kapat"
        className="tap-target grid size-8 shrink-0 place-items-center rounded-control text-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-ink"
      >
        <X size={15} aria-hidden />
      </button>
    </div>
  );
}
