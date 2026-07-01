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
        {/* Brand — AF emblem above the Aslı Filinta wordmark, then a single, non-
            repetitive product line. Heights are capped so it stays crisp and never
            overflows the card on mobile. */}
        <div className="flex flex-col items-center text-center space-y-4">
          <img
            src="/brands/af-mark.png"
            alt="Aslı Filinta"
            width={512}
            height={512}
            className="h-16 w-16 select-none"
            draggable={false}
          />
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight text-ink">Aslı Filinta Operasyon</h1>
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
