import { LoginForm } from "@/components/layout/LoginForm";
import { LOSPIA_LOGO, PRODUCT_NAME } from "@/lib/branding";

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
        {/* Brand — the Lospia product logo leads, then a single supporting
            line. Logo width is capped so it reads as a confident brand mark
            without shouting or overflowing the card. The tenant/workspace name
            stays secondary and quieter beneath the product wording. */}
        <div className="flex flex-col items-center text-center space-y-4">
          <img
            src={LOSPIA_LOGO}
            alt={PRODUCT_NAME}
            className="w-40 h-auto select-none"
            draggable={false}
          />
          <div className="space-y-1.5">
            <p className="text-sm text-muted leading-relaxed">
              Görevler, ekip akışı ve operasyon takibi için giriş yapın.
            </p>
            <p className="text-xs text-subtle">Aslı Filinta Operasyon</p>
          </div>
        </div>
        <LoginForm initialEmail={initialEmail} />
      </div>
    </main>
  );
}
