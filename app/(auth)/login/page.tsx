import { LoginForm } from "@/components/layout/LoginForm";

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
        {/* Brand — the Aslı Filinta wordmark leads, then the product name and a
            single supporting line. Wordmark width is capped so it reads as a
            confident brand mark without shouting or overflowing the card. */}
        <div className="flex flex-col items-center text-center space-y-4">
          <img
            src="/brands/aslifilinta-login.png"
            alt="Aslı Filinta"
            width={2448}
            height={1264}
            className="w-44 h-auto select-none"
            draggable={false}
          />
          <div className="space-y-1.5">
            <h1 className="text-lg font-semibold tracking-tight text-ink">Aslı Filinta Operasyon</h1>
            <p className="text-sm text-muted leading-relaxed">
              Görevler, ekip akışı ve operasyon takibi için giriş yapın.
            </p>
          </div>
        </div>
        <LoginForm initialEmail={initialEmail} />
      </div>
    </main>
  );
}
