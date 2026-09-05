import { redirect } from "next/navigation";

/**
 * OTURUM DÜŞTÜĞÜNDE NEREYE GİDİLİR.
 *
 * Sıraç (2026-09-05): canlıda "/home açılırken çok fazla yönlendirme oldu"
 * hatası. Sebebi yapısaldı: kimlik doğrulama kararı İKİ AYRI kaynaktan
 * veriliyordu.
 *
 *   proxy (lib/supabase/middleware.ts) → supabase.auth.getClaims()
 *       JWT'yi YERELDE doğrular; ağ turu yok (bilinçli performans kararı).
 *       Claims varsa "/login" isteğini "/home"a yollar.
 *
 *   sayfalar (lib/modules/context.ts → getAuthUser)  → supabase.auth.getUser()
 *       Supabase Auth'a GERÇEK bir istek atar. null dönerse "/login"e yollar.
 *
 * İkisi çeliştiği anda — erişim jetonu yerelde hâlâ geçerli ama sunucu onu
 * reddediyor: oturum iptal edilmiş, kullanıcı silinmiş, yenileme jetonu
 * eskimiş, ya da Auth'a o an ulaşılamıyor — döngü kaçınılmaz:
 *     /home → (sayfa) /login → (proxy) /home → …
 *
 * ÇÖZÜM: sayfa doğrudan "/login"e YOLLAMAZ. Çerezleri silen çıkış kapısına
 * yollar; o kapı `sb-*` çerezlerini temizleyip 303 ile "/login"e bırakır.
 * Çerez gidince proxy de "oturum yok" der ve giriş ekranı açılır — döngü
 * kendini onarır. `?e=session` işareti hem proxy'nin geri sektirmemesi hem de
 * kullanıcıya "oturumun sona ermiş" diyebilmek için taşınır.
 */
export const SESSION_EXPIRED_PATH = "/api/auth/signout?reason=session";

/** Sayfa kendi kontrolünde oturumu geçersiz bulduğunda çağrılır. */
export function redirectToSignIn(): never {
  redirect(SESSION_EXPIRED_PATH);
}
