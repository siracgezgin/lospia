import type { Metadata } from "next";
import { headers } from "next/headers";
import { LoginForm } from "@/components/layout/LoginForm";
import { getAppBrandForHost } from "@/lib/branding";

export const metadata: Metadata = {
  title: "Giriş",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;
  const initialEmail = params.email ?? "";

  // Host-aware login brand: the AF Operasyon pilot host keeps its own login
  // logo (and its pilot subline); everything else is the Lospia product mark.
  const brand = getAppBrandForHost((await headers()).get("host"));

  /* Sakin giriş: düz zemin, tek kart, tek form. Önce iki radyal ışıma vardı
     (gradient arka plan); marka ışıması değil görsel gürültüydü — kaldırıldı.
     Kart telefonda kenardan 16px içeride ve daha dar dolgu (p-6). */
  return (
    /* min-h-dvh (100vh DEĞİL): telefonda klavye açılınca ya da tarayıcı çubuğu
       gizlenince 100vh gerçek görünür alandan büyük kalıyor ve kart yukarı
       kayıyordu. dvh canlı yüksekliği izler; min- olduğu için kart sığmazsa
       sayfa normal şekilde kayar. */
    <main className="flex min-h-dvh items-center justify-center bg-app px-4 py-10 sm:py-12">
      {/* Her sayfanın bir <h1>'i olmalı; burada görsel karşılığı marka
          logosu olduğu için başlık yalnız ekran okuyuculara verilir. Kartın
          DIŞINDA duruyor: sr-only mutlak konumlu olduğu için yer kaplamaz,
          ama kartın `space-y-6` zinciri içinde ilk çocuk olsaydı logoya
          fazladan bir boşluk ekleyecekti. */}
      <h1 className="sr-only">{brand.name} — Giriş</h1>
      <div className="anim-fade-up w-full max-w-sm space-y-6 rounded-card border border-line bg-surface p-6 shadow-card sm:p-8">
        {/* Brand — the resolved product/pilot logo leads, then a single generic
            supporting line. Logo width is capped so it reads as a confident
            brand mark without overflowing the card. The pilot subline (AF only)
            is the one exception where a tenant name appears pre-auth, matching
            the original AF Operasyon login. */}
        <div className="flex flex-col items-center space-y-4 text-center">
          <img
            src={brand.loginLogo}
            alt={brand.name}
            className="h-auto w-40 select-none"
            draggable={false}
          />
          <div className="space-y-1.5">
            <p className="text-[13.5px] leading-relaxed text-muted">
              Görevler, ekip akışı ve operasyon takibi için giriş yapın.
            </p>
            {brand.loginSubtitle && (
              <p className="text-[12.5px] text-subtle">{brand.loginSubtitle}</p>
            )}
          </div>
        </div>

        <div aria-hidden className="border-t border-hairline" />

        <LoginForm initialEmail={initialEmail} />
      </div>
    </main>
  );
}
