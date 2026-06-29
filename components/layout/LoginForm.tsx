"use client";

import { useActionState } from "react";
import { signIn, signUp, type AuthFormState } from "@/lib/actions/auth";
import { useState } from "react";

export function LoginForm({
  initialMode = "signin",
  initialEmail = "",
  initialName = "",
}: {
  initialMode?: "signin" | "signup";
  initialEmail?: string;
  initialName?: string;
}) {
  // Public sign-up form. Access is enforced server-side: account creation only
  // succeeds for e-mail addresses on the AF Operasyon team-access list, and it
  // never sends a confirmation e-mail. Non-allowed e-mails get a friendly error.
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [signInState, signInAction, signInPending] = useActionState<AuthFormState, FormData>(
    signIn,
    null
  );
  const [signUpState, signUpAction, signUpPending] = useActionState<AuthFormState, FormData>(
    signUp,
    null
  );
  // If sign-up reports the account already exists, present the sign-in form with
  // a hint (derived during render — no effect, no cascading setState).
  const existingAccount = !!(signUpState && "existing" in signUpState && signUpState.existing);
  const effectiveMode: "signin" | "signup" = existingAccount && mode === "signup" ? "signin" : mode;
  const notice = existingAccount ? "Bu e-posta ile hesap zaten var. Lütfen giriş yapın." : null;

  const state = effectiveMode === "signin" ? signInState : signUpState;
  const action = effectiveMode === "signin" ? signInAction : signUpAction;
  const pending = effectiveMode === "signin" ? signInPending : signUpPending;

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex rounded-lg bg-gray-100 p-1 text-sm font-medium">
        <button
          type="button"
          onClick={() => setMode("signin")}
          className={`flex-1 rounded-md py-1.5 transition-colors ${
            effectiveMode === "signin"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Giriş yap
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`flex-1 rounded-md py-1.5 transition-colors ${
            effectiveMode === "signup"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Hesap oluştur
        </button>
      </div>

      {notice && (
        <p className="text-sm text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
          {notice}
        </p>
      )}

      {effectiveMode === "signup" && (
        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 leading-relaxed">
          Hesabınızı oluşturun. E-posta adresiniz ve kullanıcı adınız ekip erişim listesinde varsa
          AF Operasyon’a katılırsınız.
        </p>
      )}

      <form action={action} className="space-y-3">
        {effectiveMode === "signup" && (
          <div>
            <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1">
              Ad Soyad
            </label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              autoComplete="name"
              defaultValue={initialName}
              placeholder="Ad Soyad"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        )}

        {effectiveMode === "signup" ? (
          <>
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                Kullanıcı adı
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                placeholder="Kullanıcı adı"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                E-posta
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                defaultValue={initialEmail}
                placeholder="E-posta"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </>
        ) : (
          <div>
            <label htmlFor="identifier" className="block text-sm font-medium text-gray-700 mb-1">
              Kullanıcı adı veya e-posta
            </label>
            <input
              id="identifier"
              name="identifier"
              type="text"
              autoComplete="username"
              required
              defaultValue={initialEmail}
              placeholder="Kullanıcı adı veya e-posta"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        )}

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Şifre
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={effectiveMode === "signin" ? "current-password" : "new-password"}
            required
            placeholder="Şifre"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {state?.error != null && (
          <p className="text-sm bg-red-50 border border-red-200 px-3 py-2 rounded-lg" style={{ color: '#b91c1c' }}>
            {state.error || "İşlem tamamlanamadı. Lütfen tekrar deneyin."}
          </p>
        )}

        {state?.success && effectiveMode === "signup" && (
          <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">
            Hesabınız oluşturuldu. Giriş yapabilirsiniz.
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {pending
            ? effectiveMode === "signin"
              ? "Giriş yapılıyor…"
              : "Hesap oluşturuluyor…"
            : effectiveMode === "signin"
              ? "Giriş yap"
              : "Hesap oluştur"}
        </button>
      </form>

      {process.env.NODE_ENV === "development" && (
        <p className="text-xs text-center text-gray-400">
          Local dev:{" "}
          <code className="font-mono bg-gray-100 px-1 rounded">alice@taskos.local</code> /{" "}
          <code className="font-mono bg-gray-100 px-1 rounded">TaskOS2024!</code>
        </p>
      )}
    </div>
  );
}
