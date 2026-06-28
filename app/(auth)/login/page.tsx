import { LoginForm } from "@/components/layout/LoginForm";
import { Wordmark } from "@/components/ui/Wordmark";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; email?: string }>;
}) {
  const params = await searchParams;
  const initialMode = params.mode === "signup" ? "signup" : "signin";
  const initialEmail = params.email ?? "";
  return (
    <main className="min-h-screen flex items-center justify-center bg-app px-4">
      <div className="w-full max-w-sm space-y-6 p-8 bg-surface rounded-2xl shadow-sm border border-line">
        <div className="space-y-3">
          <Wordmark name="Operasyon" />
          <div className="space-y-1">
            <h1 className="text-lg font-semibold tracking-tight text-ink">Çalışma alanına giriş</h1>
            <p className="text-sm text-muted">Devam etmek için hesabınıza giriş yapın.</p>
          </div>
        </div>
        <LoginForm initialMode={initialMode} initialEmail={initialEmail} />
      </div>
    </main>
  );
}
