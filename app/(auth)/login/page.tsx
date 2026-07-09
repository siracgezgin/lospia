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
    <main className="min-h-screen flex items-center justify-center bg-app px-4">
      <div className="w-full max-w-sm space-y-7 p-8 bg-surface rounded-2xl shadow-sm border border-line">
        {/* Brand — the resolved product/pilot logo leads, then a single generic
            supporting line. Logo width is capped so it reads as a confident
            brand mark without overflowing the card. The pilot subline (AF only)
            is the one exception where a tenant name appears pre-auth, matching
            the original AF Operasyon login. */}
        <div className="flex flex-col items-center text-center space-y-4">
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
        <LoginForm initialEmail={initialEmail} />
      </div>
    </main>
  );
}
