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
      <div className="w-full max-w-sm space-y-6 p-8 bg-surface rounded-2xl shadow-sm border border-line">
        {/* Brand — Aslı Filinta logo above the product name. Centered and height-
            capped so it stays crisp and never overflows the card on mobile. */}
        <div className="flex flex-col items-center text-center space-y-3">
          <img
            src="/brands/asli-filinta-logo.png"
            alt="Aslı Filinta"
            width={480}
            height={248}
            className="h-16 w-auto max-w-[70%] select-none"
            draggable={false}
          />
          <div className="space-y-1">
            <h1 className="text-lg font-semibold tracking-tight text-ink">AF Operasyon</h1>
            <p className="text-sm text-muted">AF Operasyon hesabınıza giriş yapın.</p>
          </div>
        </div>
        <LoginForm initialEmail={initialEmail} />
      </div>
    </main>
  );
}
