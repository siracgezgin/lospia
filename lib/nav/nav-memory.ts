"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * "GERİ" EN SON BAKTIĞIN YERE DÖNSÜN.
 *
 * Sıraç (17.11.2026): "Herhangi bir kategorideki ürünün içerisindeyim, geriye
 * basıyorum beni direkt en başa atıyor. Bunu istemiyoruz."
 *
 * "Geri" hiyerarşiktir (bkz. parent-path.ts): föyün üstü Collection'dır. Ama
 * Collection'ın İÇİNDE bir kategori, Stock'ta bir yer, AF Teamwork'te bir
 * klasör vardır ve o seçim ADRESTE durur (?kat=…). Föye listeden girilince
 * bu `?from=` ile taşınıyordu; yeni föy açınca, kaydedince, yazdırma
 * sayfasından dönünce ya da aramadan gelince taşınmıyor, "geri" modülün en
 * başına düşüyordu.
 *
 * Çözüm her giriş yolunu tek tek yamamak değil: her modül sayfasının SON
 * görünümü (adres + sorgu) bu sekme için hatırlanır; "geri" üst sayfaya
 * giderken o görünüme gider. Kullanıcı modülün köküne kendisi dönerse
 * (sorgusuz adres) kayıt silinir — kök bilinçli bir seçimdir.
 *
 * sessionStorage: sekmeye özeldir, sekme kapanınca gider; sunucuya hiçbir şey
 * yazılmaz.
 */

const KEY = "af:last-view";
const EVENT = "af:nav-memory";

function read(): string {
  try { return window.sessionStorage.getItem(KEY) ?? "{}"; } catch { return "{}"; }
}

/** Bulunulan sayfanın görünümünü kaydeder (sorgu yoksa kaydı siler). */
export function rememberView(pathname: string, search: string) {
  try {
    const map = JSON.parse(read()) as Record<string, string>;
    const before = map[pathname];
    if (search) map[pathname] = `${pathname}?${search}`;
    else delete map[pathname];
    if (map[pathname] === before) return;
    window.sessionStorage.setItem(KEY, JSON.stringify(map));
    window.dispatchEvent(new Event(EVENT));
  } catch { /* depolama kapalıysa "geri" köke gider — eski davranış */ }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

/** Yol → son görünüm adresi. Sunucuda ve ilk çizimde boştur (hidrasyon güvenli). */
export function useRememberedViews(): Record<string, string> {
  const raw = useSyncExternalStore(subscribe, read, () => "{}");
  return useMemo(() => {
    try { return JSON.parse(raw) as Record<string, string>; } catch { return {}; }
  }, [raw]);
}
