// Middleware Supabase client — used in middleware.ts to refresh sessions
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isMarketingHost, isMarketingPath } from "@/lib/marketing/host";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  /* Oturum doğrulama — getUser() DEĞİL getClaims().
     getUser() her istekte Supabase Auth'a gerçek bir HTTP turu atar. Bu proxy
     TÜM isteklerde çalışır (sayfa gezinmeleri, RSC prefetch'leri, server
     action'lar), yani o tur her tıklamaya biniyordu; üstüne kabuk bir tur daha
     atıyordu (aynı istekte iki kez /auth/v1/user görülüyordu).
     getClaims() asimetrik imzalı projelerde JWT'yi WebCrypto ile YERELDE
     doğrular (JWKS bir kez çekilip önbelleğe alınır) — ağ turu yok. Token'ın
     süresi dolmak üzereyse oturumu yine kendisi tazeler, yani çerez yenileme
     davranışı korunur. Simetrik gizli anahtar kullanan projede kütüphane
     kendiliğinden getUser() gibi sunucuya sorar: en kötü ihtimalle eskisi
     kadar, daha yavaş değil. */
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims ? { id: claimsData.claims.sub } : null;

  // Protect authenticated routes
  const pathname = request.nextUrl.pathname;
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/auth");
  const isPublicAsset =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico";

  // Public Lospia marketing pages — NEVER on the AF Operasyon pilot host.
  // On operasyon.aslifilinta.com these paths stay auth-gated exactly as before.
  const isPublicMarketingPage =
    isMarketingPath(pathname) && isMarketingHost(request.headers.get("host"));

  if (!isPublicAsset && !isAuthRoute && !isPublicMarketingPage && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  /* Oturumu geçersiz bulan bir SAYFA bizi buraya gönderdiyse ("?e=") geri
     sektirme. Sayfalar getUser() ile (gerçek sunucu turu), bu proxy ise
     getClaims() ile (yerel JWT doğrulaması) karar veriyor; ikisi çeliştiğinde
     /home → /login → /home döngüsü oluşuyordu (Sıraç, 2026-09-05: "çok fazla
     yönlendirme oldu"). Çıkış kapısı çerezleri sildiği için normalde buraya
     claims'siz gelinir; bu koşul, silme bir sebeple tutmazsa döngüyü yine de
     keser. Bkz. lib/auth/session-redirect.ts. */
  const cameFromFailedGate = request.nextUrl.searchParams.has("e");

  // Redirect authenticated users away from /login — Ana Sayfa karşılar.
  if (user && pathname === "/login" && !cameFromFailedGate) {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
