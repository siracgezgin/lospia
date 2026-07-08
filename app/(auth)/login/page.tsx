import type { Metadata } from "next";
import { LoginForm } from "@/components/layout/LoginForm";
import { LOSPIA_LOGO, PRODUCT_NAME } from "@/lib/branding";

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
  return (
    <main className="min-h-screen flex items-center justify-center bg-app px-4">
      <div className="w-full max-w-sm space-y-7 p-8 bg-surface rounded-2xl shadow-sm border border-line">
        {/* Brand — product-level only. The Lospia product logo leads, then a
            single generic supporting line. Logo width is capped so it reads as
            a confident brand mark without shouting or overflowing the card.
            The public login card must NOT surface any tenant/workspace name
            (e.g. "Aslı Filinta Operasyon") — that is user data and only appears
            inside the authenticated app shell after sign-in. */}
        <div className="flex flex-col items-center text-center space-y-4">
          <img
            src={LOSPIA_LOGO}
            alt={PRODUCT_NAME}
            className="w-40 h-auto select-none"
            draggable={false}
          />
          <p className="text-sm text-muted leading-relaxed">
            Görevler, ekip akışı ve operasyon takibi için giriş yapın.
          </p>
        </div>
        <LoginForm initialEmail={initialEmail} />
      </div>
    </main>
  );
}
