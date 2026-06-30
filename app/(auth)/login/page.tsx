import { LoginForm } from "@/components/layout/LoginForm";
import { Wordmark } from "@/components/ui/Wordmark";

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
        <div className="space-y-3">
          <Wordmark name="Operasyon" />
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
