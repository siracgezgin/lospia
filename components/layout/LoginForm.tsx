"use client";

import { useActionState } from "react";
import { signIn, type AuthFormState } from "@/lib/actions/auth";

// Sign-in only. Public self-signup has been removed — accounts are created by an
// owner/admin in Settings → "Hesap oluştur". The person signs in directly with
// the username (or e-mail) + password they were given.
export function LoginForm({ initialEmail = "" }: { initialEmail?: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signIn, null);

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <div>
          <label htmlFor="identifier" className="block text-sm font-medium text-gray-700 mb-1">
            Kullanıcı adı
          </label>
          <input
            id="identifier"
            name="identifier"
            type="text"
            autoComplete="username"
            required
            defaultValue={initialEmail}
            placeholder="Kullanıcı adı"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Şifre
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="Şifre"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {state?.error != null && (
          <p className="text-sm bg-red-50 border border-red-200 px-3 py-2 rounded-lg" style={{ color: "#b91c1c" }}>
            {state.error || "Giriş yapılamadı. Lütfen tekrar deneyin."}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? "Giriş yapılıyor…" : "Giriş yap"}
        </button>
      </form>

      <p className="text-xs text-center text-gray-400">
        Hesabınız yoksa yöneticinize başvurun.
      </p>
    </div>
  );
}
