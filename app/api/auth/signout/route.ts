import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * ÇIKIŞ — /api/auth/signout
 *
 * Kabuk (app/(app)/layout.tsx) buraya düz bir <form method="post"> ile gelir.
 * Bu yüzden yönlendirme 303 (See Other) olmalıdır: 303 tarayıcıya "aynı isteği
 * tekrarlama, hedefi GET ile aç" der. next/navigation'ın redirect()'i 307
 * üretir; 307 yöntemi KORUR, yani /login'e POST atılır ve sayfa 405 döner —
 * düğme "çalışmıyor" görünürdü. Kaynağı bu.
 *
 * Oturum çerezleri iki kez temizlenir: Supabase istemcisi kendi çerezlerini
 * siler, ardından kalan `sb-*` çerezleri yanıt üzerinde de silinir (istemci
 * kurulumu bir sebeple çerez yazamazsa kullanıcı yine de çıkmış olur).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function signOutAndRedirect(request: Request): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch (error) {
    // Çıkış hiçbir koşulda takılmamalı: oturum sunucuda kapanmasa bile
    // çerezler aşağıda silinir ve kullanıcı giriş ekranına döner.
    console.error("[signout] oturum kapatılamadı:", errorMessage(error));
  }

  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  response.headers.set("cache-control", "no-store");

  try {
    const store = await cookies();
    for (const cookie of store.getAll()) {
      if (cookie.name.startsWith("sb-")) response.cookies.delete(cookie.name);
    }
  } catch {
    // Çerez deposuna erişilemedi — Supabase istemcisi zaten temizlemiş olur.
  }

  return response;
}

export async function POST(request: Request) {
  return signOutAndRedirect(request);
}

/** Adres çubuğuna elle yazıldığında ya da eski bir bağlantıdan gelindiğinde. */
export async function GET(request: Request) {
  return signOutAndRedirect(request);
}

/** Gizli anahtar sızdırmadan, yalnız mesajı loglar. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
