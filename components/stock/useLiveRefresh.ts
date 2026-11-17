"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * STOK HERKESTE AYNI GÖRÜNSÜN — sayfayı elle yenilemeden.
 *
 * Aslı Hanım'ın istediği (Sıraç, 17.11.2026): "Gül Hanım sattı, düştü;
 * Aslı Hanım New York'tan o ürünün düştüğünü görmüş olmalı." Veri zaten tek
 * defterde; eksik olan, AÇIK DURAN ekranın kendini tazelemesiydi. Sekme
 * görünürken yarım dakikada bir ve sekmeye/pencereye her dönüşte sunucudan
 * yeniden okunur. Gizli sekme boşuna istek atmaz.
 */
export function useLiveRefresh(everyMs = 30_000) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    const timer = window.setInterval(refresh, everyMs);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [router, everyMs]);
}
