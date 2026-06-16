import { LoginForm } from "@/components/layout/LoginForm";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm space-y-6 p-8 bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Aslı Filinta Operasyon</h1>
          <p className="text-sm text-gray-500">Çalışma alanına giriş yap</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
