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

  return (
    <main className="relative min-h-screen flex items-center justify-center bg-app px-4 py-12">
      {/* Sakin, kurumsal arka plan vurgusu — üstte hafif brand-soft radyal ışıma,
          köşede daha da soluk bir denge lekesi. Dekoratif; etkileşim almaz. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(44rem 30rem at 50% -8rem, var(--brand-soft) 0%, transparent 68%), radial-gradient(30rem 22rem at 106% 108%, var(--brand-soft) 0%, transparent 72%)",
        }}
      />

      <div className="anim-fade-up relative w-full max-w-sm space-y-6 rounded-2xl border border-line bg-surface p-8 shadow-pop">
        {/* Brand — the resolved product/pilot logo leads, then a single generic
            supporting line. Logo width is capped so it reads as a confident
            brand mark without overflowing the card. The pilot subline (AF only)
            is the one exception where a tenant name appears pre-auth, matching
            the original AF Operasyon login. */}
        <div
          className="anim-fade-up flex flex-col items-center text-center space-y-4"
          style={{ animationDelay: "60ms" }}
        >
          <img
            src={brand.loginLogo}
            alt={brand.name}
            className="w-40 h-auto select-none"
            draggable={false}
          />
          <div className="space-y-1.5">
            <p className="text-sm text-muted leading-relaxed">
              Görevler, ekip akışı ve operasyon takibi için giriş yapın.
            </p>
            {brand.loginSubtitle && (
              <p className="text-xs text-subtle">{brand.loginSubtitle}</p>
            )}
          </div>
        </div>

        <div
          aria-hidden
          className="anim-fade border-t border-hairline"
          style={{ animationDelay: "120ms" }}
        />

        <LoginForm initialEmail={initialEmail} />
      </div>
    </main>
  );
}
